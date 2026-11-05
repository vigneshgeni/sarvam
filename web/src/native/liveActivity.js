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
  try {
    await NativePlugin.startActivity(state)
  } catch (err) {
    console.warn('[LiveActivity] Failed to start activity:', err)
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
    console.warn('[LiveActivity] Failed to update scan progress:', err)
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

  try {
    await NativePlugin.updateActivity(currentActiveState)
  } catch (err) {
    console.warn('[LiveActivity] Failed to mark scan ready:', err)
  }
}

export async function markScanFailed(params) {
  if (!isNative()) return
  if (!currentActiveState) return

  currentActiveState.phase = 'failed'
  currentActiveState.errorMessage = params.errorMessage || 'Service is busy'

  try {
    await NativePlugin.updateActivity(currentActiveState)
  } catch (err) {
    console.warn('[LiveActivity] Failed to mark scan failed:', err)
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
  try {
    await NativePlugin.endActivity({ docId })
  } catch (err) {
    console.warn('[LiveActivity] Failed to end activity:', err)
  }
}

export async function startListenActivity(params) {
  if (!isNative()) return
  if (params.language === 'or') {
    // Odia rule: No listen activity
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

  try {
    await NativePlugin.startActivity(state)
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
    console.warn('[LiveActivity] Failed to start listen activity:', err)
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
