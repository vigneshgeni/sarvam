/** One privacy check per document, language, and Hide-on state. */

const cache = new Map()

export function privacyCacheKey(id, lang) {
  return `${id || ''}|${lang || 'en'}|hide`
}

export function readPrivacyCache(key) {
  return cache.get(key) || null
}

export function writePrivacyCache(key, value) {
  cache.set(key, value)
}
