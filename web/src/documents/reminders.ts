import type { DocumentProfile } from '../types'

/** Monthly EMI rule only when the day and the tenure are both printed. */
export function emiRrule(profile?: DocumentProfile | null): string | undefined {
  if (!profile?.emi_day_of_month || !profile.tenure) return undefined
  const day = profile.emi_day_of_month
  if (day < 1 || day > 31) return undefined
  return `FREQ=MONTHLY;BYMONTHDAY=${day}`
}

/** Notice-by date, counted back from the printed end date. Null when it cannot be counted. */
export function noticeByDate(end?: string | null, notice?: string | null): string | null {
  if (!end || !notice || !/^\d{4}-\d{2}-\d{2}$/.test(end)) return null
  const months = notice.match(/(\d+)\s*month/i)
  const days = notice.match(/(\d+)\s*day/i)
  const date = new Date(`${end}T00:00:00`)
  if (Number.isNaN(date.getTime())) return null
  if (months) date.setMonth(date.getMonth() - Number(months[1]))
  else if (days) date.setDate(date.getDate() - Number(days[1]))
  else return null
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function isUpcoming(iso?: string | null): boolean {
  if (!iso) return false
  const today = new Date().toISOString().slice(0, 10)
  return iso >= today
}
