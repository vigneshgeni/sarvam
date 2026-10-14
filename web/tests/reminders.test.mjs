import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/documents/reminders.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const file = join(mkdtempSync(join(tmpdir(), 'sarvam-rem-')), 'reminders.mjs')
writeFileSync(file, js)
const { emiRrule, noticeByDate } = await import(pathToFileURL(file).href)

test('EMI repeats monthly only when the day and the tenure are printed', () => {
  assert.equal(emiRrule({ emi_day_of_month: 5, tenure: '20 years' }), 'FREQ=MONTHLY;BYMONTHDAY=5')
  assert.equal(emiRrule({ emi_day_of_month: 5 }), undefined)
  assert.equal(emiRrule({ tenure: '20 years' }), undefined)
})

test('notice-by date counts back from the printed end date', () => {
  assert.equal(noticeByDate('2027-09-01', '2 months'), '2027-07-01')
  assert.equal(noticeByDate('2027-09-01', 'as agreed'), null)
})
