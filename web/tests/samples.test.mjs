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
const { SAMPLE_FILES, sampleResultUrl, isSampleFile } = await import(pathToFileURL(join(dir, 'loadSample.mjs')).href)

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
