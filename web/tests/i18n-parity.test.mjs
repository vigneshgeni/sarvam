import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n')
const langs = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']
const dicts = Object.fromEntries(langs.map((lang) => [lang, JSON.parse(readFileSync(join(root, `${lang}.json`), 'utf8'))]))

const round8 = [
  'howToFill', 'toPay', 'byDate', 'daysLeft', 'waysToPay', 'directionsTitle',
  'itemsTitle', 'notADiagnosis', 'notADiagnosisBody', 'lookFirst', 'wholePage',
  'summaryOnly', 'saveToPhotos', 'almostThere', 'nextEmi', 'loanTerms',
]

test('every English string exists in the other eight languages', () => {
  const missing = []
  for (const lang of langs) {
    if (lang === 'en') continue
    for (const key of Object.keys(dicts.en)) {
      if (!(key in dicts[lang]) || dicts[lang][key] === '') missing.push(`${lang}:${key}`)
    }
  }
  assert.deepEqual(missing, [])
})

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name)
    if (statSync(path).isDirectory()) walk(path, out)
    else if (/\.(tsx|ts|jsx|js)$/.test(name)) out.push(path)
  }
  return out
}

test('every t.key used in the app exists in all nine languages', () => {
  const src = join(dirname(fileURLToPath(import.meta.url)), '../src')
  const missing = []
  const keys = new Set()
  for (const file of walk(src)) {
    const text = readFileSync(file, 'utf8')
    for (const match of text.matchAll(/\bt\.([A-Za-z_][A-Za-z0-9_]*)/g)) keys.add(match[1])
  }
  for (const key of keys) {
    for (const lang of langs) {
      if (!dicts[lang][key]) missing.push(`${lang}:${key}`)
    }
  }
  assert.deepEqual(missing, [])
})

test('round 8 profile and reading strings exist in all nine languages', () => {
  const missing = []
  for (const lang of langs) {
    for (const key of round8) {
      if (!dicts[lang][key]) missing.push(`${lang}:${key}`)
    }
  }
  assert.deepEqual(missing, [])
})
