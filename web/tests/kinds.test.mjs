import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')

const source = readFileSync(new URL('../src/documents/kinds.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const dir = mkdtempSync(join(tmpdir(), 'sarvam-kinds-'))
const file = join(dir, 'kinds.mjs')
writeFileSync(file, js)
const { inferKind } = await import(pathToFileURL(file).href)

const base = {
  doc_type: 'other',
  title: 'Paper',
  summary: [],
  facts: [],
}

test('inferKind prefers document_kind over the coarse type', () => {
  assert.equal(inferKind({ ...base, document_kind: 'loan', document_type: 'agreement' }), 'loan')
})

test('inferKind uses medicines, then sections', () => {
  assert.equal(inferKind({ ...base, medicines: [{ name: 'Tab A' }] }), 'prescription')
  assert.equal(inferKind({ ...base, sections: [{ values: [{ label: 'Hb', value: '9' }] }] }), 'lab_report')
})

test('inferKind reads the words in the document, not a file name', () => {
  assert.equal(inferKind({ ...base, title: 'Home loan sanction letter', summary: ['EMI is printed'] }), 'loan')
  assert.equal(inferKind({ ...base, document_type: 'medical', title: 'Blood test' }), 'lab_report')
  assert.equal(inferKind({ ...base, document_type: 'other', title: 'A letter' }), 'other')
})
