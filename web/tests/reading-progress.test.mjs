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
const dir = mkdtempSync(join(tmpdir(), 'sarvam-read-'))
let js = ts.transpileModule(readFileSync(join(here, '../src/hooks/useReadingStage.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
js = js.replace(/^import .*$/gm, '')
writeFileSync(join(dir, 'stage.mjs'), js)
const { expectedReadingSeconds, readingProgress } = await import(pathToFileURL(join(dir, 'stage.mjs')).href)

test('expected time is 8 seconds plus 6 per page, and 9 seconds per photo', () => {
  assert.equal(expectedReadingSeconds(0, 1), 14)
  assert.equal(expectedReadingSeconds(0, 10), 68)
  assert.equal(expectedReadingSeconds(3, 1), 27)
})

test('the ring eases inside each band and holds at 95', () => {
  const total = 14
  const start = readingProgress(0, total)
  const reading = readingProgress(2, total)
  const checking = readingProgress(total * 0.5, total)
  const writing = readingProgress(total * 0.85, total)
  const held = readingProgress(total + 5, total)
  assert.equal(start.stage, 'reading')
  assert.equal(start.percent, 0)
  assert.ok(reading.percent > 0 && reading.percent <= 35)
  assert.equal(checking.stage, 'checking')
  assert.ok(checking.percent >= 35 && checking.percent <= 70)
  assert.equal(writing.stage, 'writing')
  assert.ok(writing.percent >= 70 && writing.percent < 95)
  assert.equal(held.percent, 95)
  assert.equal(held.almost, true)
  assert.ok(reading.percent <= checking.percent)
  assert.ok(checking.percent <= writing.percent)
})
