import test from 'node:test'
import assert from 'node:assert/strict'

export function isDatePassed(dateStr, today = new Date()) {
  if (!dateStr || typeof dateStr !== 'string') return false
  const trimmed = dateStr.trim()

  let d = null

  // Match YYYY-MM-DD
  const isoMatch = /^(\d{4})-(\d{1,2})-(\d{1,2})(?:[T\s].*)?$/.exec(trimmed)
  if (isoMatch) {
    const year = parseInt(isoMatch[1], 10)
    const month = parseInt(isoMatch[2], 10) - 1
    const day = parseInt(isoMatch[3], 10)
    d = new Date(year, month, day)
  }

  // Match DD.MM.YYYY, DD-MM-YYYY, DD/MM/YYYY
  const dmyMatch = /^(\d{1,2})[./-](\d{1,2})[./-](\d{4})$/.exec(trimmed)
  if (dmyMatch) {
    const day = parseInt(dmyMatch[1], 10)
    const month = parseInt(dmyMatch[2], 10) - 1
    const year = parseInt(dmyMatch[3], 10)
    d = new Date(year, month, day)
  }

  if (!d || isNaN(d.getTime())) return false

  const localToday = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  const targetDate = new Date(d.getFullYear(), d.getMonth(), d.getDate())

  return targetDate.getTime() < localToday.getTime()
}

test('isDatePassed - correctly identifies past vs upcoming dates relative to today', () => {
  const refToday = new Date(2026, 9, 12) // 12 Oct 2026

  // Past dates
  assert.equal(isDatePassed('2026-09-30', refToday), true)
  assert.equal(isDatePassed('2026-10-11', refToday), true)
  assert.equal(isDatePassed('01.10.2026', refToday), true)
  assert.equal(isDatePassed('15-08-2026', refToday), true)
  assert.equal(isDatePassed('01/09/2026', refToday), true)

  // Today (not passed)
  assert.equal(isDatePassed('2026-10-12', refToday), false)
  assert.equal(isDatePassed('12.10.2026', refToday), false)

  // Future dates
  assert.equal(isDatePassed('2026-10-13', refToday), false)
  assert.equal(isDatePassed('30.11.2026', refToday), false)
  assert.equal(isDatePassed('2026-11-30', refToday), false)

  // Null, undefined, empty
  assert.equal(isDatePassed(null, refToday), false)
  assert.equal(isDatePassed(undefined, refToday), false)
  assert.equal(isDatePassed('', refToday), false)
})

test('Past dates filter - excludes past actions from calendar and keeps future/recurring', () => {
  const refToday = new Date(2026, 9, 12) // 12 Oct 2026

  const actions = [
    { text: 'Pay past bill', due_date: '2026-09-30', date_status: 'upcoming' }, // Date has elapsed
    { text: 'Pay upcoming premium', due_date: '2026-10-31', date_status: 'upcoming' },
    { text: 'Pay recurring maintenance', due_date: null, recurrence: '31st of every month', date_status: 'recurring' },
    { text: 'Past life certificate', due_date: '2026-09-15', date_status: 'passed' },
  ]

  const validForCalendar = actions.filter(
    (a) => !isDatePassed(a.due_date, refToday) && a.date_status !== 'passed' && (a.due_date || a.recurrence)
  )

  assert.equal(validForCalendar.length, 2)
  assert.equal(validForCalendar[0].text, 'Pay upcoming premium')
  assert.equal(validForCalendar[1].text, 'Pay recurring maintenance')
})
