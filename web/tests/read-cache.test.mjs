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
const dir = mkdtempSync(join(tmpdir(), 'sarvam-cache-'))
let puts = 0
let gets = 0
writeFileSync(join(dir, 'db.mjs'), `
export function isSaveRecentEnabled() { return false }
export async function idbGetReadCache() { return null }
export async function idbPutReadCache() {}
`)
let js = ts.transpileModule(readFileSync(join(here, '../src/utils/readCache.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
js = js.replaceAll("from '../types'", "from './types-stub.mjs'")
js = js.replaceAll("from './db'", "from './db.mjs'")
writeFileSync(join(dir, 'readCache.mjs'), js)
writeFileSync(join(dir, 'types-stub.mjs'), 'export {}\n')
const cache = await import(pathToFileURL(join(dir, 'readCache.mjs')).href)

test('the same file and language is remembered after one write', async () => {
  const hash = 'abc'
  assert.equal(await cache.recallRead(hash, 'en'), null)
  await cache.rememberRead(hash, 'en', { title: 'Bill' }, 'res-1')
  await cache.rememberRead(hash, 'hi', { title: 'बिल' }, 'res-1')
  assert.equal((await cache.recallRead(hash, 'en')).title, 'Bill')
  assert.equal((await cache.recallRead(hash, 'hi')).title, 'बिल')
  assert.equal((await cache.recallRead(hash, 'ta')), null)
  assert.equal(cache.readCacheId(hash), 'abc:3')
})
