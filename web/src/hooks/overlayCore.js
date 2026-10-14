export const STORAGE_ACTIVE_RESULT = 'sarvam.active_result'

export function loadActiveSession() {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(STORAGE_ACTIVE_RESULT)
      if (raw) return JSON.parse(raw)
    }
  } catch (err) {
    // ignore
  }
  return null
}

/**
 * Core logic to verify and restore overlay data, or cleanly close overlay.
 */
export function restoreActiveOverlay(currentData, callbacks) {
  // If data already exists, nothing to restore
  if (currentData) {
    return { restored: false, data: currentData, closed: false }
  }

  // Attempt to load from persisted session
  const saved = loadActiveSession()
  if (saved && (saved.result || saved.active_result)) {
    if (callbacks?.onRestore) {
      callbacks.onRestore(saved)
    }
    if (typeof window !== 'undefined' && window.dispatchEvent) {
      window.dispatchEvent(new CustomEvent('sarvam:restore-session', { detail: saved }))
    }
    return { restored: true, data: saved, closed: false }
  }

  // No saved data found - close overlay cleanly and return home
  const calmMessage = 'Session expired. Returning to Home.'
  if (callbacks?.onClose) {
    callbacks.onClose(calmMessage)
  }
  if (typeof window !== 'undefined') {
    if (window.history && window.history.replaceState) {
      window.history.replaceState({ screen: 'home', overlay: null }, '')
    }
    if (window.dispatchEvent) {
      window.dispatchEvent(
        new CustomEvent('sarvam:close-overlay', { detail: { message: calmMessage } })
      )
    }
  }
  return { restored: false, data: null, closed: true }
}
