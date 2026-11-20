/**
 * TranscriptAssembler — Single source of truth for Live Relay captions.
 *
 * Rules:
 * - Merges streaming fragments per turn.
 * - Buffers user input transcription and shows a "You" line ONLY after the user's
 *   turn ends, dropping any fragments that arrive while the local mic gate was closed.
 * - Applies sanitizeCaption (from P1.6) to every input and output line.
 * - Drops a user line if it has < 2 words AND the gate heard < 400 ms of speech.
 * - Streams Gemini's bubble live and finalises on turnComplete.
 * - Marks a genuinely interrupted Gemini answer with an ellipsis ("…"), never as complete.
 */

import { sanitizeCaption } from './captionSanitizer.js'
import type { CaptionTurn } from './RelaySpikeScreen.js'

export interface ExtendedCaptionTurn extends CaptionTurn {
  interrupted?: boolean
  speakerLang?: string
  ts?: number
}

function wordCount(text: string): number {
  const parts = text.trim().split(/\s+/).filter(Boolean)
  return parts.length
}

export class TranscriptAssembler {
  private turns: ExtendedCaptionTurn[] = []
  private pendingInputRaw = ''
  private pendingInputSpeaker = 'You'
  private pendingInputLang?: string
  private activeOutputId: string | null = null
  private activeOutputRaw = ''
  private seq = 0
  private readonly maxTurns: number

  constructor(maxTurns = 50) {
    this.maxTurns = maxTurns
  }

  getTurns(): ExtendedCaptionTurn[] {
    return this.turns.map((turn) => ({ ...turn }))
  }

  /**
   * Append an input transcription fragment.
   * Dropped if gate was not recently open (gateActive === false).
   */
  pushInputFragment(
    rawFragment: string,
    opts: { gateActive: boolean; speaker?: string; lang?: string },
  ): boolean {
    if (!opts.gateActive) {
      return false
    }
    if (!rawFragment) return false
    if (opts.speaker) {
      this.pendingInputSpeaker = opts.speaker
    }
    if (opts.lang) {
      this.pendingInputLang = opts.lang
    }
    this.pendingInputRaw += rawFragment
    return true
  }

  /**
   * Finalize the buffered user turn once the user stops speaking (or when Gemini starts replying).
   * Returns the emitted CaptionTurn, or null if dropped as noise/too short.
   */
  commitUserTurn(speechDurationMs: number): ExtendedCaptionTurn | null {
    const raw = this.pendingInputRaw
    const speaker = this.pendingInputSpeaker || 'You'
    const lang = this.pendingInputLang
    this.pendingInputRaw = ''

    if (!raw) return null
    const cleaned = sanitizeCaption(raw, 'input')
    if (!cleaned) return null

    // Drop very short bursts (< 2 words AND < 400 ms speech)
    if (wordCount(cleaned) < 2 && speechDurationMs < 400) {
      return null
    }

    const turn: ExtendedCaptionTurn = {
      id: `user-${++this.seq}-${Date.now()}`,
      who: speaker,
      text: cleaned,
      isComplete: true,
      speakerLang: lang,
      ts: Date.now(),
    }
    this.turns = [...this.turns.slice(-(this.maxTurns - 1)), turn]
    return turn
  }

  /** Add a typed user message directly (bypassing mic gate). */
  addTypedUserTurn(text: string, speaker = 'You', lang?: string): ExtendedCaptionTurn | null {
    const cleaned = sanitizeCaption(text, 'input')
    if (!cleaned) return null
    const turn: ExtendedCaptionTurn = {
      id: `user-${++this.seq}-${Date.now()}`,
      who: speaker,
      text: cleaned,
      isComplete: true,
      speakerLang: lang,
      ts: Date.now(),
    }
    this.turns = [...this.turns.slice(-(this.maxTurns - 1)), turn]
    return turn
  }

  /**
   * Stream a Gemini output transcription fragment.
   * Automatically commits any pending user turn first.
   */
  pushOutputFragment(rawFragment: string, lastUserSpeechMs = 500): ExtendedCaptionTurn | null {
    if (this.pendingInputRaw) {
      this.commitUserTurn(lastUserSpeechMs)
    }
    if (!rawFragment) return null

    const candidate = this.activeOutputRaw + rawFragment
    const cleaned = sanitizeCaption(candidate, 'output')
    if (!cleaned) {
      this.activeOutputRaw = candidate
      return null
    }

    this.activeOutputRaw = candidate
    if (!this.activeOutputId) {
      const id = `gemini-${++this.seq}-${Date.now()}`
      this.activeOutputId = id
      const turn: ExtendedCaptionTurn = {
        id,
        who: 'Gemini',
        text: cleaned,
        isComplete: false,
        ts: Date.now(),
      }
      this.turns = [...this.turns.slice(-(this.maxTurns - 1)), turn]
      return turn
    }

    let updated: ExtendedCaptionTurn | null = null
    this.turns = this.turns.map((turn) => {
      if (turn.id === this.activeOutputId) {
        updated = { ...turn, text: cleaned }
        return updated
      }
      return turn
    })
    return updated
  }

  /** Finalise the active Gemini bubble on turnComplete. */
  completeModelTurn(): ExtendedCaptionTurn | null {
    if (!this.activeOutputId) return null
    const id = this.activeOutputId
    this.activeOutputId = null
    this.activeOutputRaw = ''
    let done: ExtendedCaptionTurn | null = null
    this.turns = this.turns.map((turn) => {
      if (turn.id === id) {
        done = { ...turn, isComplete: true }
        return done
      }
      return turn
    })
    return done
  }

  /**
   * Mark an interrupted Gemini answer with an ellipsis ("…"),
   * keeping interrupted=true so the UI does not treat it as a finished answer.
   */
  interruptModelTurn(): ExtendedCaptionTurn | null {
    if (!this.activeOutputId) return null
    const id = this.activeOutputId
    this.activeOutputId = null
    this.activeOutputRaw = ''
    let cut: ExtendedCaptionTurn | null = null
    this.turns = this.turns.map((turn) => {
      if (turn.id === id) {
        const trimmed = turn.text.replace(/[.\s…]+$/, '')
        cut = {
          ...turn,
          text: trimmed ? `${trimmed}…` : '…',
          isComplete: false,
          interrupted: true,
        }
        return cut
      }
      return turn
    })
    return cut
  }

  /** Clear pending input without emitting (e.g., cancelled noise). */
  discardPendingInput(): void {
    this.pendingInputRaw = ''
  }

  reset(): void {
    this.turns = []
    this.pendingInputRaw = ''
    this.activeOutputId = null
    this.activeOutputRaw = ''
  }
}
