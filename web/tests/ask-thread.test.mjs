import test from 'node:test'
import assert from 'node:assert/strict'
import { asksForDocument, turnsForThread } from '../src/utils/askThread.js'

const tax = [{ question: 'Should I pay anything extra?', answer: 'No.' }]
const claim = [{ question: 'How much was approved?', answer: 'The letter says the approved amount.' }]

test('a new document does not inherit another document chat', () => {
  const shown = asksForDocument('claim-id', [], 'tax-id', tax)
  assert.deepEqual(shown, [])
})

test('the live thread is kept for the document that owns it', () => {
  const shown = asksForDocument('tax-id', [], 'tax-id', tax)
  assert.deepEqual(shown, tax)
})

test('opening a saved document shows that document chat', () => {
  const shown = asksForDocument('claim-id', claim, 'tax-id', tax)
  assert.deepEqual(shown, claim)
})

test('a newer live thread wins over a shorter saved copy of the same document', () => {
  const live = [...tax, { question: 'Which year?', answer: 'The letter names the year.' }]
  const shown = asksForDocument('tax-id', tax, 'tax-id', live)
  assert.deepEqual(shown, live)
})

test('switching threads replaces turns instead of keeping the previous chat', () => {
  assert.deepEqual(turnsForThread(null, []), [])
  assert.deepEqual(turnsForThread(null, claim), claim)
  assert.deepEqual(turnsForThread(tax, claim), tax)
})
