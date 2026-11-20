/**
 * SpeakerNoteTracker & Caption Broadcast Schema (P3).
 *
 * - Debounces LiveKit ActiveSpeakersChanged by 600 ms.
 * - Emits one fixed short speaker note "(Name is speaking, Language)" whenever
 *   the active speaker changes (sent with turnComplete = false).
 * - Formats and validates reliable caption broadcasts {type:'caption', id, speaker, lang, text, ts}
 *   applying P1.6 sanitizeCaption before showing or broadcasting.
 */

import { sanitizeCaption } from '../captionSanitizer.js'

export interface ActiveSpeakerCandidate {
  identity: string
  name: string
  lang: string
}

export interface CaptionBroadcastPayload {
  type: 'caption'
  id: string
  speaker: string
  lang: string
  text: string
  ts: number
}

const LANG_NAMES: Record<string, string> = {
  en: 'English',
  ta: 'Tamil',
  hi: 'Hindi',
  te: 'Telugu',
  ml: 'Malayalam',
  kn: 'Kannada',
  mr: 'Marathi',
  bn: 'Bengali',
  or: 'Odia',
  auto: 'English',
}

export function languageDisplayName(code: string): string {
  const clean = (code || 'en').trim().toLowerCase()
  return LANG_NAMES[clean] || code || 'English'
}

export function formatSpeakerNote(name: string, langCode: string): string {
  const cleanName = (name || 'Guest').trim()
  const langName = languageDisplayName(langCode)
  return `(${cleanName} is speaking, ${langName})`
}

export function buildCaptionBroadcast(input: {
  id: string
  speaker: string
  lang: string
  text: string
  ts?: number
  kind?: 'input' | 'output'
}): CaptionBroadcastPayload | null {
  const cleaned = sanitizeCaption(input.text, input.kind || 'output')
  if (!cleaned) return null
  return {
    type: 'caption',
    id: input.id,
    speaker: (input.speaker || 'Gemini').trim(),
    lang: (input.lang || 'en').trim(),
    text: cleaned,
    ts: input.ts ?? Date.now(),
  }
}

export class SpeakerNoteTracker {
  private readonly debounceMs: number
  private readonly onSpeakerNote: (note: string, speaker: ActiveSpeakerCandidate) => void
  private activeSpeaker: ActiveSpeakerCandidate | null = null
  private lastEmittedIdentity: string | null = null
  private pendingTimer: ReturnType<typeof setTimeout> | null = null
  private pendingCandidate: ActiveSpeakerCandidate | null = null

  constructor(
    onSpeakerNote: (note: string, speaker: ActiveSpeakerCandidate) => void,
    debounceMs = 600,
  ) {
    this.onSpeakerNote = onSpeakerNote
    this.debounceMs = debounceMs
  }

  getCurrentSpeaker(): ActiveSpeakerCandidate | null {
    return this.activeSpeaker
  }

  updateActiveSpeakers(speakers: ActiveSpeakerCandidate[]): void {
    const primary = speakers[0]
    if (!primary) return
    this.activeSpeaker = primary

    if (primary.identity === this.lastEmittedIdentity) {
      if (this.pendingTimer) {
        clearTimeout(this.pendingTimer)
        this.pendingTimer = null
        this.pendingCandidate = null
      }
      return
    }

    if (this.pendingCandidate?.identity === primary.identity) {
      return
    }

    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
    }
    this.pendingCandidate = primary
    this.pendingTimer = setTimeout(() => {
      const candidate = this.pendingCandidate
      this.pendingTimer = null
      this.pendingCandidate = null
      if (!candidate || candidate.identity === this.lastEmittedIdentity) return
      this.lastEmittedIdentity = candidate.identity
      this.activeSpeaker = candidate
      this.onSpeakerNote(formatSpeakerNote(candidate.name, candidate.lang), candidate)
    }, this.debounceMs)
  }

  reset(): void {
    if (this.pendingTimer) {
      clearTimeout(this.pendingTimer)
      this.pendingTimer = null
    }
    this.pendingCandidate = null
    this.activeSpeaker = null
    this.lastEmittedIdentity = null
  }
}
