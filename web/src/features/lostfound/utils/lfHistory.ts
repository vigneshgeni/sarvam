/** Browser-history helpers for Lost & Found. State is namespaced only under `lf`. */

export const LF_HISTORY_KEY = 'lf' as const

export type LfHistoryPayload = {
  depth: number
  screenId: string
}

export function readLf(state: unknown): LfHistoryPayload | null {
  if (!state || typeof state !== 'object') return null
  if (!Object.prototype.hasOwnProperty.call(state, LF_HISTORY_KEY)) return null
  const raw = (state as { lf?: unknown }).lf
  if (!raw || typeof raw !== 'object') return null
  const depth = (raw as { depth?: unknown }).depth
  const screenId = (raw as { screenId?: unknown }).screenId
  if (typeof depth !== 'number' || typeof screenId !== 'string') return null
  return { depth, screenId }
}

export function pushLf(payload: LfHistoryPayload): void {
  window.history.pushState({ [LF_HISTORY_KEY]: payload }, '')
}

export function replaceLf(payload: LfHistoryPayload | null): void {
  if (payload) {
    window.history.replaceState({ [LF_HISTORY_KEY]: payload }, '')
  } else {
    window.history.replaceState({}, '')
  }
}

/**
 * Drop leftover LF history after a reload so the tab opens on the root,
 * not a blank overlay. Returns how many popstate events to ignore.
 */
export function rewindLfHistoryOnLoad(): number {
  const lf = readLf(window.history.state)
  if (!lf || lf.depth <= 0) {
    if (lf) replaceLf(null)
    return 0
  }
  window.history.go(-lf.depth)
  // history.go fires a single popstate at the destination.
  return 1
}
