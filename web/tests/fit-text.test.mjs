import test from 'node:test'
import assert from 'node:assert/strict'
import { fittedPx } from '../src/utils/fitText.js'

test('a figure that fits keeps its design size', () => {
  assert.equal(fittedPx(120, 200, 44, 16), 44)
})

test('a long amount shrinks so it stays inside the box', () => {
  const size = fittedPx(280, 190, 44, 16)
  assert.ok(size < 44)
  assert.ok(size >= 16)
  assert.ok((280 * size) / 44 <= 190)
})

test('a tiny box stops at the minimum size', () => {
  assert.equal(fittedPx(400, 40, 44, 16), 16)
})
