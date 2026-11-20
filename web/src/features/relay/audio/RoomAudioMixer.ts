/**
 * RoomAudioMixer — Pure per-source gated audio mixer for P3 multi-speaker rooms.
 *
 * Design guarantees:
 * 1. Each source (host mic + every remote guest audio track) has its own independent
 *    ConversationGate BEFORE mixing, so one guest's background noise cannot hold the
 *    gate open or trigger Gemini.
 * 2. Only sources whose own gate is OPEN are mixed into the 16 kHz PCM16 stream sent
 *    to Gemini, and all gates are ducked together while Gemini is speaking.
 * 3. Anti-feedback guarantee: Gemini's output track (name === "gemini" or matching
 *    geminiOutputTrackId) is NEVER accepted into the mixer graph.
 */

import {
  ConversationGate,
  type ConversationGateConfig,
  type ConversationGateMetrics,
  type GateMode,
} from './ConversationGate.js'

export interface MixerSourceDescriptor {
  id: string
  name: string
  trackId?: string
  trackName?: string
  isHost?: boolean
}

export interface MixedFrameOutput {
  framesToSend: ArrayBuffer[]
  activeSourceIds: string[]
  anySpeechStarted: boolean
  anySpeechEnded: boolean
  endedSpeechDurationMs: number
}

/** Clamped Int16 sum of multiple 16 kHz PCM16 frames of equal length. */
export function mixPcm16Frames(frames: ArrayBuffer[]): ArrayBuffer {
  if (frames.length === 1) return frames[0]
  const views = frames.map((b) => new Int16Array(b))
  const len = Math.max(...views.map((v) => v.length))
  const out = new Int16Array(len)
  for (let i = 0; i < len; i++) {
    let sum = 0
    for (let s = 0; s < views.length; s++) {
      if (i < views[s].length) {
        sum += views[s][i]
      }
    }
    out[i] = Math.max(-32768, Math.min(32767, sum))
  }
  return out.buffer
}

interface ManagedSource {
  desc: MixerSourceDescriptor
  gate: ConversationGate
  pendingFrames: ArrayBuffer[]
}

export class RoomAudioMixerGraph {
  private readonly sources = new Map<string, ManagedSource>()
  private readonly gateConfig: ConversationGateConfig
  private geminiOutputTrackId: string | null = null
  private isGeminiPlaying = false
  private geminiPlaybackRms = 0

  constructor(gateConfig: ConversationGateConfig = {}) {
    this.gateConfig = gateConfig
  }

  /** Registers the published Gemini broadcast track ID so it can NEVER enter the mixer. */
  setGeminiOutputTrackId(trackId: string | null): void {
    this.geminiOutputTrackId = trackId
    if (trackId) {
      for (const [id, src] of this.sources.entries()) {
        if (src.desc.trackId === trackId) {
          this.sources.delete(id)
        }
      }
    }
  }

  /**
   * Adds an audio source with its own ConversationGate.
   * Returns false and refuses to connect if the source is Gemini's own audio track.
   */
  addSource(desc: MixerSourceDescriptor): boolean {
    const idLower = (desc.id || '').trim().toLowerCase()
    const nameLower = (desc.trackName || desc.name || '').trim().toLowerCase()
    if (
      idLower === 'gemini' ||
      nameLower === 'gemini' ||
      (this.geminiOutputTrackId && desc.trackId && desc.trackId === this.geminiOutputTrackId)
    ) {
      return false
    }
    if (this.sources.has(desc.id)) {
      return true
    }
    const gate = new ConversationGate(this.gateConfig)
    gate.setPlaybackState(this.isGeminiPlaying, this.geminiPlaybackRms)
    this.sources.set(desc.id, { desc, gate, pendingFrames: [] })
    return true
  }

  removeSource(sourceId: string): void {
    this.sources.delete(sourceId)
  }

  getConnectedSourceIds(): string[] {
    return Array.from(this.sources.keys())
  }

  /** Graph invariant check: must always be false. */
  hasGeminiFeedback(): boolean {
    for (const src of this.sources.values()) {
      const idLower = src.desc.id.toLowerCase()
      const trackNameLower = (src.desc.trackName || '').toLowerCase()
      if (
        idLower === 'gemini' ||
        trackNameLower === 'gemini' ||
        (this.geminiOutputTrackId && src.desc.trackId === this.geminiOutputTrackId)
      ) {
        return true
      }
    }
    return false
  }

  setHostMode(hostId: string, mode: GateMode): void {
    this.sources.get(hostId)?.gate.setMode(mode)
  }

  setHostHolding(hostId: string, holding: boolean, nowMs?: number) {
    return (
      this.sources.get(hostId)?.gate.setHolding(holding, nowMs) || {
        speechStarted: false,
        speechEnded: false,
        endedSpeechDurationMs: 0,
      }
    )
  }

  setPlaybackState(isPlaying: boolean, playbackRms = 0): void {
    this.isGeminiPlaying = isPlaying
    this.geminiPlaybackRms = playbackRms
    for (const src of this.sources.values()) {
      src.gate.setPlaybackState(isPlaying, playbackRms)
    }
  }

  processSourceFrame(sourceId: string, pcm16: ArrayBuffer, nowMs?: number): MixedFrameOutput {
    const src = this.sources.get(sourceId)
    if (!src) {
      return {
        framesToSend: [],
        activeSourceIds: [],
        anySpeechStarted: false,
        anySpeechEnded: false,
        endedSpeechDurationMs: 0,
      }
    }

    const wasAnyOpen = this.isAnyGateOpen()
    const res = src.gate.processFrame(pcm16, nowMs)
    const isNowAnyOpen = this.isAnyGateOpen()

    // Collect open frames from this source + any buffered frame from another open source
    const framesToSend: ArrayBuffer[] = []
    if (res.framesToSend.length > 0) {
      // If another source has queued frames waiting for mixing, mix pairwise
      const otherOpen = Array.from(this.sources.entries()).filter(
        ([id, s]) => id !== sourceId && s.pendingFrames.length > 0,
      )
      if (otherOpen.length === 0) {
        framesToSend.push(...res.framesToSend)
      } else {
        for (const frame of res.framesToSend) {
          const toMix: ArrayBuffer[] = [frame]
          for (const [, other] of otherOpen) {
            const nextOther = other.pendingFrames.shift()
            if (nextOther) toMix.push(nextOther)
          }
          framesToSend.push(mixPcm16Frames(toMix))
        }
      }
    }

    const activeSourceIds: string[] = []
    for (const [id, s] of this.sources.entries()) {
      if (s.gate.getIsOpen()) activeSourceIds.push(id)
    }

    return {
      framesToSend,
      activeSourceIds,
      anySpeechStarted: !wasAnyOpen && isNowAnyOpen,
      anySpeechEnded: wasAnyOpen && !isNowAnyOpen,
      endedSpeechDurationMs: res.speechEnded ? res.endedSpeechDurationMs : 0,
    }
  }

  isAnyGateOpen(): boolean {
    for (const src of this.sources.values()) {
      if (src.gate.getIsOpen()) return true
    }
    return false
  }

  shouldAcceptServerInterrupt(nowMs?: number): boolean {
    for (const src of this.sources.values()) {
      if (src.gate.shouldAcceptServerInterrupt(nowMs)) return true
    }
    return false
  }

  getSourceMetrics(sourceId: string): ConversationGateMetrics | null {
    return this.sources.get(sourceId)?.gate.getMetrics() ?? null
  }

  resetAll(): void {
    for (const src of this.sources.values()) {
      src.gate.reset()
      src.pendingFrames = []
    }
  }
}
