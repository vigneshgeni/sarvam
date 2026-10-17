import test from 'node:test'
import assert from 'node:assert/strict'
import { explainCanRetry } from '../src/utils/explainRetry.js'

test('a dropped connection is retried once', () => {
  assert.equal(explainCanRetry(0, 0), true)
  assert.equal(explainCanRetry(0, 1), false)
})

test('a brief gateway failure is retried once', () => {
  assert.equal(explainCanRetry(502, 0), true)
  assert.equal(explainCanRetry(503, 0), true)
  assert.equal(explainCanRetry(503, 1), false)
})

test('a timeout or a client error is not retried', () => {
  assert.equal(explainCanRetry(504, 0), false)
  assert.equal(explainCanRetry(400, 0), false)
  assert.equal(explainCanRetry(429, 0), false)
})
