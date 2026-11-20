/**
 * Pure controllers and state machines for Phase P1.5 Live video mode:
 * - Camera mode state machine (Live video vs Scan pages) + localStorage persistence
 * - 1 fps frame cadence controller (stops on pause, hidden tab, disconnect, or scan mode)
 * - 10-minute idle cost guard + 30-second confirmation timeout
 * - Safe resource teardown guaranteeing MediaStream tracks are always released
 * - Gemini orb state derivation (listening | thinking | speaking)
 */

export type RelayCameraMode = 'live' | 'scan'

export type GeminiOrbState = 'listening' | 'thinking' | 'speaking'

export const RELAY_MODE_STORAGE_KEY = 'sarvam.relay.mode'
export const LIVE_FRAME_INTERVAL_MS = 1000
export const LIVE_FRAME_MAX_EDGE_PX = 768
export const LIVE_FRAME_JPEG_QUALITY = 0.6
export const IDLE_PROMPT_MS = 10 * 60 * 1000 // 10 minutes
export const IDLE_GRACE_MS = 30 * 1000 // 30 seconds

export interface StorageLike {
  getItem(key: string): string | null
  setItem(key: string, value: string): void
}

export function loadSavedRelayMode(storage?: StorageLike | null): RelayCameraMode {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
    const raw = store?.getItem(RELAY_MODE_STORAGE_KEY)
    if (raw === 'scan' || raw === 'live') {
      return raw
    }
  } catch {
    // Ignore storage errors (private browsing / restricted storage)
  }
  return 'live'
}

export function saveRelayMode(mode: RelayCameraMode, storage?: StorageLike | null): void {
  try {
    const store = storage ?? (typeof localStorage !== 'undefined' ? localStorage : null)
    store?.setItem(RELAY_MODE_STORAGE_KEY, mode)
  } catch {
    // Ignore storage errors
  }
}

export interface CameraModeMachineState {
  mode: RelayCameraMode
  streamActive: boolean
  videoPaused: boolean
  geminiRequested: boolean
}

export function createCameraModeState(initialMode: RelayCameraMode = 'live'): CameraModeMachineState {
  return {
    mode: initialMode,
    streamActive: true,
    videoPaused: false,
    geminiRequested: initialMode === 'live',
  }
}

/**
 * Switching modes NEVER ends the camera stream.
 */
export function transitionCameraMode(
  state: CameraModeMachineState,
  nextMode: RelayCameraMode,
): CameraModeMachineState {
  if (state.mode === nextMode) return state
  return {
    ...state,
    mode: nextMode,
    streamActive: state.streamActive, // Always preserved across mode switches
    geminiRequested: state.geminiRequested || nextMode === 'live',
  }
}

export function deriveGeminiOrbState(input: {
  isSpeaking: boolean
  isThinking: boolean
  isLive: boolean
}): GeminiOrbState {
  if (input.isSpeaking) return 'speaking'
  if (input.isThinking) return 'thinking'
  return 'listening'
}

// ── Frame Cadence Controller (1 fps) ─────────────────────────────────

export interface IntervalTimerApi {
  setInterval: (fn: () => void, ms: number) => unknown
  clearInterval: (id: unknown) => void
}

export interface FrameCadenceFlags {
  mode: RelayCameraMode
  videoPaused: boolean
  tabHidden: boolean
  socketConnected: boolean
  videoReady: boolean
}

export class FrameCadenceController {
  private flags: FrameCadenceFlags
  private intervalId: unknown = null
  private framesSent = 0
  private readonly onSendFrame: () => void
  private readonly intervalMs: number
  private readonly timerApi: IntervalTimerApi

  constructor(
    onSendFrame: () => void,
    initialFlags?: Partial<FrameCadenceFlags>,
    options?: { intervalMs?: number; timerApi?: IntervalTimerApi },
  ) {
    this.onSendFrame = onSendFrame
    this.intervalMs = options?.intervalMs ?? LIVE_FRAME_INTERVAL_MS
    this.timerApi = options?.timerApi ?? {
      setInterval: (fn, ms) => setInterval(fn, ms),
      clearInterval: (id) => clearInterval(id as ReturnType<typeof setInterval>),
    }
    this.flags = {
      mode: 'live',
      videoPaused: false,
      tabHidden: false,
      socketConnected: false,
      videoReady: false,
      ...initialFlags,
    }
    this.sync()
  }

  shouldSend(): boolean {
    return (
      this.flags.mode === 'live' &&
      !this.flags.videoPaused &&
      !this.flags.tabHidden &&
      this.flags.socketConnected &&
      this.flags.videoReady
    )
  }

  isRunning(): boolean {
    return this.intervalId !== null
  }

  getFramesSent(): number {
    return this.framesSent
  }

  update(partial: Partial<FrameCadenceFlags>): void {
    this.flags = { ...this.flags, ...partial }
    this.sync()
  }

  stop(): void {
    if (this.intervalId !== null) {
      this.timerApi.clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  private sync(): void {
    if (this.shouldSend()) {
      if (this.intervalId === null) {
        this.intervalId = this.timerApi.setInterval(() => {
          if (!this.shouldSend()) return
          this.framesSent += 1
          this.onSendFrame()
        }, this.intervalMs)
      }
    } else {
      this.stop()
    }
  }
}

// ── Idle Cost Guard (10 min silence -> prompt -> 30 s auto-end) ──────

export interface TimeoutTimerApi {
  setTimeout: (fn: () => void, ms: number) => unknown
  clearTimeout: (id: unknown) => void
}

export class IdleGuardController {
  private idleTimer: unknown = null
  private graceTimer: unknown = null
  private prompting = false
  private ended = false
  private readonly idleMs: number
  private readonly graceMs: number
  private readonly onPrompt: () => void
  private readonly onAutoEnd: () => void
  private readonly timerApi: TimeoutTimerApi

  constructor(options: {
    onPrompt: () => void
    onAutoEnd: () => void
    idleMs?: number
    graceMs?: number
    timerApi?: TimeoutTimerApi
  }) {
    this.onPrompt = options.onPrompt
    this.onAutoEnd = options.onAutoEnd
    this.idleMs = options.idleMs ?? IDLE_PROMPT_MS
    this.graceMs = options.graceMs ?? IDLE_GRACE_MS
    this.timerApi = options.timerApi ?? {
      setTimeout: (fn, ms) => setTimeout(fn, ms),
      clearTimeout: (id) => clearTimeout(id as ReturnType<typeof setTimeout>),
    }
  }

  isPrompting(): boolean {
    return this.prompting
  }

  hasEnded(): boolean {
    return this.ended
  }

  start(): void {
    this.ended = false
    this.prompting = false
    this.clearTimers()
    this.scheduleIdle()
  }

  recordActivity(): void {
    if (this.ended) return
    this.prompting = false
    this.clearTimers()
    this.scheduleIdle()
  }

  confirmStillHere(): void {
    this.recordActivity()
  }

  stop(): void {
    this.clearTimers()
    this.prompting = false
  }

  private scheduleIdle(): void {
    this.idleTimer = this.timerApi.setTimeout(() => {
      this.idleTimer = null
      this.prompting = true
      this.onPrompt()
      this.graceTimer = this.timerApi.setTimeout(() => {
        this.graceTimer = null
        this.prompting = false
        this.ended = true
        this.onAutoEnd()
      }, this.graceMs)
    }, this.idleMs)
  }

  private clearTimers(): void {
    if (this.idleTimer !== null) {
      this.timerApi.clearTimeout(this.idleTimer)
      this.idleTimer = null
    }
    if (this.graceTimer !== null) {
      this.timerApi.clearTimeout(this.graceTimer)
      this.graceTimer = null
    }
  }
}

// ── Guaranteed Track Release on End ──────────────────────────────────

export interface StoppableTrack {
  stop: () => void
  readyState?: string
}

export interface TrackContainer {
  getTracks: () => StoppableTrack[]
}

export async function releaseRelayResources(deps: {
  stopFrames?: () => void
  stopIdleGuard?: () => void
  closeClient?: () => Promise<void> | void
  stopAudio?: () => Promise<void> | void
  streams?: (TrackContainer | null | undefined)[]
  closeAudioCtx?: () => Promise<void> | void
}): Promise<{ stoppedTracks: number }> {
  let stoppedTracks = 0

  try {
    deps.stopFrames?.()
  } catch {
    // Continue teardown
  }

  try {
    deps.stopIdleGuard?.()
  } catch {
    // Continue teardown
  }

  try {
    await deps.closeClient?.()
  } catch {
    // Continue teardown
  }

  try {
    await deps.stopAudio?.()
  } catch {
    // Continue teardown
  }

  for (const stream of deps.streams || []) {
    if (!stream) continue
    try {
      for (const track of stream.getTracks()) {
        try {
          track.stop()
          stoppedTracks += 1
        } catch {
          // Continue stopping remaining tracks
        }
      }
    } catch {
      // Continue teardown
    }
  }

  try {
    await deps.closeAudioCtx?.()
  } catch {
    // Continue teardown
  }

  return { stoppedTracks }
}
