import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync, existsSync, statSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sarvam-samples-'))

function emit(rel, name) {
  let js = ts.transpileModule(readFileSync(join(here, '..', rel), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  js = js.replaceAll("from '../types'", "from './types-stub.mjs'")
  js = js.replaceAll("from '../design/catalog'", "from './catalog.mjs'")
  writeFileSync(join(dir, name), js)
}

emit('src/design/catalog.ts', 'catalog.mjs')
emit('src/samples/loadSample.ts', 'loadSample.mjs')
writeFileSync(join(dir, 'types-stub.mjs'), 'export {}\n')
const { SAMPLE_FILES, sampleResultUrl, isSampleFile, resolveSampleOpen, parseSampleBody, sampleLanguagesToTry } = await import(pathToFileURL(join(dir, 'loadSample.mjs')).href)

test('every sample tile has an offline result address', () => {
  assert.equal(SAMPLE_FILES.length, 11)
  assert.equal(SAMPLE_FILES.includes('sample-health-checkup.pdf'), true)
  for (const file of SAMPLE_FILES) {
    assert.equal(isSampleFile(file), true)
    assert.equal(sampleResultUrl(file, 'ta'), `/samples/results/${encodeURIComponent(file)}.ta.json`)
    const fullPath = join(here, '../public/samples', file)
    assert.equal(existsSync(fullPath), true, `${file} must exist in public/samples`)
    assert.equal(statSync(fullPath).size > 1000, true, `${file} must not be empty`)
  }
  assert.equal(isSampleFile('my-upload.pdf'), false)
})

test('a saved lab report does not replace the health checkup or lab sample', () => {
  const saved = [
    {
      title: 'Laboratory Test Report',
      doc_type: 'lab_report',
      document_kind: 'lab_report',
      fileNames: ['2bf6e5eb-38bb-4e73-bc9b-e78ea5943e52-1771652037979.pdf'],
    },
  ]
  const health = resolveSampleOpen('sample-health-checkup.pdf', 'en', saved)
  const lab = resolveSampleOpen('sample-lab-report.pdf', 'ta', saved)
  assert.equal(health.file, 'sample-health-checkup.pdf')
  assert.equal(health.url, '/samples/results/sample-health-checkup.pdf.en.json')
  assert.equal(lab.file, 'sample-lab-report.pdf')
  assert.equal(lab.url, '/samples/results/sample-lab-report.pdf.ta.json')
  assert.equal(resolveSampleOpen('Laboratory Test Report', 'en', saved), null)
  assert.equal(resolveSampleOpen('lab_report', 'en', saved), null)

  const bundled = JSON.parse(
    readFileSync(join(here, '../public/samples/results/sample-health-checkup.pdf.en.json'), 'utf8'),
  )
  assert.notEqual(bundled.title, saved[0].title)
  assert.equal(bundled.title.includes('Lab Report'), true)
})

test('a missing language file is not a result, so the tile can open English', () => {
  assert.equal(parseSampleBody('<!doctype html><html></html>'), null)
  assert.equal(parseSampleBody('not json'), null)
  assert.equal(parseSampleBody('{"title":"Lab report"}').title, 'Lab report')
  assert.deepEqual(sampleLanguagesToTry('hi'), ['hi', 'en'])
  assert.deepEqual(sampleLanguagesToTry('en'), ['en'])
})
