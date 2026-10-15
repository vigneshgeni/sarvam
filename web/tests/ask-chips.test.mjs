import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { askFamily, starterChipKeys } from '../src/utils/askChips.js'

const root = join(dirname(fileURLToPath(import.meta.url)), '../src/i18n')
const langs = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']

test('starter chips follow the open document and exist in every language', () => {
  assert.equal(askFamily('lab_report'), 'lab')
  assert.equal(askFamily('utility_bill'), 'bill')
  assert.equal(askFamily('court_legal'), 'legal')
  assert.equal(askFamily('insurance'), 'money')
  assert.equal(askFamily('something-else'), 'generic')
  assert.deepEqual(starterChipKeys('prescription'), ['askRx1', 'askRx2', 'askRx3'])
  const keys = Object.values({
    lab: starterChipKeys('lab_report'),
    rx: starterChipKeys('prescription'),
    bill: starterChipKeys('utility_bill'),
    gov: starterChipKeys('government_notice'),
    legal: starterChipKeys('challan'),
    money: starterChipKeys('bank_statement'),
    invoice: starterChipKeys('invoice'),
    form: starterChipKeys('form'),
    generic: starterChipKeys(''),
  }).flat()
  keys.push('clearChat')
  for (const lang of langs) {
    const dict = JSON.parse(readFileSync(join(root, `${lang}.json`), 'utf8'))
    for (const key of keys) assert.ok(dict[key], `${lang}:${key}`)
  }
})
