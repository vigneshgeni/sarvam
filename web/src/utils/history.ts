/**
 * History API & Navigation Stack Utilities (WEB-iOS Fix 1)
 *
 * Manages pushState and popstate navigation to prevent accidental app exits on iOS Safari,
 * ensures overlays close first on back-swipe, and restores saved results on reload.
 */

export type AppScreen = 'home' | 'reading' | 'result' | 'tray'

export type OverlayType =
  | 'listen'
  | 'ask'
  | 'accessibility'
  | 'share'
  | 'reminders'
  | 'source'
  | 'password'
  | 'delete_confirm'

export interface HistoryEntry {
  screen: AppScreen
  overlay: OverlayType | null
  timestamp?: number
}

const STORAGE_ACTIVE_RESULT = 'sarvam.active_result'

/**
 * Pure stack transitions for unit testing.
 */
export function pushScreenTransition(
  stack: HistoryEntry[],
  newScreen: AppScreen
): HistoryEntry[] {
  const current = stack[stack.length - 1] || { screen: 'home', overlay: null }
  if (current.screen === newScreen && current.overlay === null) {
    return stack
  }
  return [...stack, { screen: newScreen, overlay: null, timestamp: Date.now() }]
}

export function pushOverlayTransition(
  stack: HistoryEntry[],
  overlay: OverlayType
): HistoryEntry[] {
  const current = stack[stack.length - 1] || { screen: 'home', overlay: null }
  if (current.overlay === overlay) {
    return stack
  }
  return [...stack, { screen: current.screen, overlay, timestamp: Date.now() }]
}

export function popEntryTransition(stack: HistoryEntry[]): {
  newStack: HistoryEntry[]
  closedOverlay: OverlayType | null
  targetScreen: AppScreen
} {
  if (stack.length <= 1) {
    const root = stack[0] || { screen: 'home', overlay: null }
    return {
      newStack: [root],
      closedOverlay: root.overlay,
      targetScreen: root.screen,
    }
  }

  const popped = stack[stack.length - 1]
  const newStack = stack.slice(0, -1)
  const target = newStack[newStack.length - 1]

  return {
    newStack,
    closedOverlay: popped.overlay,
    targetScreen: target.screen,
  }
}

/**
 * Persists current result session to sessionStorage for reload restoration.
 */
export function saveActiveSession(data: any): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.setItem(STORAGE_ACTIVE_RESULT, JSON.stringify(data))
    }
  } catch (err) {
    console.warn('[History] Failed to save active session', err)
  }
}

/**
 * Retrieves persisted result session.
 */
export function loadActiveSession(): any | null {
  try {
    if (typeof sessionStorage !== 'undefined') {
      const raw = sessionStorage.getItem(STORAGE_ACTIVE_RESULT)
      if (raw) return JSON.parse(raw)
    }
  } catch (err) {
    console.warn('[History] Failed to load active session', err)
  }
  return null
}

/**
 * Clears persisted result session.
 */
export function clearActiveSession(): void {
  try {
    if (typeof sessionStorage !== 'undefined') {
      sessionStorage.removeItem(STORAGE_ACTIVE_RESULT)
    }
  } catch (err) {
    console.warn('[History] Failed to clear active session', err)
  }
}

/**
 * Pushes browser history entry.
 */
export function pushBrowserHistory(entry: HistoryEntry): void {
  if (typeof window === 'undefined' || !window.history) return
  const current = window.history.state as HistoryEntry | null
  if (current?.screen === entry.screen && current?.overlay === entry.overlay) {
    return
  }
  window.history.pushState(entry, '')
}

/**
 * Replaces browser history entry.
 */
export function replaceBrowserHistory(entry: HistoryEntry): void {
  if (typeof window === 'undefined' || !window.history) return
  window.history.replaceState(entry, '')
}

/**
 * Seeds history on reload if starting directly on Result screen,
 * ensuring Back goes to Home instead of exiting the PWA.
 */
export function seedResultHistory(): void {
  if (typeof window === 'undefined' || !window.history) return
  window.history.replaceState({ screen: 'home', overlay: null }, '')
  window.history.pushState({ screen: 'result', overlay: null }, '')
}
