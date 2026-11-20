/**
 * Page stack logic for Relay Camera:
 * - Cap at 10 pages maximum.
 * - Resize images to long edge 1600 px before storing.
 * - Keep pages in memory.
 */

export interface CapturedPage {
  id: string
  blob: Blob
  dataUrl: string
  width: number
  height: number
  timestamp: number
}

export const MAX_PAGE_STACK_COUNT = 10

/**
 * Adds a page to the stack if below MAX_PAGE_STACK_COUNT.
 * Returns the updated stack or throws/rejects if over limit.
 */
export function addPageToStack(
  existingPages: readonly CapturedPage[],
  newPage: CapturedPage,
  maxPages = MAX_PAGE_STACK_COUNT,
): { pages: CapturedPage[]; accepted: boolean; error?: string } {
  if (existingPages.length >= maxPages) {
    return {
      pages: [...existingPages],
      accepted: false,
      error: `Maximum ${maxPages} pages reached`,
    }
  }
  return {
    pages: [...existingPages, newPage],
    accepted: true,
  }
}

/**
 * Removes a page by ID, preserving the order of remaining pages.
 */
export function removePageFromStack(
  existingPages: readonly CapturedPage[],
  pageId: string,
): CapturedPage[] {
  return existingPages.filter((p) => p.id !== pageId)
}

/**
 * Reorders a page from `fromIndex` to `toIndex`, clamping out-of-range indices safely.
 */
export function reorderPageInStack(
  existingPages: readonly CapturedPage[],
  fromIndex: number,
  toIndex: number,
): CapturedPage[] {
  if (
    existingPages.length <= 1 ||
    fromIndex < 0 ||
    fromIndex >= existingPages.length ||
    toIndex < 0 ||
    toIndex >= existingPages.length ||
    fromIndex === toIndex
  ) {
    return [...existingPages]
  }
  const next = [...existingPages]
  const [moved] = next.splice(fromIndex, 1)
  next.splice(toIndex, 0, moved)
  return next
}

/**
 * Calculates long-edge scaling dimensions preserving aspect ratio.
 */
export function calculateLongEdgeDimensions(
  width: number,
  height: number,
  maxLongEdge = 1600,
): { targetWidth: number; targetHeight: number; scaled: boolean } {
  if (width <= 0 || height <= 0) {
    return { targetWidth: Math.max(1, width), targetHeight: Math.max(1, height), scaled: false }
  }

  const longEdge = Math.max(width, height)
  if (longEdge <= maxLongEdge) {
    return { targetWidth: width, targetHeight: height, scaled: false }
  }

  const ratio = maxLongEdge / longEdge
  return {
    targetWidth: Math.round(width * ratio),
    targetHeight: Math.round(height * ratio),
    scaled: true,
  }
}
