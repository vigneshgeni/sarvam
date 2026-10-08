export function agoFromIso(iso: string | null | undefined): string {
  if (!iso) return ''
  const day = iso.slice(0, 10)
  const today = new Date()
  const ist = new Date(today.getTime() + 5.5 * 3600 * 1000)
  const todayStr = ist.toISOString().slice(0, 10)
  const then = Date.parse(day + 'T00:00:00+05:30')
  const now = Date.parse(todayStr + 'T00:00:00+05:30')
  const days = Math.round((now - then) / 86400000)
  if (days <= 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return `${days} days ago`
}

export function todayIso(): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  return ist.toISOString().slice(0, 10)
}

export function daysAgoIso(n: number): string {
  const ist = new Date(Date.now() + 5.5 * 3600 * 1000)
  ist.setUTCDate(ist.getUTCDate() - n)
  return ist.toISOString().slice(0, 10)
}
