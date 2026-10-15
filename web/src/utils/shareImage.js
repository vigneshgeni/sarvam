/** Make a cloned result safe to paint into a PNG. Animations stay at their end state. */

export function prepareExportNode(root) {
  const nodes = [root, ...root.querySelectorAll('*')]
  for (const el of nodes) {
    if (!el || !el.style) continue
    el.style.animation = 'none'
    el.style.transition = 'none'
    el.style.opacity = '1'
    el.style.visibility = 'visible'
    el.style.transform = 'none'
    if (el.style.position === 'sticky' || el.style.position === 'fixed') el.style.position = 'static'
    el.classList?.remove?.('sv-card-in', 'animate-card-in', 'sv-screen-in', 'animate-tick-draw')
    if (el.tagName === 'DETAILS') el.open = true
  }
  return root
}

export function exportHasHiddenPaint(root) {
  return [root, ...root.querySelectorAll('*')].some((el) => {
    const opacity = String(el.style?.opacity ?? '')
    const visibility = String(el.style?.visibility ?? '')
    return opacity === '0' || visibility === 'hidden'
  })
}
