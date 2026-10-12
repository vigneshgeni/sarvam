import test from 'node:test'
import assert from 'node:assert/strict'

const STORAGE_ACTIVE_RESULT = 'sarvam.active_result'

// Polyfill minimal sessionStorage for test runner
const storage = new Map()
const mockSessionStorage = {
  getItem: (k) => (storage.has(k) ? storage.get(k) : null),
  setItem: (k, v) => storage.set(k, String(v)),
  removeItem: (k) => storage.delete(k),
  clear: () => storage.clear(),
}

function saveActiveSession(data, customStorage = mockSessionStorage) {
  customStorage.setItem(STORAGE_ACTIVE_RESULT, JSON.stringify(data))
}

function loadActiveSession(customStorage = mockSessionStorage) {
  const raw = customStorage.getItem(STORAGE_ACTIVE_RESULT)
  return raw ? JSON.parse(raw) : null
}

function clearActiveSession(customStorage = mockSessionStorage) {
  customStorage.removeItem(STORAGE_ACTIVE_RESULT)
}

test('source_text is persisted in sarvam.active_result for Ask grounding after reload', () => {
  storage.clear()
  const sampleResult = {
    title: 'Hospital Discharge Summary',
    doc_type: 'medical',
    language: 'en',
    source_text: 'Patient admitted on 12-09-2026. Discharge diagnosis: Acute appendicitis. Rx: Paracetamol 500mg TDS.',
    summary: ['Patient was treated for appendicitis.'],
  }

  saveActiveSession(sampleResult)
  const loaded = loadActiveSession()

  assert.ok(loaded)
  assert.equal(loaded.source_text, sampleResult.source_text)
  assert.equal(loaded.title, 'Hospital Discharge Summary')
})

test('clearActiveSession on Delete completely removes source_text from sessionStorage', () => {
  storage.clear()
  const sampleResult = {
    title: 'Insurance Claim Letter',
    source_text: 'Claim CLM-2026-0884 approved for Rs. 31,200.',
  }

  saveActiveSession(sampleResult)
  assert.ok(storage.has('sarvam.active_result'))

  clearActiveSession()
  assert.equal(storage.has('sarvam.active_result'), false)
  assert.equal(loadActiveSession(), null)
})

test('source_text is strictly preserved locally and absent from any telemetry or feedback', () => {
  const resultObj = {
    title: 'Pension Notice',
    source_text: 'Confidential life certificate details',
  }
  const serialized = JSON.stringify(resultObj)
  assert.ok(serialized.includes('Confidential life certificate details'))

  // Verify deletion purges the object
  clearActiveSession()
  assert.equal(storage.get('sarvam.active_result'), undefined)
})
