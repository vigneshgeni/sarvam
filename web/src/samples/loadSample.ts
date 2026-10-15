import { HEALTH_SAMPLE, HOME_SAMPLES } from '../design/catalog'
import type { ExplainResponse } from '../types'

export const SAMPLE_FILES = [...HOME_SAMPLES.map((sample) => sample.file), HEALTH_SAMPLE]

export function isSampleFile(name: string): boolean {
  return SAMPLE_FILES.includes(name)
}

export function sampleResultUrl(file: string, lang: string): string {
  const code = (lang || 'en').toLowerCase().split('-')[0]
  return `/samples/results/${encodeURIComponent(file)}.${code}.json`
}

export interface SavedLookalike {
  title?: string
  doc_type?: string
  document_kind?: string | null
  fileNames?: string[]
}

/** A sample tile opens the bundled result for this exact file name and language.
 *  Saved uploads are not consulted, even when their kind or title looks like the sample. */
export function resolveSampleOpen(
  file: string,
  lang: string,
  saved: SavedLookalike[] = [],
): { file: string; lang: string; url: string } | null {
  const exact = SAMPLE_FILES.find((name) => name === file)
  if (!exact) return null
  void saved
  const code = (lang || 'en').toLowerCase().split('-')[0]
  return { file: exact, lang: code, url: sampleResultUrl(exact, code) }
}

/** A bundled sample is JSON. A missing file on hosting comes back as the app page. */
export function parseSampleBody(text: string): ExplainResponse | null {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{')) return null
  try {
    const data = JSON.parse(trimmed) as ExplainResponse
    if (!data || typeof data !== 'object' || !data.title) return null
    return data
  } catch {
    return null
  }
}

export function sampleLanguagesToTry(lang: string): string[] {
  const code = (lang || 'en').toLowerCase().split('-')[0] || 'en'
  return code === 'en' ? ['en'] : [code, 'en']
}

async function readSample(file: string, lang: string): Promise<ExplainResponse | null> {
  const response = await fetch(sampleResultUrl(file, lang))
  if (!response.ok) return null
  return parseSampleBody(await response.text())
}

/** Opens the language file, or the English sample when that language was not bundled. */
export async function fetchSampleResult(file: string, lang: string): Promise<{ result: ExplainResponse; shownLang: string }> {
  for (const code of sampleLanguagesToTry(lang)) {
    const result = await readSample(file, code)
    if (result) return { result, shownLang: code }
  }
  throw new Error('Sample result is not on this phone')
}
