/**
 * Which date chips an action shows.
 * The evidence chip follows the API evidence label.
 * "Date passed" is extra, and it does not replace that chip.
 */

function isDatePassed(dateStr, today = new Date()) {
  if (!dateStr || typeof dateStr !== 'string') return false
  const trimmed = dateStr.trim()
  let d = null

  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed)
  if (isoMatch) {
    d = new Date(
      parseInt(isoMatch[1], 10),
      parseInt(isoMatch[2], 10) - 1,
      parseInt(isoMatch[3], 10)
    )
  }

  const dmyMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(trimmed)
  if (dmyMatch) {
    d = new Date(
      parseInt(dmyMatch[3], 10),
      parseInt(dmyMatch[2], 10) - 1,
      parseInt(dmyMatch[1], 10)
    )
  }

  if (!d || isNaN(d.getTime())) return false
  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())
  return targetDate.getTime() < localToday.getTime()
}

export function presentActionDate(action, { isPhoto = false, today = new Date(), t = {} } = {}) {
  const isPassed = action?.date_status === 'passed' || isDatePassed(action?.due_date, today)
  const passedMarker = isPassed ? t.deadlinePassed || t.datePassed || 'Date passed' : null

  let evidenceChip = null
  if (action?.evidence === 'calculated') {
    evidenceChip = { kind: 'calculated', text: t.calculatedChip || 'Calculated' }
  } else if (action?.evidence === 'matched') {
    evidenceChip = { kind: 'matched', text: t.foundInDoc || 'Found in your document' }
  } else if (!isPhoto && action?.quote) {
    evidenceChip = {
      kind: 'check_original',
      text: t.checkAgainstOriginal || 'Check against original',
    }
  }

  const showCalendar = !isPassed && !!(action?.due_date || action?.recurrence)
  return { isPassed, passedMarker, evidenceChip, showCalendar }
}
