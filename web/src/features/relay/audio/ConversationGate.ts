/**
 * ConversationGate — Pure local voice activity gate + playback echo ducker +
 * false barge-in guard for 20 ms 16 kHz PCM16 frames (320 samples/frame).
 *
 * Zero DOM dependencies so it is 100% deterministic in unit tests and reusable
 * per-participant in P3 multi-speaker rooms.
 */

export type GateMode = 'auto' | 'hold'

export interface ConversationGateConfig {
  /** Frame duration in ms (default 20 ms = 320 samples @ 16 kHz). */
  frameMs?: number
  /** Ambient calibration window at start (default 1500 ms). */
  calibrationMs?: number
  /** Speech start multiplier over noise floor (default 2.5). */
  startMultiplier?: number
  /** Absolute minimum RMS for speech start (default 0.015). */
  minSpeechRms?: number
  /** Consecutive speech ms required to open the gate (default 120 ms). */
  startConfirmMs?: number
  /** Silence ms below threshold before closing gate (default 700 ms). */
  hangoverMs?: number
  /** Pre-roll buffer length in ms kept before speech onset (default 300 ms). */
  preRollMs?: number
  /** Maximum age of local speech to validate a server "interrupted" event (default 400 ms). */
  interruptWindowMs?: number
  /** Minimum speech duration required to accept a real interrupt (default 200 ms). */
  minInterruptSpeechMs?: number
  /** Initial noise floor seed before calibration completes (default 0.008). */
  initialNoiseFloor?: number
}

export interface GateFrameResult {
  /** Frames to forward to Gemini (empty if gate is closed; includes pre-roll on onset). */
  framesToSend: ArrayBuffer[]
  /** Whether the gate is currently open. */
  isOpen: boolean
  /** True on the exact frame the gate transitions closed -> open. */
  speechStarted: boolean
  /** True on the exact frame the gate transitions open -> closed. */
  speechEnded: boolean
  /** Duration (ms) of the speech window that just ended (only set when speechEnded is true). */
  endedSpeechDurationMs: number
  /** RMS of the current frame (0..1). */
  rms: number
  /** Current adaptive noise floor. */
  noiseFloor: number
  /** Effective RMS threshold applied to this frame (includes playback ducking). */
  threshold: number
}

export interface ConversationGateMetrics {
  mode: GateMode
  isOpen: boolean
  rms: number
  noiseFloor: number
  threshold: number
  playbackRms: number
  isModelPlaying: boolean
  activeSpeechMs: number
  lastSpeechDurationMs: number
}

/** Computes normalized RMS (0..1) of a 16-bit signed little-endian PCM buffer. */
export function computePcm16Rms(pcm16: ArrayBuffer): number {
  const view = new Int16Array(pcm16)
  if (view.length === 0) return 0
  let sumSq = 0
  for (let i = 0; i < view.length; i++) {
    const norm = view[i] / 32768
    sumSq += norm * norm
  }
  return Math.sqrt(sumSq / view.length)
}

export class ConversationGate {
  private readonly frameMs: number
  private readonly calibrationFrames: number
  private readonly startMultiplier: number
  private readonly minSpeechRms: number
  private readonly startConfirmFrames: number
  private readonly hangoverFrames: number
  private readonly preRollFrames: number
  private readonly interruptWindowMs: number
  private readonly minInterruptSpeechMs: number

  private mode: GateMode = 'auto'
  private holding = false
  private isOpen = false
  private noiseFloor: number
  private calibrationCount = 0
  private calibrationSum = 0

  private consecutiveAbove = 0
  private consecutiveBelow = 0
  private preRoll: ArrayBuffer[] = []

  private playbackRms = 0
  private isModelPlaying = false

  private lastRms = 0
  private lastThreshold = 0
  private speechStartedAtMs: number | null = null
  private lastSpeechSeenAtMs: number | null = null
  private activeSpeechMs = 0
  private lastSpeechDurationMs = 0
  private virtualTimeMs = 0

  constructor(config: ConversationGateConfig = {}) {
    this.frameMs = config.frameMs ?? 20
    this.calibrationFrames = Math.max(1, Math.round((config.calibrationMs ?? 1500) / this.frameMs))
    this.startMultiplier = config.startMultiplier ?? 2.5
    this.minSpeechRms = config.minSpeechRms ?? 0.015
    this.startConfirmFrames = Math.max(1, Math.round((config.startConfirmMs ?? 120) / this.frameMs))
    this.hangoverFrames = Math.max(1, Math.round((config.hangoverMs ?? 700) / this.frameMs))
    this.preRollFrames = Math.max(0, Math.round((config.preRollMs ?? 300) / this.frameMs))
    this.interruptWindowMs = config.interruptWindowMs ?? 400
    this.minInterruptSpeechMs = config.minInterruptSpeechMs ?? 200
    this.noiseFloor = config.initialNoiseFloor ?? 0.008
    this.lastThreshold = Math.max(this.noiseFloor * this.startMultiplier, this.minSpeechRms)
  }

  setMode(mode: GateMode): void {
    if (this.mode === mode) return
    this.mode = mode
    this.isOpen = false
    this.holding = false
    this.consecutiveAbove = 0
    this.consecutiveBelow = 0
    this.preRoll = []
    this.speechStartedAtMs = null
    this.activeSpeechMs = 0
  }

  getMode(): GateMode {
    return this.mode
  }

  /** Used in Hold-to-Talk mode. Returns transition flags so callers can drive turn state. */
  setHolding(holding: boolean, nowMs?: number): { speechStarted: boolean; speechEnded: boolean; endedSpeechDurationMs: number } {
    const t = nowMs ?? this.virtualTimeMs
    const prev = this.holding
    this.holding = holding
    if (this.mode !== 'hold') {
      return { speechStarted: false, speechEnded: false, endedSpeechDurationMs: 0 }
    }
    if (!prev && holding) {
      this.isOpen = true
      this.speechStartedAtMs = t
      this.lastSpeechSeenAtMs = t
      this.activeSpeechMs = 0
      return { speechStarted: true, speechEnded: false, endedSpeechDurationMs: 0 }
    }
    if (prev && !holding) {
      const duration = this.speechStartedAtMs !== null ? Math.max(this.activeSpeechMs, t - this.speechStartedAtMs) : this.activeSpeechMs
      this.lastSpeechDurationMs = duration
      this.isOpen = false
      this.speechStartedAtMs = null
      this.activeSpeechMs = 0
      return { speechStarted: false, speechEnded: true, endedSpeechDurationMs: duration }
    }
    return { speechStarted: false, speechEnded: false, endedSpeechDurationMs: 0 }
  }

  setPlaybackState(isPlaying: boolean, playbackRms = 0): void {
    this.isModelPlaying = isPlaying
    this.playbackRms = isPlaying ? Math.max(0, playbackRms) : 0
  }

  computeThreshold(): number {
    const base = Math.max(this.noiseFloor * this.startMultiplier, this.minSpeechRms)
    if (!this.isModelPlaying) {
      return base
    }
    // While Gemini audio is playing, raise threshold (duck) so speaker output & room echo
    // do not open the gate; human speech must clearly exceed playback level.
    const ducked = Math.max(base * 2.0, this.playbackRms * 1.8 + 0.03)
    return ducked
  }

  processFrame(pcm16: ArrayBuffer, nowMs?: number): GateFrameResult {
    this.virtualTimeMs = nowMs ?? (this.virtualTimeMs + this.frameMs)
    const rms = computePcm16Rms(pcm16)
    this.lastRms = rms

    // Hold-to-Talk mode: send audio ONLY while held
    if (this.mode === 'hold') {
      this.lastThreshold = 0
      if (this.holding) {
        this.activeSpeechMs += this.frameMs
        this.lastSpeechSeenAtMs = this.virtualTimeMs
        return {
          framesToSend: [pcm16],
          isOpen: true,
          speechStarted: false,
          speechEnded: false,
          endedSpeechDurationMs: 0,
          rms,
          noiseFloor: this.noiseFloor,
          threshold: 0,
        }
      }
      return {
        framesToSend: [],
        isOpen: false,
        speechStarted: false,
        speechEnded: false,
        endedSpeechDurationMs: 0,
        rms,
        noiseFloor: this.noiseFloor,
        threshold: 0,
      }
    }

    // During the initial 1.5 s ambient calibration window, estimate room noise floor
    // before allowing steady ambient noise to trigger speech onset.
    if (this.calibrationCount < this.calibrationFrames && !this.isOpen && !this.isModelPlaying) {
      this.calibrationCount += 1
      this.calibrationSum += rms
      this.noiseFloor = Math.max(0.002, this.calibrationSum / this.calibrationCount)
    }

    // Auto mode: compute threshold with playback ducking
    const threshold = this.computeThreshold()
    this.lastThreshold = threshold
    const isAbove = rms > threshold

    let speechStarted = false
    let speechEnded = false
    let endedSpeechDurationMs = 0
    const framesToSend: ArrayBuffer[] = []

    if (!this.isOpen) {
      // Keep pre-roll ring buffer
      if (this.preRollFrames > 0) {
        this.preRoll.push(pcm16)
        if (this.preRoll.length > this.preRollFrames) {
          this.preRoll.shift()
        }
      }

      if (isAbove) {
        this.consecutiveAbove += 1
        if (this.consecutiveAbove >= this.startConfirmFrames) {
          this.isOpen = true
          this.consecutiveBelow = 0
          speechStarted = true
          this.speechStartedAtMs = this.virtualTimeMs - this.consecutiveAbove * this.frameMs
          this.activeSpeechMs = this.consecutiveAbove * this.frameMs
          this.lastSpeechSeenAtMs = this.virtualTimeMs
          // Flush pre-roll (includes current frame at the tail)
          if (this.preRoll.length > 0) {
            framesToSend.push(...this.preRoll)
            this.preRoll = []
          } else {
            framesToSend.push(pcm16)
          }
        }
      } else {
        this.consecutiveAbove = 0
        // Update ambient noise floor only when gate is closed & Gemini is not speaking
        if (!this.isModelPlaying) {
          if (this.calibrationCount < this.calibrationFrames) {
            this.calibrationCount += 1
            this.calibrationSum += rms
            this.noiseFloor = Math.max(0.002, this.calibrationSum / this.calibrationCount)
          } else {
            // Slow exponential moving average
            this.noiseFloor = Math.max(0.002, this.noiseFloor * 0.98 + rms * 0.02)
          }
        }
      }
    } else {
      // Gate is open — forward current frame
      framesToSend.push(pcm16)
      if (isAbove) {
        this.consecutiveBelow = 0
        this.activeSpeechMs += this.frameMs
        this.lastSpeechSeenAtMs = this.virtualTimeMs
      } else {
        this.consecutiveBelow += 1
        if (this.consecutiveBelow >= this.hangoverFrames) {
          this.isOpen = false
          this.consecutiveAbove = 0
          this.consecutiveBelow = 0
          speechEnded = true
          endedSpeechDurationMs = this.activeSpeechMs
          this.lastSpeechDurationMs = endedSpeechDurationMs
          this.speechStartedAtMs = null
          this.activeSpeechMs = 0
        }
      }
    }

    return {
      framesToSend,
      isOpen: this.isOpen,
      speechStarted,
      speechEnded,
      endedSpeechDurationMs,
      rms,
      noiseFloor: this.noiseFloor,
      threshold,
    }
  }

  /**
   * False barge-in guard:
   * Treat the server's "interrupted" event as real ONLY if the local gate also detected
   * genuine speech (>= 200 ms) within the last 400 ms (or user is holding Hold-to-Talk).
   */
  shouldAcceptServerInterrupt(nowMs?: number): boolean {
    if (this.mode === 'hold') {
      return this.holding
    }
    const t = nowMs ?? this.virtualTimeMs
    if (this.lastSpeechSeenAtMs === null) return false
    const ageMs = t - this.lastSpeechSeenAtMs
    if (ageMs > this.interruptWindowMs) return false
    const speechMs = this.isOpen ? this.activeSpeechMs : this.lastSpeechDurationMs
    return speechMs >= this.minInterruptSpeechMs
  }

  getIsOpen(): boolean {
    return this.isOpen
  }

  getLastSpeechDurationMs(): number {
    return this.isOpen ? this.activeSpeechMs : this.lastSpeechDurationMs
  }

  getMetrics(): ConversationGateMetrics {
    return {
      mode: this.mode,
      isOpen: this.isOpen,
      rms: this.lastRms,
      noiseFloor: this.noiseFloor,
      threshold: this.lastThreshold,
      playbackRms: this.playbackRms,
      isModelPlaying: this.isModelPlaying,
      activeSpeechMs: this.activeSpeechMs,
      lastSpeechDurationMs: this.lastSpeechDurationMs,
    }
  }

  reset(): void {
    this.isOpen = false
    this.holding = false
    this.consecutiveAbove = 0
    this.consecutiveBelow = 0
    this.preRoll = []
    this.speechStartedAtMs = null
    this.lastSpeechSeenAtMs = null
    this.activeSpeechMs = 0
    this.lastSpeechDurationMs = 0
  }
}
