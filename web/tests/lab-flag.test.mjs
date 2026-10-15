import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sarvam-lab-'))
const js = ts.transpileModule(readFileSync(join(here, '../src/documents/labFlag.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
writeFileSync(join(dir, 'labFlag.mjs'), js)
const { assessLabValue, titleCaseHeading, countOutside } = await import(pathToFileURL(join(dir, 'labFlag.mjs')).href)

test('a printed flag is kept and a missing range makes no decision', () => {
  assert.deepEqual(assessLabValue('86', '15-73', 'High'), { label: 'High', calculated: false, outside: true })
  assert.deepEqual(assessLabValue('11.2', '', 'L'), { label: 'Low', calculated: false, outside: true })
  assert.equal(assessLabValue('4.60', '', ''), null)
  assert.equal(assessLabValue('96.6', 'Indicative of renal impairment < 60', ''), null)
})

test('a simple range says above or below, and a band names the printed band', () => {
  assert.deepEqual(assessLabValue('86', '15.0-73.0', ''), { label: 'Above range', calculated: true, outside: true })
  assert.deepEqual(assessLabValue('10', '15-73', ''), { label: 'Below range', calculated: true, outside: true })
  assert.deepEqual(assessLabValue('60', '40.0-60.0', ''), { label: '', calculated: false, outside: false })
  const cholesterol = 'Desirable: < 200\nBorderline High: 200-239\nHigh: > 240'
  assert.equal(assessLabValue('253', cholesterol, '').label, 'High')
  assert.equal(assessLabValue('253', cholesterol, '').calculated, true)
  assert.equal(assessLabValue('220', cholesterol, '').label, 'Borderline High')
  assert.equal(assessLabValue('180', cholesterol, '').outside, false)
  const vitamin = 'Deficiency: < 20\nInsufficiency: 20-30\nSufficiency: 30-100\nToxicity: > 100'
  assert.equal(assessLabValue('20.0', vitamin, '').label, 'Insufficiency')
  assert.equal(assessLabValue('20.0', vitamin, '').outside, true)
  assert.equal(titleCaseHeading('LIPID PROFILE'), 'Lipid Profile')
  assert.equal(titleCaseHeading('Serum albumin'), 'Serum albumin')
  assert.equal(countOutside([{ values: [{ value: '86', ref_range: '15-73', flag_printed: '' }, { value: '4.6', ref_range: '3.5-5.0' }] }]), 1)
})
