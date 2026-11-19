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
const dir = mkdtempSync(join(tmpdir(), 'sarvam-lyrics-'))
const js = ts.transpileModule(readFileSync(join(here, '../src/utils/lyrics.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
writeFileSync(join(dir, 'lyrics.mjs'), js)
const L = await import(pathToFileURL(join(dir, 'lyrics.mjs')).href)

const segs = [
  { text: 'You need to take three medicines.', start: 0, end: 2.1 },
  { text: 'Amoxicillin three times a day.', start: 2.35, end: 5.0 },
  { text: 'Go for a review on 20/10/2026.', start: 5.25, end: 8.0 },
]

test('header parses base64 UTF-8 JSON, including Tamil', () => {
  const list = [{ text: 'நீங்கள் மூன்று மருந்துகளை எடுக்க வேண்டும்.', start: 0, end: 3 }, ...segs]
  const header = Buffer.from(JSON.stringify(list), 'utf8').toString('base64')
  const out = L.parseSegmentsHeader(header)
  assert.equal(out.length, 4)
  assert.equal(out[0].text, list[0].text)
})

test('bad header gives no segments', () => {
  assert.deepEqual(L.parseSegmentsHeader(''), [])
  assert.deepEqual(L.parseSegmentsHeader('not base64 json'), [])
  assert.deepEqual(L.parseSegmentsHeader(null), [])
})

test('the sentence just read stays up through the pause, then the next starts', () => {
  assert.equal(L.segmentIndexAt(segs, 0), 0)
  assert.equal(L.segmentIndexAt(segs, 2.2), 0)
  assert.equal(L.segmentIndexAt(segs, 2.35), 1)
  assert.equal(L.segmentIndexAt(segs, 7.9), 2)
  assert.equal(L.segmentIndexAt(segs, 99), 2)
  assert.equal(L.segmentIndexAt([], 3), 0)
})

test('without timings the index is estimated by characters', () => {
  assert.equal(L.estimatedIndexAt(['aaaa', 'bbbb'], 0.1, 10), 0)
  assert.equal(L.estimatedIndexAt(['aaaa', 'bbbb'], 9, 10), 1)
})

test('dragging the ruler left moves forward, clamped to the audio', () => {
  assert.equal(L.dragToTime(10, -36, 28), 12)
  assert.equal(L.dragToTime(10, 36, 28), 8)
  assert.equal(L.dragToTime(1, 400, 28), 0)
  assert.equal(L.dragToTime(27, -400, 28), 28)
})

test('position text reads like the design', () => {
  assert.equal(L.positionText(13.4, 28), '0:13 of 0:28')
  assert.equal(L.clockTime(75), '1:15')
})
