import { test } from 'node:test'
import assert from 'node:assert/strict'

export const CONCRETE_LANGS = [
  'en',
  'ta',
  'hi',
  'te',
  'ml',
  'kn',
  'mr',
  'bn',
  'or',
]

export const LANG_LABELS = {
  en: 'English',
  ta: 'தமிழ்',
  hi: 'हिंदी',
  te: 'తెలుగు',
  ml: 'മലയാളം',
  kn: 'ಕನ್ನಡ',
  mr: 'मराठी',
  bn: 'বাংলা',
  or: 'ଓଡ଼ିଆ',
}

export function resolveLang(selected, deviceLanguages) {
  if (selected && selected !== 'auto') {
    const norm = selected.toLowerCase().split('-')[0].split('_')[0]
    if (CONCRETE_LANGS.includes(norm)) {
      return norm
    }
  }

  const langs =
    deviceLanguages ??
    (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
      ? navigator.languages
      : typeof navigator !== 'undefined' && navigator.language
      ? [navigator.language]
      : [])

  for (const raw of langs) {
    if (!raw || typeof raw !== 'string') continue
    const code = raw.toLowerCase().split('-')[0].split('_')[0]
    if (CONCRETE_LANGS.includes(code)) {
      return code
    }
  }

  return 'en'
}

test('resolveLang - explicit selection ignores device languages', () => {
  for (const lang of CONCRETE_LANGS) {
    assert.equal(resolveLang(lang, ['ta-IN']), lang)
    assert.equal(resolveLang(lang, ['en-US']), lang)
    assert.equal(resolveLang(lang, []), lang)
  }
})

test('resolveLang - case insensitivity and subtag handling on explicit selection', () => {
  assert.equal(resolveLang('TA', ['hi']), 'ta')
  assert.equal(resolveLang('hi-in', ['ta']), 'hi')
  assert.equal(resolveLang('te_IN', ['en']), 'te')
})

test('resolveLang - test matrix: selected + device languages -> resolved', () => {
  const matrix = [
    // [selected, deviceLanguages, expected]
    ['auto', ['ta-IN', 'en-US'], 'ta'],
    ['auto', ['ta-LK', 'en-US'], 'ta'],
    ['auto', ['hi-IN'], 'hi'],
    ['auto', ['te-IN', 'ta-IN'], 'te'],
    ['auto', ['ml-IN', 'en-GB'], 'ml'],
    ['auto', ['kn-IN'], 'kn'],
    ['auto', ['mr-IN', 'en-IN'], 'mr'],
    ['auto', ['bn-IN'], 'bn'],
    ['auto', ['bn-BD', 'en-US'], 'bn'],
    ['auto', ['or-IN'], 'or'],
    ['auto', ['en-US', 'ta-IN'], 'en'],
    ['auto', ['en-GB'], 'en'],
    // Unsupported primary language falls through to next supported
    ['auto', ['fr-FR', 'es-ES', 'hi-IN'], 'hi'],
    ['auto', ['de-DE', 'zh-CN', 'ta-IN'], 'ta'],
    ['auto', ['ja-JP', 'ko-KR', 'te-IN'], 'te'],
    // No supported language in device list falls back to English
    ['auto', ['fr-FR', 'de-DE'], 'en'],
    ['auto', ['ja-JP'], 'en'],
    ['auto', [], 'en'],
    ['auto', null, 'en'],
    // Explicit selection overrides device list
    ['ta', ['hi-IN'], 'ta'],
    ['hi', ['ta-IN', 'en-US'], 'hi'],
    ['te', ['en-US'], 'te'],
    ['ml', ['kn-IN'], 'ml'],
    ['kn', ['ta-IN'], 'kn'],
    ['mr', ['hi-IN'], 'mr'],
    ['bn', ['en-GB'], 'bn'],
    ['or', ['te-IN'], 'or'],
    ['en', ['ta-IN'], 'en'],
    // Falsy or undefined selected behaves like auto
    [null, ['ta-IN'], 'ta'],
    [undefined, ['kn-IN'], 'kn'],
    [undefined, ['fr-FR'], 'en'],
  ]

  for (const [selected, deviceLanguages, expected] of matrix) {
    const actual = resolveLang(selected, deviceLanguages)
    assert.equal(
      actual,
      expected,
      `Failed for selected=${selected}, deviceLanguages=${JSON.stringify(deviceLanguages)}: expected ${expected}, got ${actual}`
    )
  }
})

test('LANG_LABELS has human-readable names for all 9 concrete languages', () => {
  assert.equal(CONCRETE_LANGS.length, 9)
  for (const lang of CONCRETE_LANGS) {
    assert.ok(LANG_LABELS[lang], `Missing label for ${lang}`)
  }
  assert.equal(LANG_LABELS.en, 'English')
  assert.equal(LANG_LABELS.ta, 'தமிழ்')
  assert.equal(LANG_LABELS.hi, 'हिंदी')
  assert.equal(LANG_LABELS.te, 'తెలుగు')
  assert.equal(LANG_LABELS.ml, 'മലയാളം')
  assert.equal(LANG_LABELS.kn, 'ಕನ್ನಡ')
  assert.equal(LANG_LABELS.mr, 'मराठी')
  assert.equal(LANG_LABELS.bn, 'বাংলা')
  assert.equal(LANG_LABELS.or, 'ଓଡ଼ିଆ')
})
