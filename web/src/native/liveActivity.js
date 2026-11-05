import { registerPlugin } from '@capacitor/core'
import { isNative } from './isNative.js'

const NativePlugin = registerPlugin('SarvamLiveActivity')

// In-memory reference for the current active Live Activity state
let currentActiveState = null

export function getShowDocNameOnLockScreen() {
  if (typeof window === 'undefined') return false
  return localStorage.getItem('sarvam.showDocNameOnLockScreen') === 'true'
}

export function setShowDocNameOnLockScreen(val) {
  if (typeof window === 'undefined') return
  localStorage.setItem('sarvam.showDocNameOnLockScreen', val ? 'true' : 'false')
  if (currentActiveState) {
    currentActiveState.showDocumentName = !!val
    NativePlugin.updateActivity(currentActiveState).catch(() => {})
  }
}

export function getCurrentActivityState() {
  return currentActiveState
}

export async function startScanActivity(params) {
  if (!isNative()) return

  // Privacy rule (Hard Rule 6 & Scenario X1):
  // Lock Screen is visible to anyone; default to generic title "Your document"
  // Setting "Show document name on Lock Screen" controls whether real name displays.
  const showDocumentName = getShowDocNameOnLockScreen()
  const docTitle = params.fileName || 'Your document'
  const state = {
    docId: params.docId,
    phase: 'scanning',
    title: docTitle,
    fileName: params.fileName,
    fileCount: params.fileCount || 1,
    progress: 0,
    stage: 'Reading your document',
    secondsRemaining: 15,
    language: params.language || 'en',
    languageLabel: 'English',
    allowListen: params.language !== 'or',
    showDocumentName,
  }
  currentActiveState = state
  console.log('[SarvamLiveActivity] startScanActivity dispatching to native plugin:', state)
  try {
    const res = await NativePlugin.startActivity(state)
    console.log('[SarvamLiveActivity] startActivity succeeded:', res)
  } catch (err) {
    console.error('[SarvamLiveActivity] startActivity failed:', err)
  }
}

export async function updateScanProgress(params) {
  if (!isNative()) return
  if (!currentActiveState || currentActiveState.docId !== params.docId) return

  currentActiveState.progress = Math.min(100, Math.max(0, Math.round(params.progress)))
  currentActiveState.stage = params.stageText
  if (params.secondsRemaining !== undefined) {
    currentActiveState.secondsRemaining = params.secondsRemaining
  }
  currentActiveState.showDocumentName = getShowDocNameOnLockScreen()

  try {
    await NativePlugin.updateActivity(currentActiveState)
  } catch (err) {
    console.warn('[SarvamLiveActivity] updateScanProgress failed:', err)
  }
}

export async function markScanReady(params) {
  if (!isNative()) return
  const showDocumentName = getShowDocNameOnLockScreen()
  if (!currentActiveState) {
    currentActiveState = {
      docId: params.docId,
      phase: 'ready',
      title: params.title || 'Your document',
      fileCount: 1,
      progress: 100,
      stage: 'Ready',
      language: params.language || 'en',
      languageLabel: params.languageLabel || 'English',
      allowListen: params.language !== 'or',
      showDocumentName,
    }
  } else {
    currentActiveState.phase = 'ready'
    if (params.title) currentActiveState.title = params.title
    currentActiveState.progress = 100
    currentActiveState.stage = 'Ready'
    currentActiveState.language = params.language || currentActiveState.language
    currentActiveState.languageLabel = params.languageLabel || currentActiveState.languageLabel
    currentActiveState.allowListen = params.language !== 'or'
    currentActiveState.showDocumentName = showDocumentName
  }

  console.log('[SarvamLiveActivity] markScanReady dispatching:', currentActiveState)
  try {
    const res = await NativePlugin.updateActivity(currentActiveState)
    console.log('[SarvamLiveActivity] markScanReady succeeded:', res)
  } catch (err) {
    console.error('[SarvamLiveActivity] markScanReady failed:', err)
  }
}

export async function markScanFailed(params) {
  if (!isNative()) return
  const showDocumentName = getShowDocNameOnLockScreen()
  if (!currentActiveState) {
    currentActiveState = {
      docId: params.docId,
      phase: 'failed',
      title: 'Your document',
      errorMessage: params.errorMessage || 'Service is busy',
      showDocumentName,
    }
  } else {
    currentActiveState.phase = 'failed'
    currentActiveState.errorMessage = params.errorMessage || 'Service is busy'
  }

  console.log('[SarvamLiveActivity] markScanFailed dispatching:', currentActiveState)
  try {
    await NativePlugin.updateActivity(currentActiveState)
  } catch (err) {
    console.error('[SarvamLiveActivity] markScanFailed failed:', err)
  }
}

export async function markScanPasswordNeeded(params) {
  if (!isNative()) return
  if (!currentActiveState) return

  currentActiveState.phase = 'passwordNeeded'
  currentActiveState.stage = 'Password needed'

  try {
    await NativePlugin.updateActivity(currentActiveState)
  } catch (err) {
    console.warn('[LiveActivity] Failed to mark password needed:', err)
  }
}

export async function endScanActivity(docId) {
  if (!isNative()) return
  currentActiveState = null
  console.log('[SarvamLiveActivity] endScanActivity called for docId:', docId)
  try {
    await NativePlugin.endActivity({ docId })
    console.log('[SarvamLiveActivity] endActivity succeeded')
  } catch (err) {
    console.warn('[SarvamLiveActivity] Failed to end activity:', err)
  }
}

export async function startListenActivity(params) {
  if (!isNative()) return
  if (params.language === 'or') {
    // Odia rule: No listen activity
    console.log('[SarvamLiveActivity] Odia language selected; skipping listen activity per rule')
    return
  }

  const showDocumentName = getShowDocNameOnLockScreen()
  const state = {
    docId: params.docId,
    phase: 'listening',
    title: params.title || 'Your document',
    fileCount: 1,
    progress: 0,
    stage: 'Listening',
    language: params.language,
    languageLabel: params.languageLabel,
    voiceGender: params.voiceGender || 'female',
    currentTime: params.currentTime || 0,
    duration: params.duration || 0,
    allowListen: true,
    showDocumentName,
  }
  currentActiveState = state
  console.log('[SarvamLiveActivity] startListenActivity dispatching:', state)

  try {
    const res = await NativePlugin.startActivity(state)
    console.log('[SarvamLiveActivity] startListenActivity succeeded:', res)
    if (params.audioBase64) {
      await NativePlugin.playAudio({
        audioData: params.audioBase64,
        title: state.title,
        langLabel: params.languageLabel,
        duration: params.duration || 0,
        startPosition: params.currentTime || 0,
      })
    }
  } catch (err) {
    console.error('[SarvamLiveActivity] startListenActivity failed:', err)
  }
}

export async function updateListenPlayback(params) {
  if (!isNative()) return
  if (!currentActiveState) return

  currentActiveState.currentTime = params.currentTime
  currentActiveState.duration = params.duration
  currentActiveState.phase = params.isPlaying ? 'listening' : 'paused'

  try {
    await NativePlugin.updateActivity(currentActiveState)
  } catch (err) {
    console.warn('[LiveActivity] Failed to update listen playback:', err)
  }
}

export async function finishListenActivity() {
  if (!isNative()) return
  if (!currentActiveState) return

  currentActiveState.phase = 'finished'
  try {
    await NativePlugin.updateActivity(currentActiveState)
  } catch (err) {
    console.warn('[LiveActivity] Failed to finish listen activity:', err)
  }
}

// MARK: - Native Background Scan Worker Helpers
export async function fileToBase64(file) {
  const buffer = await file.arrayBuffer()
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

export async function startNativeScan(params) {
  if (!isNative()) return null
  const showDocumentName = getShowDocNameOnLockScreen()
  const base64Files = await Promise.all(
    params.files.map(async (f) => ({
      name: f.name,
      type: f.type || 'application/octet-stream',
      base64: await fileToBase64(f),
    }))
  )

  const payload = {
    docId: params.docId,
    title: params.title || params.files[0]?.name || 'Your document',
    lang: params.lang,
    apiBase: params.apiBase || 'http://127.0.0.1:8080',
    showDocumentName,
    password: params.password,
    files: base64Files,
  }

  console.log('[SarvamLiveActivity] startNativeScan dispatching:', {
    docId: payload.docId,
    title: payload.title,
    filesCount: payload.files.length,
    lang: payload.lang,
  })

  return await NativePlugin.startNativeScan(payload)
}

export async function checkPendingScanResult(docId) {
  if (!isNative()) return { ready: false }
  try {
    return await NativePlugin.checkPendingScanResult({ docId })
  } catch (err) {
    console.warn('[SarvamLiveActivity] checkPendingScanResult failed:', err)
    return { ready: false }
  }
}

export async function cancelNativeScan(docId) {
  if (!isNative()) return
  try {
    return await NativePlugin.cancelNativeScan({ docId })
  } catch (err) {
    console.warn('[SarvamLiveActivity] cancelNativeScan failed:', err)
  }
}

export async function previewDocument(params) {
  if (!isNative()) return
  try {
    return await NativePlugin.previewDocument(params)
  } catch (err) {
    console.warn('[SarvamLiveActivity] previewDocument failed:', err)
  }
}

export async function shareContent(params) {
  if (!isNative()) return
  try {
    return await NativePlugin.shareContent(params)
  } catch (err) {
    console.warn('[SarvamLiveActivity] shareContent failed:', err)
  }
}

export async function getLastOpenedURL() {
  if (!isNative()) return null
  try {
    const res = await NativePlugin.getLastOpenedURL()
    return res?.url || null
  } catch (err) {
    console.warn('[SarvamLiveActivity] getLastOpenedURL failed:', err)
    return null
  }
}
