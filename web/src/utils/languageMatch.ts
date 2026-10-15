import type { ExplainResponse } from '../types'

const SCRIPT: Record<string, RegExp> = {
  ta: /[\u0B80-\u0BFF]/g,
  hi: /[\u0900-\u097F]/g,
  mr: /[\u0900-\u097F]/g,
  te: /[\u0C00-\u0C7F]/g,
  kn: /[\u0C80-\u0CFF]/g,
  ml: /[\u0D00-\u0D7F]/g,
  bn: /[\u0980-\u09FF]/g,
  or: /[\u0B00-\u0B7F]/g,
}

function readingText(result: ExplainResponse): string {
  return [
    result.title,
    result.glance?.headline,
    ...(result.summary || []),
    ...(result.facts || []).map((fact) => fact.text),
    ...(result.actions || []).map((action) => action.text),
    ...(result.profile?.form_fields || []).map((field) => `${field.name || ''} ${field.instruction || ''}`),
  ]
    .filter(Boolean)
    .join(' ')
}

/** True when the explanation is not written in the language the person chose. */
export function outputNeedsTranslation(result: ExplainResponse, target: string): boolean {
  const lang = (target || '').toLowerCase().split('-')[0]
  if (!lang || lang === 'auto') return false
  const letters = readingText(result).replace(/[^\p{L}]/gu, '')
  if (letters.length < 8) return Boolean(result.language && result.language !== lang)
  if (lang === 'en') {
    const indic = (letters.match(/[\u0900-\u0D7F]/g) || []).length
    return indic / letters.length > 0.2
  }
  const script = SCRIPT[lang]
  if (!script) return result.language !== lang
  const hits = (letters.match(script) || []).length
  return hits / letters.length < 0.35
}
