/**
 * Pure state machine and drag physics for the 3-detent LiveSheet bottom sheet.
 *
 * Detents:
 * - 'collapsed': 72 px bottom bar (camera & shutter stay fully visible/reachable)
 * - 'half': ~360 px (pages strip + last few caption bubbles)
 * - 'full': ~82% viewport height (pages strip + full scrollable transcript)
 */

export type SheetDetent = 'collapsed' | 'half' | 'full'

export const SHEET_COLLAPSED_HEIGHT = 72
export const SHEET_HALF_DEFAULT_HEIGHT = 360
export const SHEET_FULL_RATIO = 0.82
export const SHEET_FLICK_VELOCITY_PX_PER_MS = 0.45

export function getDetentHeights(viewportHeight: number): Record<SheetDetent, number> {
  const vh = Math.max(480, viewportHeight || 844)
  const full = Math.round(Math.min(vh - 64, Math.max(480, vh * SHEET_FULL_RATIO)))
  const half = Math.round(Math.min(full - 100, Math.max(300, Math.min(SHEET_HALF_DEFAULT_HEIGHT, vh * 0.46))))
  return {
    collapsed: SHEET_COLLAPSED_HEIGHT,
    half,
    full,
  }
}

export function cycleSheetDetent(current: SheetDetent): SheetDetent {
  if (current === 'collapsed') return 'half'
  if (current === 'half') return 'full'
  return 'collapsed'
}

export function clampSheetHeight(height: number, viewportHeight: number): number {
  const heights = getDetentHeights(viewportHeight)
  return Math.max(heights.collapsed, Math.min(heights.full, height))
}

export interface SheetDragEndInput {
  startDetent: SheetDetent
  startHeight: number
  currentHeight: number
  /** Positive velocityY means swiping DOWN (collapsing), negative means swiping UP (expanding). */
  velocityY: number
  viewportHeight: number
}

export function resolveSheetDragEnd(input: SheetDragEndInput): SheetDetent {
  const { startDetent, startHeight, currentHeight, velocityY, viewportHeight } = input
  const heights = getDetentHeights(viewportHeight)
  const deltaHeight = currentHeight - startHeight // positive = dragged up, negative = dragged down

  // Fast downward flick -> step down one detent (or jump to collapsed if large drag)
  if (velocityY > SHEET_FLICK_VELOCITY_PX_PER_MS) {
    if (startDetent === 'full') {
      return currentHeight < heights.half - 40 ? 'collapsed' : 'half'
    }
    return 'collapsed'
  }

  // Fast upward flick -> step up one detent (or jump to full if large drag)
  if (velocityY < -SHEET_FLICK_VELOCITY_PX_PER_MS) {
    if (startDetent === 'collapsed') {
      return currentHeight > heights.half + 40 ? 'full' : 'half'
    }
    return 'full'
  }

  // Moderate deliberate drag (> 55 px) even without high flick speed
  if (deltaHeight <= -55) {
    if (startDetent === 'full' && currentHeight >= (heights.collapsed + heights.half) / 2) {
      return 'half'
    }
    return 'collapsed'
  }
  if (deltaHeight >= 55) {
    if (startDetent === 'collapsed' && currentHeight <= (heights.half + heights.full) / 2) {
      return 'half'
    }
    return 'full'
  }

  // Otherwise snap to nearest detent height
  const entries: Array<[SheetDetent, number]> = [
    ['collapsed', Math.abs(currentHeight - heights.collapsed)],
    ['half', Math.abs(currentHeight - heights.half)],
    ['full', Math.abs(currentHeight - heights.full)],
  ]
  entries.sort((a, b) => a[1] - b[1])
  return entries[0][0]
}

export function handleSheetKeyAction(current: SheetDetent, key: string): SheetDetent | null {
  if (key === 'Enter' || key === ' ') {
    return cycleSheetDetent(current)
  }
  if (key === 'Escape') {
    return 'collapsed'
  }
  return null
}
