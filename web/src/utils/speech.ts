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

/** Expand titles only in the audio script, leaving the document result untouched. */
export function prepareTextForSpeech(text: string, lang: string): string {
  const doctorByLanguage: Record<string, string> = {
    en: 'Doctor',
    ta: 'டாக்டர்',
    hi: 'डॉक्टर',
    te: 'డాక్టర్',
    ml: 'ഡോക്ടർ',
    kn: 'ಡಾಕ್ಟರ್',
  }
  const language = lang.toLowerCase().split('-')[0]
  const doctor = doctorByLanguage[language] || doctorByLanguage.en

  return text
    .replace(/\bDr\.?(?=\s+\p{L})/gu, doctor)
    .replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g, '$1')
}

const ABBR_PATTERN = /(?<!\p{L})(?:rs|no|dr|mr|mrs|ms|smt|sri|shri|st|pvt|ltd|approx|appx|dept|est|vs|vol|ரூ|रु|क्र|सं)\./giu

/**
 * Splits document readout text into natural sentences.
 * Protects abbreviations (Rs., No., Dr., Mr., Mrs., Smt., Sri, St., Pvt., Ltd., approx.),
 * initials (R. Kumar), decimals (48,500.00), and dates (30.11.2026).
 * Handles Indian danda (।) and double danda (॥).
 */
export function splitIntoSentences(text: string): string[] {
  if (!text) return []

  // Protect decimals: 48,500.00 or 9.2
  let s = text.replace(/(\d)\.(\d)/g, '$1<NUMDOT>$2')

  // Protect abbreviations
  s = s.replace(ABBR_PATTERN, (m) => m.slice(0, -1) + '<ABBRDOT>')

  // Protect single uppercase initials: e.g. "R. Kumar" or "A. Meena"
  s = s.replace(/(?<!\p{L})([A-Z])\.(?=\s+\p{L})/gu, '$1<INITDOT>')

  // Protect e.g. / i.e. / a.m. / p.m.
  s = s.replace(/\b([a-z])\.([a-z])\./gi, '$1<ABBRDOT>$2<ABBRDOT>')

  // Split on [.!?।॥\n]+ followed by whitespace or end of string
  const parts = s.split(/([.!?।॥\n]+(?:\s+|$))/)
  const sentences: string[] = []

  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i]
    const punct = parts[i + 1] || ''
    const full = (chunk + punct).trim()
      .replace(/<NUMDOT>/g, '.')
      .replace(/<ABBRDOT>/g, '.')
      .replace(/<INITDOT>/g, '.')
    if (full) {
      sentences.push(full)
    }
  }

  return sentences
}

/**
 * Splits document readout text into sentence chunks (each <= 180 chars).
 */
export function splitIntoUtteranceChunks(text: string, maxChunkLength = 180): string[] {
  if (!text) return []

  const rawSentences = splitIntoSentences(text)

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
