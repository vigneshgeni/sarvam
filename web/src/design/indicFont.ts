const FAMILIES: Record<string, { family: string; files: [number, string][] }> = {
  ta: {
    family: 'Noto Sans Tamil',
    files: [
      [400, 'noto-sans-tamil-tamil-400-normal.woff2'],
      [500, 'noto-sans-tamil-tamil-500-normal.woff2'],
      [600, 'noto-sans-tamil-tamil-600-normal.woff2'],
      [700, 'noto-sans-tamil-tamil-700-normal.woff2'],
    ],
  },
  hi: {
    family: 'Noto Sans Devanagari',
    files: [
      [600, 'noto-sans-devanagari-devanagari-600-normal.woff2'],
      [700, 'noto-sans-devanagari-devanagari-700-normal.woff2'],
    ],
  },
  mr: {
    family: 'Noto Sans Devanagari',
    files: [
      [600, 'noto-sans-devanagari-devanagari-600-normal.woff2'],
      [700, 'noto-sans-devanagari-devanagari-700-normal.woff2'],
    ],
  },
  te: {
    family: 'Noto Sans Telugu',
    files: [
      [600, 'noto-sans-telugu-telugu-600-normal.woff2'],
      [700, 'noto-sans-telugu-telugu-700-normal.woff2'],
    ],
  },
  ml: {
    family: 'Noto Sans Malayalam',
    files: [
      [600, 'noto-sans-malayalam-malayalam-600-normal.woff2'],
      [700, 'noto-sans-malayalam-malayalam-700-normal.woff2'],
    ],
  },
  bn: {
    family: 'Noto Sans Bengali',
    files: [
      [600, 'noto-sans-bengali-bengali-600-normal.woff2'],
      [700, 'noto-sans-bengali-bengali-700-normal.woff2'],
    ],
  },
  or: {
    family: 'Noto Sans Oriya',
    files: [
      [600, 'noto-sans-oriya-oriya-600-normal.woff2'],
      [700, 'noto-sans-oriya-oriya-700-normal.woff2'],
    ],
  },
  kn: {
    family: 'Noto Sans Kannada',
    files: [
      [600, 'noto-sans-kannada-kannada-600-normal.woff2'],
      [700, 'noto-sans-kannada-kannada-700-normal.woff2'],
    ],
  },
}

const loaded = new Set<string>()

export function indicFamily(lang: string): string | null {
  return FAMILIES[lang]?.family ?? null
}

/** Load a script. The active family follows the selected language, not the last font loaded. */
export function ensureIndicFont(lang: string, apply = true): void {
  if (typeof document === 'undefined') return
  const item = FAMILIES[lang]
  if (!item) {
    if (apply) document.documentElement.style.setProperty('--sv-indic-family', "'DM Sans'")
    return
  }
  if (apply) document.documentElement.style.setProperty('--sv-indic-family', `'${item.family}'`)
  if (loaded.has(item.family)) return
  loaded.add(item.family)
  const css = item.files
    .map(
      ([weight, file]) =>
        `@font-face{font-family:'${item.family}';src:url('/fonts/${file}') format('woff2');font-weight:${weight};font-display:swap;}`
    )
    .join('')
  const style = document.createElement('style')
  style.dataset.indic = lang
  style.textContent = css
  document.head.appendChild(style)
}

export function ensureOnboardingFonts(): void {
  for (const code of Object.keys(FAMILIES)) ensureIndicFont(code, false)
}

export function chipFont(langId: string): string {
  const family = indicFamily(langId)
  return family ? `'${family}', sans-serif` : "'DM Sans', sans-serif"
}
