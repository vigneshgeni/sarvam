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
const dir = mkdtempSync(join(tmpdir(), 'sarvam-var-'))
const store = new Map()
globalThis.localStorage = {
  getItem: (key) => (store.has(key) ? store.get(key) : null),
  setItem: (key, value) => store.set(key, String(value)),
  removeItem: (key) => store.delete(key),
}
let js = ts.transpileModule(readFileSync(join(here, '../src/design/catalog.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
js = js.replaceAll("from '../types'", "from './types-stub.mjs'")
js = js.replaceAll('import.meta.env?.DEV', 'false')
writeFileSync(join(dir, 'catalog.mjs'), js)
writeFileSync(join(dir, 'types-stub.mjs'), 'export {}\n')
const { pickReadingVariant } = await import(pathToFileURL(join(dir, 'catalog.mjs')).href)

function pick(over) {
  return pickReadingVariant({ photo: false, fileCount: 1, language: 'en', ...over })
}

test('photos and extra files use B, then the next letter if B was just shown', () => {
  store.clear()
  assert.equal(pick({ photo: true }), 'B')
  assert.equal(pick({ photo: true }), 'C')
  assert.equal(pick({ fileCount: 2 }), 'B')
})

test('a non-English document uses C unless that was just shown', () => {
  store.clear()
  assert.equal(pick({ language: 'ta' }), 'C')
  assert.equal(pick({ language: 'hi' }), 'D')
})

test('an English document alternates A and D', () => {
  store.clear()
  assert.equal(pick({}), 'A')
  assert.equal(pick({}), 'D')
  assert.equal(pick({}), 'A')
})

test('a forced letter is used as given', () => {
  store.clear()
  assert.equal(pick({ force: 'D', photo: true }), 'D')
  assert.equal(pick({ force: 'b' }), 'B')
})
