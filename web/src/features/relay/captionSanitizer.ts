/**
 * Caption sanitization for Gemini Live input and output transcriptions.
 *
 * Rules:
 * - Strip leading speaker notes such as "(Arun is speaking, English)".
 * - Remove empty bracket / noise placeholder tokens: "{}", "[]", "()", "<noise>", etc.
 * - Remove emoji and pictographs (including variation selectors & ZWJ sequences).
 * - Collapse consecutive whitespace and trim.
 * - Require at least 2 Unicode letters (\p{L}); otherwise return "" (do not show a bubble).
 *   Example choice: "{} esto hora 500 {}" -> "esto hora 500" (8 letters >= 2 -> kept);
 *   "{}", "⚡", "123 456", "a" -> "" (dropped).
 */

import { stripSpeakerNotes } from './live/relayPrompt.js'

export type CaptionKind = 'input' | 'output'

// Noise/control tokens commonly emitted by ASR or models
const NOISE_TAG_RE = /<\s*(?:noise|silence|inaudible|laughter|music|applause|cough|sigh|breath|unk|unknown|crosstalk)[^>]*>/gi
const EMPTY_BRACKETS_RE = /\{\s*\}|\[\s*\]|\(\s*\)/g
// Emoji, pictographs, dingbats, symbols, variation selectors, keycap combining marks
const EMOJI_RE =
  /(?:[\u{1F1E6}-\u{1F1FF}]{2})|(?:[#*0-9]\uFE0F?\u20E3)|(?:\p{Extended_Pictographic}(?:\uFE0F|\u200D\p{Extended_Pictographic})*)|[\u2600-\u27BF\uFE0F\u200D]/gu
const LETTER_RE = /\p{L}/gu

export function countLetters(text: string): number {
  const matches = text.match(LETTER_RE)
  return matches ? matches.length : 0
}

export function sanitizeCaption(text: string, _kind: CaptionKind = 'output'): string {
  if (!text) return ''

  let cleaned = stripSpeakerNotes(text)
  cleaned = cleaned.replace(NOISE_TAG_RE, ' ')
  cleaned = cleaned.replace(EMPTY_BRACKETS_RE, ' ')
  cleaned = cleaned.replace(EMOJI_RE, ' ')
  // Remove stray empty braces/brackets left around tokens like "{} text {}"
  cleaned = cleaned.replace(/[{}[\]]+/g, ' ')
  cleaned = cleaned.replace(/\s+/g, ' ').trim()

  if (countLetters(cleaned) < 2) {
    return ''
  }

  return cleaned
}

/**
 * Returns true if an input transcription arriving while Gemini audio is playing
 * should be suppressed as echo or background noise.
 */
export function shouldDropInputDuringPlayback(
  rawText: string,
  isGeminiAudioPlaying: boolean,
): boolean {
  const sanitized = sanitizeCaption(rawText, 'input')
  if (!sanitized) return true
  if (isGeminiAudioPlaying && countLetters(sanitized) < 4) {
    return true
  }
  return false
}
