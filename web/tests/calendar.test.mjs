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

function determineExportStrategy({ hasWebShare, canShareFiles, isIosSafari }) {
  // Strategy 1: Web share with .ics file
  if (hasWebShare && canShareFiles) {
    return 'web-share-file'
  }
  // Strategy 2: .ics data URL opened in same tab (non-iOS or supported browsers)
  if (!isIosSafari) {
    return 'same-tab-data-url'
  }
  // Strategy 3: Visible list with Google Calendar links + Copy button
  return 'visible-list-fallback'
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

test('Calendar Fallback - In-order strategy selection', () => {
  // 1. Web Share supported with files -> uses web-share
  assert.equal(
    determineExportStrategy({ hasWebShare: true, canShareFiles: true, isIosSafari: true }),
    'web-share-file'
  )

  // 2. Desktop or Android without file share -> uses same tab data URL
  assert.equal(
    determineExportStrategy({ hasWebShare: false, canShareFiles: false, isIosSafari: false }),
    'same-tab-data-url'
  )

  // 3. iOS Safari without file share support -> falls back to visible list with links + copy
  assert.equal(
    determineExportStrategy({ hasWebShare: false, canShareFiles: false, isIosSafari: true }),
    'visible-list-fallback'
  )
})
