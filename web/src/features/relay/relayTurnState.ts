/**
 * RelayTurnStateController — Pure turn state machine + watchdog timers for
 * seamless Gemini Live conversations.
 *
 * States: idle, userSpeaking, thinking, modelSpeaking, interrupted, reconnecting, error.
 *
 * Watchdogs:
 * - thinking > 6 s: show "Still thinking…" and nudge if socket silent
 * - thinking > 12 s: reconnect with resumption handle and resend last user turn once
 * - thinking > 20 s: enter error ("Gemini did not answer. Try again" + Retry)
 * - modelSpeaking with 5 s no audio and no turnComplete: treat turn complete -> idle
 * - socket silence for 30 s while connected & mic active: reconnect with resumption handle
 */

export type RelayTurnState =
  | 'idle'
  | 'userSpeaking'
  | 'thinking'
  | 'modelSpeaking'
  | 'interrupted'
  | 'reconnecting'
  | 'error'

export interface RelayTurnEventLog {
  ts: number
  event: string
  state: RelayTurnState
}

export interface RelayTurnWatchdogCallbacks {
  onStateChange?: (snapshot: RelayTurnSnapshot) => void
  onStillThinkingNudge?: () => void
  onReconnectAndResend?: (lastUserText: string | null) => void
  onNoAnswerTimeout?: () => void
  onSocketSilenceReconnect?: () => void
  onModelSpeakingForceIdle?: () => void
}

export interface RelayTurnWatchdogTimings {
  stillThinkingMs?: number
  reconnectResendMs?: number
  noAnswerMs?: number
  modelAudioStallMs?: number
  socketSilenceMs?: number
}

export interface RelayTurnSnapshot {
  state: RelayTurnState
  stillThinking: boolean
  lastServerMessageAt: number
  reconnectCount: number
  recentEvents: RelayTurnEventLog[]
}

export class RelayTurnController {
  private state: RelayTurnState = 'idle'
  private stillThinking = false
  private lastServerMessageAt: number
  private reconnectCount = 0
  private lastUserTurnText: string | null = null
  private hasResentForCurrentTurn = false
  private socketActive = false
  private recentEvents: RelayTurnEventLog[] = []

  private thinkingNudgeTimer: ReturnType<typeof setTimeout> | null = null
  private thinkingReconnectTimer: ReturnType<typeof setTimeout> | null = null
  private thinkingErrorTimer: ReturnType<typeof setTimeout> | null = null
  private modelStallTimer: ReturnType<typeof setTimeout> | null = null
  private socketSilenceTimer: ReturnType<typeof setTimeout> | null = null

  private readonly cb: RelayTurnWatchdogCallbacks
  private readonly stillThinkingMs: number
  private readonly reconnectResendMs: number
  private readonly noAnswerMs: number
  private readonly modelAudioStallMs: number
  private readonly socketSilenceMs: number
  private readonly now: () => number

  constructor(
    callbacks: RelayTurnWatchdogCallbacks = {},
    timings: RelayTurnWatchdogTimings = {},
    nowFn: () => number = () => Date.now(),
  ) {
    this.cb = callbacks
    this.stillThinkingMs = timings.stillThinkingMs ?? 6000
    this.reconnectResendMs = timings.reconnectResendMs ?? 12000
    this.noAnswerMs = timings.noAnswerMs ?? 20000
    this.modelAudioStallMs = timings.modelAudioStallMs ?? 5000
    this.socketSilenceMs = timings.socketSilenceMs ?? 30000
    this.now = nowFn
    this.lastServerMessageAt = this.now()
  }

  getSnapshot(): RelayTurnSnapshot {
    return {
      state: this.state,
      stillThinking: this.stillThinking,
      lastServerMessageAt: this.lastServerMessageAt,
      reconnectCount: this.reconnectCount,
      recentEvents: [...this.recentEvents],
    }
  }

  setSocketActive(active: boolean): void {
    this.socketActive = active
    if (active) {
      this.lastServerMessageAt = this.now()
      this.armSocketSilenceWatchdog()
    } else {
      this.clearSocketSilenceWatchdog()
    }
  }

  recordServerMessage(): void {
    this.lastServerMessageAt = this.now()
    if (this.socketActive) {
      this.armSocketSilenceWatchdog()
    }
  }

  onUserSpeechStart(): void {
    this.clearThinkingWatchdogs()
    this.clearModelStallWatchdog()
    this.stillThinking = false
    this.transition('userSpeaking', 'userSpeechStart')
  }

  onUserSpeechEnd(lastText?: string | null): void {
    if (lastText && lastText.trim()) {
      this.lastUserTurnText = lastText.trim()
    }
    this.stillThinking = false
    this.hasResentForCurrentTurn = false
    this.transition('thinking', 'userSpeechEnd')
    this.armThinkingWatchdogs()
  }

  onUserTextSent(text: string): void {
    this.lastUserTurnText = text.trim() || null
    this.stillThinking = false
    this.hasResentForCurrentTurn = false
    this.clearModelStallWatchdog()
    this.transition('thinking', 'userTextSent')
    this.armThinkingWatchdogs()
  }

  onModelOutput(isAudio = true): void {
    this.recordServerMessage()
    this.clearThinkingWatchdogs()
    this.stillThinking = false
    this.hasResentForCurrentTurn = false
    if (this.state !== 'modelSpeaking') {
      this.transition('modelSpeaking', isAudio ? 'modelAudio' : 'modelText')
    }
    if (isAudio) {
      this.armModelStallWatchdog()
    }
  }

  onTurnComplete(): void {
    this.recordServerMessage()
    this.clearThinkingWatchdogs()
    this.clearModelStallWatchdog()
    this.stillThinking = false
    this.hasResentForCurrentTurn = false
    this.transition('idle', 'turnComplete')
  }

  onRealInterrupt(): void {
    this.recordServerMessage()
    this.clearThinkingWatchdogs()
    this.clearModelStallWatchdog()
    this.stillThinking = false
    this.transition('interrupted', 'realInterrupt')
  }

  onReconnecting(): void {
    this.reconnectCount += 1
    this.clearModelStallWatchdog()
    this.clearSocketSilenceWatchdog()
    this.transition('reconnecting', 'reconnecting')
  }

  onReconnected(): void {
    this.lastServerMessageAt = this.now()
    this.socketActive = true
    this.armSocketSilenceWatchdog()
    if (this.state === 'reconnecting') {
      this.transition('idle', 'reconnected')
    } else {
      this.recordEvent('reconnected')
      this.emit()
    }
  }

  onError(reason = 'error'): void {
    this.clearAllTimers()
    this.stillThinking = false
    this.transition('error', reason)
  }

  resetToIdle(): void {
    this.clearThinkingWatchdogs()
    this.clearModelStallWatchdog()
    this.stillThinking = false
    this.hasResentForCurrentTurn = false
    this.transition('idle', 'reset')
  }

  stop(): void {
    this.socketActive = false
    this.clearAllTimers()
  }

  // ── Internal ───────────────────────────────────────────────────────

  private transition(next: RelayTurnState, event: string): void {
    this.state = next
    this.recordEvent(event)
    this.emit()
  }

  private recordEvent(event: string): void {
    this.recentEvents.push({ ts: this.now(), event, state: this.state })
    if (this.recentEvents.length > 5) {
      this.recentEvents.shift()
    }
  }

  private emit(): void {
    this.cb.onStateChange?.(this.getSnapshot())
  }

  private armThinkingWatchdogs(): void {
    this.clearThinkingWatchdogs()

    this.thinkingNudgeTimer = setTimeout(() => {
      if (this.state !== 'thinking') return
      this.stillThinking = true
      this.recordEvent('watchdog:stillThinking-6s')
      this.emit()
      if (this.now() - this.lastServerMessageAt >= this.stillThinkingMs - 500) {
        this.cb.onStillThinkingNudge?.()
      }
    }, this.stillThinkingMs)

    this.thinkingReconnectTimer = setTimeout(() => {
      if (this.state !== 'thinking' || this.hasResentForCurrentTurn) return
      this.hasResentForCurrentTurn = true
      this.recordEvent('watchdog:reconnect-12s')
      this.emit()
      this.cb.onReconnectAndResend?.(this.lastUserTurnText)
    }, this.reconnectResendMs)

    this.thinkingErrorTimer = setTimeout(() => {
      if (this.state !== 'thinking') return
      this.clearThinkingWatchdogs()
      this.stillThinking = false
      this.transition('error', 'watchdog:noAnswer-20s')
      this.cb.onNoAnswerTimeout?.()
    }, this.noAnswerMs)
  }

  private armModelStallWatchdog(): void {
    this.clearModelStallWatchdog()
    this.modelStallTimer = setTimeout(() => {
      if (this.state !== 'modelSpeaking') return
      this.transition('idle', 'watchdog:modelAudioStall-5s')
      this.cb.onModelSpeakingForceIdle?.()
    }, this.modelAudioStallMs)
  }

  private armSocketSilenceWatchdog(): void {
    this.clearSocketSilenceWatchdog()
    if (!this.socketActive) return
    this.socketSilenceTimer = setTimeout(() => {
      if (!this.socketActive) return
      if (this.state === 'idle' || this.state === 'userSpeaking') {
        this.recordEvent('watchdog:socketSilence-30s')
        this.emit()
        this.cb.onSocketSilenceReconnect?.()
      }
    }, this.socketSilenceMs)
  }

  private clearThinkingWatchdogs(): void {
    if (this.thinkingNudgeTimer) {
      clearTimeout(this.thinkingNudgeTimer)
      this.thinkingNudgeTimer = null
    }
    if (this.thinkingReconnectTimer) {
      clearTimeout(this.thinkingReconnectTimer)
      this.thinkingReconnectTimer = null
    }
    if (this.thinkingErrorTimer) {
      clearTimeout(this.thinkingErrorTimer)
      this.thinkingErrorTimer = null
    }
  }

  private clearModelStallWatchdog(): void {
    if (this.modelStallTimer) {
      clearTimeout(this.modelStallTimer)
      this.modelStallTimer = null
    }
  }

  private clearSocketSilenceWatchdog(): void {
    if (this.socketSilenceTimer) {
      clearTimeout(this.socketSilenceTimer)
      this.socketSilenceTimer = null
    }
  }

  private clearAllTimers(): void {
    this.clearThinkingWatchdogs()
    this.clearModelStallWatchdog()
    this.clearSocketSilenceWatchdog()
  }
}
