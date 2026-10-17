/**
 * Asks that belong to the document on screen.
 * A live thread is used only when it was started for this id.
 * Another document's chat is never a fallback.
 */
export function asksForDocument(id, saved, ownerId, live) {
  if (!id) return []
  const savedTurns = Array.isArray(saved) ? saved : []
  const liveTurns = ownerId === id && Array.isArray(live) ? live : []
  if (liveTurns.length) return liveTurns
  if (savedTurns.length) return savedTurns
  return []
}

/**
 * Chat to show when the document changes.
 * Missing storage is an empty thread, never the previous document's turns.
 */
export function turnsForThread(stored, initial) {
  if (Array.isArray(stored) && stored.length) return stored
  if (Array.isArray(initial) && initial.length) return initial
  return []
}
