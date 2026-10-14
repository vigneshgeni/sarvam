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

export async function fetchSampleResult(file: string, lang: string): Promise<ExplainResponse> {
  const response = await fetch(sampleResultUrl(file, lang))
  if (!response.ok) {
    throw new Error(`Sample result is not on this phone (${response.status})`)
  }
  return response.json() as Promise<ExplainResponse>
}
