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

test('i18n parity en/ta/hi including polish strings', () => {
  for (const loc of [ta, hi]) {
    for (const k of Object.keys(en)) {
      assert.ok(loc[k], `missing ${k}`)
    }
    for (const k of Object.keys(loc)) {
      assert.ok(k in en, `extra ${k}`)
    }
  }
  assert.equal(en.openUpi, 'Open UPI app')
  assert.equal(en.copyLink, 'Copy link')
  assert.equal(en.signInUnavailable, 'Sign-in is not available right now')
  assert.ok(!en.guestHint.toLowerCase().includes('firebase'))
  assert.ok(!en.signInUnavailable.toLowerCase().includes('wired'))
})

function buildUpiLink({ vpa, name, amount, note }) {
  const params = new URLSearchParams({
    pa: vpa,
    pn: name || 'Demo finder',
    am: String(amount),
    cu: 'INR',
    tn: note || 'Thanks from Sarvam',
  })
  return `upi://pay?${params.toString()}`
}

test('buildUpiLink encodes VPA @ and keeps cu=INR', () => {
  const url = buildUpiLink({ vpa: 'demo.finder@upi', amount: 100 })
  assert.ok(url.startsWith('upi://pay?'))
  assert.ok(url.includes('pa=demo.finder%40upi'))
  assert.ok(url.includes('cu=INR'))
  assert.equal(url.includes('pa=demo.finder@upi'), false)
})

test('readLf only accepts the lf history key', () => {
  function readLf(state) {
    if (!state || typeof state !== 'object') return null
    if (!Object.prototype.hasOwnProperty.call(state, 'lf')) return null
    const raw = state.lf
    if (!raw || typeof raw !== 'object') return null
    if (typeof raw.depth !== 'number' || typeof raw.screenId !== 'string') return null
    return { depth: raw.depth, screenId: raw.screenId }
  }
  assert.equal(readLf({ lostfound: { depth: 1, screenId: 'feed' } }), null)
  assert.deepEqual(readLf({ lf: { depth: 1, screenId: 'post-lost' } }), {
    depth: 1,
    screenId: 'post-lost',
  })
})
