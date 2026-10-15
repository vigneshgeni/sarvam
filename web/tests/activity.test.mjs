import test from 'node:test'
import assert from 'node:assert/strict'
import { clearTicks, createMemoryStore, defaultDocumentName, shortIssuer } from '../src/utils/activity.js'

test('ticks and a reminder survive a reload, and delete removes them', () => {
  const store = createMemoryStore()
  store.save('doc-1', { title: 'Lab report · City Diagnostics · 9 Oct', activity: {} })
  store.patch('doc-1', { doneActions: { 0: true, 1: true }, remindersAdded: { 0: true } })
  const reloaded = store.get('doc-1')
  assert.equal(reloaded.activity.doneActions[0], true)
  assert.equal(reloaded.activity.doneActions[1], true)
  assert.equal(reloaded.activity.remindersAdded[0], true)
  store.remove('doc-1')
  assert.equal(store.get('doc-1'), null)
})

test('clear ticks keeps reminders', () => {
  const cleared = clearTicks({ doneActions: { 0: true }, remindersAdded: { 0: true }, medicine: { slots: {}, times: {}, durations: {} }, rating: '', lang: '', reportIndex: null })
  assert.deepEqual(cleared.doneActions, {})
  assert.equal(cleared.remindersAdded[0], true)
})

test('a default name uses kind, issuer and date, and skips a person name', () => {
  assert.equal(defaultDocumentName('Lab report', 'City Diagnostics', '2026-10-09'), 'Lab report · City Diagnostics · 9 Oct')
  assert.equal(shortIssuer('Mr. Suresh Babu'), '')
  assert.equal(defaultDocumentName('Lab report', 'Mr. Suresh Babu', '2026-10-09'), 'Lab report · 9 Oct')
})

test('an empty rename restores the default and a custom name stays off the result title', () => {
  const store = createMemoryStore()
  store.save('doc-2', { title: 'Lab report · City Diagnostics · 9 Oct', result: { title: 'Haemoglobin report' } })
  store.rename('doc-2', 'Blood test', 'Lab report · City Diagnostics · 9 Oct')
  assert.equal(store.get('doc-2').displayName, 'Blood test')
  assert.equal(store.get('doc-2').result.title, 'Haemoglobin report')
  store.rename('doc-2', '   ', 'Lab report · City Diagnostics · 9 Oct')
  assert.equal(store.get('doc-2').displayName, '')
})
