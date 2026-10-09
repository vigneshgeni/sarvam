const TOKEN_KEY = 'sarvam.lf.demoToken'

export function getDemoToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY)
  } catch {
    return null
  }
}

export function setDemoToken(token: string): void {
  try {
    localStorage.setItem(TOKEN_KEY, token)
  } catch {
    /* ignore */
  }
}

export function clearDemoToken(): void {
  try {
    localStorage.removeItem(TOKEN_KEY)
  } catch {
    /* ignore */
  }
}

export function getAppLanguage(): string {
  try {
    const saved = localStorage.getItem('sarvam.lang')
    if (saved) return saved
  } catch {
    /* ignore */
  }
  return 'en'
}
