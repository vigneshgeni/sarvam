import test from 'node:test'
import assert from 'node:assert/strict'

function getGoogleCalendarUrl(title, startDateIso, description) {
  const cleanDate = startDateIso.replace(/-/g, '').slice(0, 8)
  const dates = `${cleanDate}/${cleanDate}`
  let url = `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${encodeURIComponent(
    title
  )}&dates=${dates}`
  if (description) {
    url += `&details=${encodeURIComponent(description)}`
  }
  return url
}

function buildDatesSummary(events) {
  return events
    .map((e) => {
      let line = `• ${e.title}: ${e.startDate}`
      if (e.description) line += ` (${e.description})`
      return line
    })
    .join('\n')
}

function determineCalendarAction({ isIos, canShare, shareOutcome }) {
  if (isIos) {
    if (canShare && shareOutcome === 'shared') {
      return 'share'
    }
    // On iOS Safari, if Web Share is cancelled, failed, or unavailable:
    // skip step 2 (same-tab data URL) and go straight to Reminders sheet with Google Calendar links
    return 'reminders-sheet'
  }
  // Desktop browsers: download .ics file directly
  return 'download'
}

test('Calendar Fallback - Google Calendar URL generation', () => {
  const url = getGoogleCalendarUrl('Submit Life Certificate', '2026-11-30', 'Pension requirement')
  assert(url.includes('https://calendar.google.com/calendar/render'))
  assert(url.includes('text=Submit%20Life%20Certificate'))
  assert(url.includes('dates=20261130/20261130'))
  assert(url.includes('details=Pension%20requirement'))
})

test('Calendar Fallback - Build dates summary text for copying', () => {
  const events = [
    { title: 'Pay Electricity Bill', startDate: '2026-10-15', description: 'Due date' },
    { title: 'Submit Life Certificate', startDate: '2026-11-30' },
  ]
  const text = buildDatesSummary(events)
  assert(text.includes('• Pay Electricity Bill: 2026-10-15 (Due date)'))
  assert(text.includes('• Submit Life Certificate: 2026-11-30'))
})

test('Calendar Fallback - iOS Safari branch skips step 2 directly to Reminders sheet', () => {
  // 1. iOS Safari with successful Web Share
  assert.equal(
    determineCalendarAction({ isIos: true, canShare: true, shareOutcome: 'shared' }),
    'share'
  )

  // 2. iOS Safari where user cancels Web Share -> goes straight to Reminders sheet (skips step 2 data URL)
  assert.equal(
    determineCalendarAction({ isIos: true, canShare: true, shareOutcome: 'cancelled' }),
    'reminders-sheet'
  )

  // 3. iOS Safari where Web Share fails -> goes straight to Reminders sheet
  assert.equal(
    determineCalendarAction({ isIos: true, canShare: true, shareOutcome: 'failed' }),
    'reminders-sheet'
  )

  // 4. iOS Safari where canShare is false (no file share support) -> straight to Reminders sheet
  assert.equal(
    determineCalendarAction({ isIos: true, canShare: false }),
    'reminders-sheet'
  )

  // 5. Desktop browser -> downloads file directly (Step 2)
  assert.equal(
    determineCalendarAction({ isIos: false, canShare: false }),
    'download'
  )
})
