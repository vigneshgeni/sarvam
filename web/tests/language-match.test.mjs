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
const dir = mkdtempSync(join(tmpdir(), 'sarvam-lang-'))
const source = readFileSync(join(here, '../src/utils/languageMatch.ts'), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText.replaceAll("from '../types'", "from './types-stub.mjs'")
writeFileSync(join(dir, 'languageMatch.mjs'), js)
writeFileSync(join(dir, 'types-stub.mjs'), 'export {}\n')
const { outputNeedsTranslation } = await import(pathToFileURL(join(dir, 'languageMatch.mjs')).href)

test('a Tamil reading needs English when English is selected', () => {
  const result = {
    title: 'பிறப்புச் சான்றிதழ்',
    language: 'ta',
    summary: ['இது ஒரு பிறப்புச் சான்றிதழ். பெயர் அச்சிடப்பட்டுள்ளது.'],
    facts: [],
    actions: [],
  }
  assert.equal(outputNeedsTranslation(result, 'en'), true)
  assert.equal(outputNeedsTranslation(result, 'ta'), false)
  assert.equal(outputNeedsTranslation(result, 'hi'), true)
})

test('an English reading needs Hindi when Hindi is selected', () => {
  const result = {
    title: 'Birth certificate',
    language: 'en',
    summary: ['This is a birth certificate. The name is printed on the page.'],
    facts: [],
    actions: [],
  }
  assert.equal(outputNeedsTranslation(result, 'hi'), true)
  assert.equal(outputNeedsTranslation(result, 'en'), false)
  assert.equal(outputNeedsTranslation(result, 'auto'), false)
})
