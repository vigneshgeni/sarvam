/**
 * Speech synthesis utilities for Sarvam document audio readout.
 * Handles:
 * - Voice discovery & async loading (voiceschanged)
 * - Logging available ta-IN, hi-IN, en-IN, te-IN, ml-IN, kn-IN voices
 * - Exact language matching then language prefix matching
 * - Chunking long text into sentence segments (<= 180 chars) to prevent browser timeouts
 * - Quick summary and full details script generation
 */

import type { ExplainResponse } from '../types'

/**
 * Filter and log available voices to browser console.
 */
export function logTargetVoices(voices: SpeechSynthesisVoice[]): void {
  const targetPrefixes = ['ta-in', 'hi-in', 'en-in', 'te-in', 'ml-in', 'kn-in', 'ta', 'hi', 'en', 'te', 'ml', 'kn']
  const targetVoices = voices.filter((v) => {
    const l = v.lang.toLowerCase().replace('_', '-')
    return targetPrefixes.some((p) => l.startsWith(p))
  })

  console.log(
    `[SpeechSynthesis] Total available voices: ${voices.length}. Matching target voices:`,
    targetVoices.map((v) => ({ name: v.name, lang: v.lang, default: v.default, localService: v.localService }))
  )
}

/**
 * Finds the best matching SpeechSynthesisVoice for a target language code.
 * Checks exact match first (e.g. 'ta-in'), then language prefix ('ta').
 */
export function findVoiceForLanguage(
  voices: SpeechSynthesisVoice[],
  lang: string
): SpeechSynthesisVoice | null {
  if (!voices || voices.length === 0) return null

  const normalizedLang = lang.toLowerCase().replace('_', '-')

  const preferredCodes: Record<string, string[]> = {
    ta: ['ta-in', 'ta'],
    hi: ['hi-in', 'hi'],
    en: ['en-in', 'en-gb', 'en-us', 'en'],
    te: ['te-in', 'te'],
    ml: ['ml-in', 'ml'],
    kn: ['kn-in', 'kn'],
  }

  const candidates = preferredCodes[normalizedLang] || [normalizedLang]

  for (const code of candidates) {
    const match = voices.find((v) => v.lang.toLowerCase().replace('_', '-') === code)
    if (match) return match
  }

  const prefix = normalizedLang.slice(0, 2)
  const prefixMatch = voices.find((v) =>
    v.lang.toLowerCase().replace('_', '-').startsWith(prefix)
  )
  if (prefixMatch) return prefixMatch

  return null
}

/**
 * Splits document readout text into sentence chunks (each <= 180 chars).
 */
export function splitIntoUtteranceChunks(text: string, maxChunkLength = 180): string[] {
  if (!text) return []

  const rawSentences = text
    .split(/([.!?।\n]+)/)
    .reduce<string[]>((acc, part, idx, arr) => {
      if (idx % 2 === 0) {
        const punctuation = arr[idx + 1] || ''
        const full = (part + punctuation).trim()
        if (full) acc.push(full)
      }
      return acc
    }, [])

  const chunks: string[] = []

  for (const sentence of rawSentences) {
    if (sentence.length <= maxChunkLength) {
      chunks.push(sentence)
    } else {
      const words = sentence.split(/\s+/)
      let currentChunk = ''

      for (const word of words) {
        if (!currentChunk) {
          currentChunk = word
        } else if ((currentChunk + ' ' + word).length <= maxChunkLength) {
          currentChunk += ' ' + word
        } else {
          chunks.push(currentChunk)
          currentChunk = word
        }
      }

      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
    }
  }

  return chunks
}

/**
 * Builds the Quick Summary script (WEB-9):
 * Uses result.spoken_summary if present; otherwise builds a local script
 * from title + first action + glance key values.
 */
export function buildQuickSummaryScript(result: ExplainResponse, lang: string): string {
  if (result.spoken_summary && result.spoken_summary.trim().length > 0) {
    return result.spoken_summary
  }

  const parts: string[] = []
  if (result.title) parts.push(result.title)

  if (result.glance && result.glance.headline) {
    parts.push(result.glance.headline)
  }

  if (result.glance?.key_values && result.glance.key_values.length > 0) {
    const kvText = result.glance.key_values
      .map((kv) => `${kv.label}: ${kv.value}`)
      .join('. ')
    parts.push(kvText)
  }

  if (result.actions && result.actions.length > 0) {
    const firstAction = result.actions[0]
    if (lang === 'ta') {
      parts.push(`முக்கிய நடவடிக்கை: ${firstAction.text}`)
    } else if (lang === 'hi') {
      parts.push(`मुख्य कार्रवाई: ${firstAction.text}`)
    } else {
      parts.push(`Main action: ${firstAction.text}`)
    }
  }

  return parts.join('. ')
}

/**
 * Builds the complete spoken text script from an ExplainResponse.
 */
export function buildSpokenText(result: ExplainResponse): string {
  const parts: string[] = []

  if (result.title) {
    parts.push(result.title)
  }

  if (result.summary && result.summary.length > 0) {
    parts.push(result.summary.join('. '))
  }

  if (result.actions && result.actions.length > 0) {
    parts.push(result.actions.map((a) => a.text).join('. '))
  }

  if (result.warnings && result.warnings.length > 0) {
    parts.push(result.warnings.map((w) => w.text).join('. '))
  }

  if (result.facts && result.facts.length > 0) {
    parts.push(result.facts.map((f) => f.text).join('. '))
  }

  return parts.join('\n\n')
}
