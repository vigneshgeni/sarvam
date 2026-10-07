/**
 * Localised date formatting using Intl.DateTimeFormat.
 * Ensures NO ISO dates (YYYY-MM-DD) appear anywhere in the UI.
 */
export function formatDate(
  dateStr: string | null | undefined,
  lang: string
): string {
  if (!dateStr || typeof dateStr !== 'string') return ''

  const trimmed = dateStr.trim()

  // Match YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    const d = new Date(year, month, day)
    try {
      return new Intl.DateTimeFormat(lang, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d)
    } catch {
      return new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d)
    }
  }

  // Match DD.MM.YYYY
  const dotMatch = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(trimmed)
  if (dotMatch) {
    const day = parseInt(dotMatch[1], 10)
    const month = parseInt(dotMatch[2], 10) - 1
    const year = parseInt(dotMatch[3], 10)
    const d = new Date(year, month, day)
    try {
      return new Intl.DateTimeFormat(lang, {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d)
    } catch {
      return new Intl.DateTimeFormat('en', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(d)
    }
  }

  // If already non-ISO (e.g. "Mid-November" or natural words), return as-is
  return trimmed
}

/**
 * Builds the Calculated chip text entirely in the UI language from deadline_days.
 * Never mixes two languages in one chip.
 * Example: "Calculated: 31 Oct 2026 (30 days from the letter date)"
 */
export function buildCalculatedChipText(
  dueDate: string | null | undefined,
  deadlineDays: number | null | undefined,
  t: Record<string, string>,
  lang: string
): string {
  const formattedDate = formatDate(dueDate, lang)
  const calcPrefix = t.calculated || 'Calculated'

  if (deadlineDays && deadlineDays > 0) {
    const daysRuleTemplate =
      t.daysFromLetterDate || '{days} days from the letter date'
    const daysRule = daysRuleTemplate.replace('{days}', String(deadlineDays))
    return formattedDate
      ? `${calcPrefix}: ${formattedDate} (${daysRule})`
      : `${calcPrefix} (${daysRule})`
  }

  return formattedDate ? `${calcPrefix}: ${formattedDate}` : calcPrefix
}
