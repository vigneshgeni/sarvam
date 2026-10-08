import en from './en.json'
import hi from './hi.json'
import ta from './ta.json'
import { getAppLanguage } from '../auth'

export type LfKey = keyof typeof en

const dicts: Record<string, Record<string, string>> = { en, ta, hi }

export function lfString(lang: string, key: LfKey): string {
  const d = dicts[lang] || dicts.en
  return d[key] || dicts.en[key] || key
}

export function useLfT(lang?: string): (key: LfKey) => string {
  const resolved = lang || getAppLanguage()
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
