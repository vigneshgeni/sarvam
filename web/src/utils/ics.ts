/**
 * RFC 5545 iCalendar generator for Sarvam
 * Supports CRLF endings, 75-octet line folding, proper escaping,
 * stable UIDs, VALARM alarms, and RRULE recurring events.
 */

export interface CalendarEventInput {
  uid: string
  title: string
  description?: string
  startDate: string // YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
  endDate?: string
  isAllDay: boolean
  rrule?: string
  alarmTrigger?: string // e.g. 'PT9H', '-PT15H', '-P2DT15H', '-P6DT15H'
}

/**
 * Escapes characters according to RFC 5545 section 3.3.11:
 * \ -> \\, ; -> \;, , -> \,, and \n -> \n
 */
export function escapeIcsText(str: string): string {
  if (!str) return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

/**
 * Folds a line at 75 octets (bytes) per RFC 5545 section 3.1.
 * Continuation lines begin with a single space.
 */
export function foldLine(line: string): string {
  const maxBytes = 75
  const encoder = new TextEncoder()
  const bytes = encoder.encode(line)
  if (bytes.length <= maxBytes) {
    return line
  }

  const chunks: string[] = []
  let currentStart = 0

  while (currentStart < line.length) {
    let low = currentStart + 1
    let high = line.length
    let best = low

    // Binary search the character slice that stays <= 75 bytes (or 74 bytes for continuation line with leading space)
    const limit = chunks.length === 0 ? maxBytes : maxBytes - 1

    while (low <= high) {
      const mid = Math.floor((low + high) / 2)
      const sliceBytes = encoder.encode(line.slice(currentStart, mid))
      if (sliceBytes.length <= limit) {
        best = mid
        low = mid + 1
      } else {
        high = mid - 1
      }
    }

    const chunk = line.slice(currentStart, best)
    if (chunks.length === 0) {
      chunks.push(chunk)
    } else {
      chunks.push(' ' + chunk)
    }
    currentStart = best
  }

  return chunks.join('\r\n')
}

/**
 * Simple stable 32-bit hash function for string IDs
 */
export function hashString(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0 // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/**
 * Generates an RFC 5545 iCalendar format string with CRLF endings.
 */
export function generateIcs(events: CalendarEventInput[]): string {
  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sarvam//Sarvam Document Reader//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  const nowStamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.uid}@sarvam.ai`)
    lines.push(`DTSTAMP:${nowStamp}`)

    if (event.isAllDay) {
      // Date only: YYYYMMDD
      const datePart = event.startDate.replace(/-/g, '').slice(0, 8)
      lines.push(`DTSTART;VALUE=DATE:${datePart}`)
    } else {
      // Timed: Floating local time (no Z) YYYYMMDDTHHMMSS
      const clean = event.startDate.replace(/[-:]/g, '')
      lines.push(`DTSTART:${clean}`)
    }

    lines.push(`SUMMARY:${escapeIcsText(event.title)}`)
    if (event.description) {
      lines.push(`DESCRIPTION:${escapeIcsText(event.description)}`)
    }

    if (event.rrule) {
      lines.push(`RRULE:${event.rrule}`)
    }

    if (event.alarmTrigger) {
      lines.push('BEGIN:VALARM')
      lines.push('ACTION:DISPLAY')
      lines.push(`DESCRIPTION:${escapeIcsText(event.title)}`)
      lines.push(`TRIGGER:${event.alarmTrigger}`)
      lines.push('END:VALARM')
    }

    lines.push('END:VEVENT')
  }

  lines.push('END:VCALENDAR')

  // Fold each line at 75 octets and join with CRLF
  return lines.map((l) => foldLine(l)).join('\r\n') + '\r\n'
}

/**
 * Triggers download of an .ics file in browser
 */
export function downloadIcs(filename: string, icsContent: string): void {
  const blob = new Blob([icsContent], { type: 'text/calendar;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename.endsWith('.ics') ? filename : `${filename}.ics`
  document.body.appendChild(a)
  a.click()
  document.body.removeChild(a)
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

/**
 * Generates Google Calendar web render URL
 */
export function getGoogleCalendarUrl(
  title: string,
  startDateIso: string,
  description?: string
): string {
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
