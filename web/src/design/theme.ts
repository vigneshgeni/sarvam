const KEY = 'sarvam.theme'

export function readDarkTheme(): boolean {
  try {
    return localStorage.getItem(KEY) === 'dark'
  } catch {
    return false
  }
}

export function applyDarkTheme(dark: boolean): void {
  if (typeof document === 'undefined') return
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light')
  const meta = document.querySelector('meta[name="theme-color"]')
  if (meta) meta.setAttribute('content', dark ? '#121413' : '#F4F5F2')
  try {
    localStorage.setItem(KEY, dark ? 'dark' : 'light')
  } catch {
    // private mode
  }
  window.dispatchEvent(new Event('sarvam-theme'))
}

export function bootDarkTheme(): void {
  applyDarkTheme(readDarkTheme())
}
