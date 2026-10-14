import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
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

test('round 8 profile and reading strings exist in all nine languages', () => {
  const missing = []
  for (const lang of langs) {
    for (const key of round8) {
      if (!dicts[lang][key]) missing.push(`${lang}:${key}`)
    }
  }
  assert.deepEqual(missing, [])
})
