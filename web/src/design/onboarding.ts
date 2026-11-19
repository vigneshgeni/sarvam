export const ONBOARDING_SEEN_KEY = 'sarvam.onboardingSeen'

export function shouldShowOnboarding(input: {
  seenThisSession: boolean
  hasRestoredResult: boolean
  hasOpenOverlay: boolean
  fromSharedLink: boolean
}): boolean {
  if (input.seenThisSession) return false
  if (input.hasRestoredResult || input.hasOpenOverlay) return false
  if (input.fromSharedLink) return false
  return true
}

/** Where to land when the page comes back without its result still in memory. */
export function screenAfterReturn(
  current: { screen: string; hasResult: boolean },
  saved: { screen?: string; result?: unknown } | null,
  opts?: { scanInFlight?: boolean }
): { screen: 'home' | 'reading' | 'result' | 'tray'; restore: boolean } {
  // iPhone app: a scan keeps running natively while the app is in the background. Coming back
  // must keep the reading screen (its result is about to arrive), not jump Home or restore an
  // older document from the saved session.
  if (opts?.scanInFlight && current.screen === 'reading') {
    return { screen: 'reading', restore: false }
  }
  if (current.hasResult) {
    const screen = current.screen === 'reading' || current.screen === 'tray' || current.screen === 'result' ? current.screen : 'home'
    return { screen, restore: false }
  }
  if (saved?.result) {
    return { screen: saved.screen === 'reading' ? 'reading' : 'result', restore: true }
  }
  if (current.screen === 'result' || current.screen === 'reading') {
    return { screen: 'home', restore: false }
  }
  const screen = current.screen === 'tray' ? 'tray' : 'home'
  return { screen, restore: false }
}
