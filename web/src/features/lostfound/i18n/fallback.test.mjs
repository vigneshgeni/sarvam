import assert from 'node:assert/strict'
import test from 'node:test'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = dirname(fileURLToPath(import.meta.url))
const en = JSON.parse(readFileSync(join(here, 'en.json'), 'utf8'))
const ta = JSON.parse(readFileSync(join(here, 'ta.json'), 'utf8'))
const hi = JSON.parse(readFileSync(join(here, 'hi.json'), 'utf8'))

const dicts = { en, ta, hi }
const ENGLISH_FALLBACK_LANGS = new Set(['te', 'ml', 'kn', 'auto', 'en-IN'])

function resolveLfLang(lang) {
  const raw = (lang || 'en').trim()
  if (raw === 'ta' || raw === 'hi' || raw === 'en') return raw
  if (ENGLISH_FALLBACK_LANGS.has(raw)) return 'en'
  return dicts[raw] ? raw : 'en'
}

function lfString(lang, key) {
  const resolved = resolveLfLang(lang)
  const d = dicts[resolved] || dicts.en
  return d[key] || dicts.en[key] || String(key)
}

test('te, ml, kn and auto fall back to English, never the key name', () => {
  for (const lang of ['te', 'ml', 'kn', 'auto']) {
    assert.equal(lfString(lang, 'title'), en.title)
    assert.equal(lfString(lang, 'guest'), en.guest)
    assert.notEqual(lfString(lang, 'title'), 'title')
  }
})

test('ta and hi keep their own strings', () => {
  assert.equal(lfString('ta', 'title'), ta.title)
  assert.equal(lfString('hi', 'title'), hi.title)
  assert.notEqual(ta.title, en.title)
})

test('missing key falls back to English then stays readable', () => {
  const ghost = lfString('ta', 'notARealKey')
  assert.equal(ghost, 'notARealKey')
  assert.equal(lfString('en', 'title'), en.title)
})
