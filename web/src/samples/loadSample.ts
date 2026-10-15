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

export async function fetchSampleResult(file: string, lang: string): Promise<ExplainResponse> {
  const response = await fetch(sampleResultUrl(file, lang))
  if (!response.ok) {
    throw new Error(`Sample result is not on this phone (${response.status})`)
  }
  return response.json() as Promise<ExplainResponse>
}
