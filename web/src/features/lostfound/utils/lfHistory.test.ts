import assert from 'node:assert/strict'
import test from 'node:test'
import { readLf, LF_HISTORY_KEY } from './lfHistory.ts'

test('readLf requires the lf key and ignores other namespaces', () => {
  assert.equal(readLf(null), null)
  assert.equal(readLf(undefined), null)
  assert.equal(readLf({}), null)
  assert.equal(readLf({ lostfound: { depth: 1, screenId: 'feed' } }), null)
  assert.equal(readLf({ sarvam: { depth: 1, screenId: 'feed' } }), null)
  assert.deepEqual(readLf({ [LF_HISTORY_KEY]: { depth: 2, screenId: 'claim' } }), {
    depth: 2,
    screenId: 'claim',
  })
})

test('readLf rejects malformed lf payloads', () => {
  assert.equal(readLf({ lf: null }), null)
  assert.equal(readLf({ lf: { depth: '1', screenId: 'feed' } }), null)
  assert.equal(readLf({ lf: { depth: 1 } }), null)
  assert.equal(readLf({ lf: { screenId: 'feed' } }), null)
})
