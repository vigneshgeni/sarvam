import test from 'node:test'
import assert from 'node:assert/strict'
import {
  STORAGE_ACTIVE_RESULT,
  restoreActiveOverlay,
} from '../src/hooks/overlayCore.js'

test('1B useOverlayRestore - simulates returning from WhatsApp (visibilitychange / pageshow) with saved session', () => {
  // Set up mock window and sessionStorage
  const storage = new Map()
  const customSessionStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  }
  globalThis.sessionStorage = customSessionStorage

  const dispatchedEvents = []
  globalThis.window = {
    history: {
      replaceState: (state, title) => {
        globalThis.window.history.state = state
      },
      state: { screen: 'result', overlay: 'share' },
    },
    dispatchEvent: (evt) => {
      dispatchedEvents.push(evt)
    },
  }
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  }

  // 1. Simulate saving active result before user shared to WhatsApp
  const savedResult = {
    result: {
      title: 'Claim Settlement Letter',
      doc_type: 'insurance',
      facts: [{ text: 'Approved: Rs. 31,200' }],
    },
  }
  storage.set(STORAGE_ACTIVE_RESULT, JSON.stringify(savedResult))

  // 2. Overlay lost its memory data during backgrounding (currentData is null/undefined)
  let restoredData = null
  let overlayClosed = false

  const outcome = restoreActiveOverlay(null, {
    onRestore: (data) => {
      restoredData = data
    },
    onClose: () => {
      overlayClosed = true
    },
  })

  // Verify session is restored
  assert.equal(outcome.restored, true)
  assert.equal(outcome.closed, false)
  assert.equal(restoredData?.result?.title, 'Claim Settlement Letter')
  assert.equal(outcome.data?.result?.facts[0].text, 'Approved: Rs. 31,200')
  assert.equal(overlayClosed, false)

  // Verify event dispatched for global app state
  const restoreEvt = dispatchedEvents.find((e) => e.type === 'sarvam:restore-session')
  assert.ok(restoreEvt, 'Must dispatch sarvam:restore-session event')
  assert.equal(restoreEvt.detail.result.title, 'Claim Settlement Letter')
})

test('1B useOverlayRestore - simulates empty session storage on return, cleanly closes overlay without blank white screen', () => {
  // Set up empty sessionStorage
  const storage = new Map()
  globalThis.sessionStorage = {
    getItem: (k) => (storage.has(k) ? storage.get(k) : null),
    setItem: (k, v) => storage.set(k, String(v)),
    removeItem: (k) => storage.delete(k),
    clear: () => storage.clear(),
  }

  const dispatchedEvents = []
  globalThis.window = {
    history: {
      replaceState: (state) => {
        globalThis.window.history.state = state
      },
      state: { screen: 'result', overlay: 'share' },
    },
    dispatchEvent: (evt) => {
      dispatchedEvents.push(evt)
    },
  }

  let restoredData = null
  let closedMessage = null

  const outcome = restoreActiveOverlay(null, {
    onRestore: (data) => {
      restoredData = data
    },
    onClose: (msg) => {
      closedMessage = msg
    },
  })

  // Verify clean closure
  assert.equal(outcome.restored, false)
  assert.equal(outcome.closed, true)
  assert.equal(restoredData, null)
  assert.equal(closedMessage, 'Session expired. Returning to Home.')

  // Verify history replaced to home without dangling overlay
  assert.deepEqual(globalThis.window.history.state, { screen: 'home', overlay: null })

  // Verify event dispatched
  const closeEvt = dispatchedEvents.find((e) => e.type === 'sarvam:close-overlay')
  assert.ok(closeEvt, 'Must dispatch sarvam:close-overlay event')
  assert.equal(closeEvt.detail.message, 'Session expired. Returning to Home.')
})

test('1B useOverlayRestore - retains existing overlay data if already present without spurious re-reads', () => {
  const existingData = { title: 'Existing Document' }
  let restored = false
  let closed = false

  const outcome = restoreActiveOverlay(existingData, {
    onRestore: () => {
      restored = true
    },
    onClose: () => {
      closed = true
    },
  })

  assert.equal(outcome.restored, false)
  assert.equal(outcome.closed, false)
  assert.equal(outcome.data, existingData)
  assert.equal(restored, false)
  assert.equal(closed, false)
})
