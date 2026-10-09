import en from './en.json'
import hi from './hi.json'
import ta from './ta.json'
import { getAppLanguage } from '../auth'

export type LfKey = keyof typeof en

const dicts: Record<string, Record<string, string>> = { en, ta, hi }

const ENGLISH_FALLBACK_LANGS = new Set(['te', 'ml', 'kn', 'auto', 'en-IN'])

export function resolveLfLang(lang?: string): string {
  const raw = (lang || getAppLanguage() || 'en').trim()
  if (raw === 'ta' || raw === 'hi' || raw === 'en') return raw
  if (ENGLISH_FALLBACK_LANGS.has(raw) || raw.startsWith('te') || raw.startsWith('ml') || raw.startsWith('kn')) {
    return 'en'
  }
  return dicts[raw] ? raw : 'en'
}

export function lfString(lang: string, key: LfKey): string {
  const resolved = resolveLfLang(lang)
  const d = dicts[resolved] || dicts.en
  const fromLang = d[key]
  if (fromLang) return fromLang
  return dicts.en[key] || String(key)
}

export function useLfT(lang?: string): (key: LfKey) => string {
  const resolved = resolveLfLang(lang)
  return (key: LfKey) => lfString(resolved, key)
}

export function i18nParityErrors(): string[] {
  const keys = Object.keys(en)
  const errors: string[] = []
  for (const loc of ['ta', 'hi'] as const) {
    const d = dicts[loc]
    for (const k of keys) {
      if (!d[k]) errors.push(`${loc} missing ${k}`)
    }
    for (const k of Object.keys(d)) {
      if (!(k in en)) errors.push(`${loc} extra ${k}`)
    }
  }
  return errors
}
