export function privacyCacheKey(id: string, lang: string): string
export function readPrivacyCache(key: string): {
  key: string
  closed: boolean
  spans: { text: string; type: string }[]
  share: { text: string; title: string; segments: { text: string; masked: boolean }[] }
} | null
export function writePrivacyCache(key: string, value: unknown): void
