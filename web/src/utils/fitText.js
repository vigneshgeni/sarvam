/** Pick a font size so a single-line value stays inside its box. */
export function fittedPx(needed, available, max, min) {
  const need = Number(needed)
  const room = Number(available)
  const hi = Number(max)
  const lo = Number(min)
  if (!(room > 0) || !(need > room)) return hi
  return Math.max(lo, Math.floor((hi * room) / need))
}
