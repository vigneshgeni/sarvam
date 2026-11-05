import test from 'node:test'
import assert from 'node:assert/strict'
import { isNative } from '../src/native/isNative.js'
import {
  startScanActivity,
  updateScanProgress,
  markScanReady,
  markScanFailed,
  markScanPasswordNeeded,
  endScanActivity,
  startListenActivity,
  updateListenPlayback,
  finishListenActivity,
} from '../src/native/liveActivity.js'

test('native bridge: isNative() returns false in node/web environment', () => {
  assert.equal(isNative(), false)
})

test('native bridge: all scan functions execute safely as no-ops when !isNative()', async () => {
  await assert.doesNotReject(async () => {
    await startScanActivity({
      docId: 'doc-123',
      fileName: 'salary.pdf',
      fileCount: 1,
      language: 'ta',
    })

    await updateScanProgress({
      docId: 'doc-123',
      progress: 45,
      stageText: 'Reading your document',
      secondsRemaining: 12,
    })

    await markScanReady({
      docId: 'doc-123',
      language: 'ta',
      languageLabel: 'தமிழ்',
    })

    await markScanFailed({
      docId: 'doc-123',
      errorMessage: 'Network error',
    })

    await markScanPasswordNeeded({
      docId: 'doc-123',
    })

    await endScanActivity('doc-123')
  })
})

test('native bridge: all listen functions execute safely as no-ops when !isNative()', async () => {
  await assert.doesNotReject(async () => {
    await startListenActivity({
      docId: 'doc-123',
      title: 'Lab Report',
      language: 'hi',
      languageLabel: 'Hindi',
      voiceGender: 'female',
      duration: 120,
    })

    await updateListenPlayback({
      currentTime: 30,
      duration: 120,
      isPlaying: true,
    })

    await finishListenActivity()
  })
})
