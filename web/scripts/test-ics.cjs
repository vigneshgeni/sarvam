// Unit test for RFC 5545 generator
const assert = require('assert')

function escapeIcsText(str) {
  if (!str) return ''
  return str
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\r?\n/g, '\\n')
}

function foldLine(line) {
  const maxBytes = 75
  const encoder = new TextEncoder()
  const bytes = encoder.encode(line)
  if (bytes.length <= maxBytes) return line

  const chunks = []
  let currentStart = 0

  while (currentStart < line.length) {
    let low = currentStart + 1
    let high = line.length
    let best = low
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

function hashString(str) {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = (hash << 5) - hash + char
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

function generateIcs(events) {
  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Sarvam//Sarvam Document Reader//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
  ]

  const nowStamp = '20261008T120000'

  for (const event of events) {
    lines.push('BEGIN:VEVENT')
    lines.push(`UID:${event.uid}@sarvam.ai`)
    lines.push(`DTSTAMP:${nowStamp}`)

    if (event.isAllDay) {
      const datePart = event.startDate.replace(/-/g, '').slice(0, 8)
      lines.push(`DTSTART;VALUE=DATE:${datePart}`)
    } else {
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
  return lines.map((l) => foldLine(l)).join('\r\n') + '\r\n'
}

console.log('--- Running ICS Unit Tests ---')

// 1. CRLF line endings
const sampleEvent = {
  uid: 'test1234',
  title: 'Pay Electricity Bill',
  description: 'Calculated: 30 days from invoice date. Pay before due date; penalty applies, take note.',
  startDate: '2026-11-15',
  isAllDay: true,
  alarmTrigger: 'PT9H',
}
const output = generateIcs([sampleEvent])
assert(output.includes('\r\n'), 'Output must contain CRLF line endings')
assert(!output.replace(/\r\n/g, '').includes('\n'), 'Output must not contain standalone LF')
console.log('✓ CRLF line endings test passed')

// 2. Escaping test
const textWithSpecial = 'A; B, C\\D\nSecond Line'
const escaped = escapeIcsText(textWithSpecial)
assert.strictEqual(escaped, 'A\\; B\\, C\\\\D\\nSecond Line')
console.log('✓ Escaping test passed')

// 3. Line folding test (<= 75 octets)
const longSummary = 'A'.repeat(120)
const folded = foldLine(`SUMMARY:${longSummary}`)
const foldedLines = folded.split('\r\n')
assert(foldedLines.length >= 2, 'Long line should be folded into multiple lines')
for (const line of foldedLines) {
  const bytes = Buffer.byteLength(line, 'utf8')
  assert(bytes <= 75, `Folded line length ${bytes} exceeds 75 octets: ${line}`)
}
assert(foldedLines[1].startsWith(' '), 'Continuation line must start with space')
console.log('✓ 75-octet folding test passed')

// 4. Stable UID test
const uid1 = hashString('result-101:action-0')
const uid2 = hashString('result-101:action-0')
assert.strictEqual(uid1, uid2, 'UID must be stable across invocations')
console.log('✓ Stable UID test passed')

// 5. Alarm triggers test
const alarmEvent = {
  uid: 'alarm-1',
  title: 'Renewal Notice',
  startDate: '2026-11-30',
  isAllDay: true,
  alarmTrigger: '-PT15H',
}
const alarmIcs = generateIcs([alarmEvent])
assert(alarmIcs.includes('BEGIN:VALARM'), 'Must include VALARM')
assert(alarmIcs.includes('TRIGGER:-PT15H'), 'Must include correct TRIGGER')
console.log('✓ Alarm triggers test passed')

// 6. Medicine RRULE test
const medEvent = {
  uid: 'med-1',
  title: 'Take Augmentin 625mg',
  description: 'From your prescription. Check the original. Sarvam does not give medical advice.',
  startDate: '20261008T080000',
  isAllDay: false,
  rrule: 'FREQ=DAILY;COUNT=5',
}
const medIcs = generateIcs([medEvent])
assert(medIcs.includes('RRULE:FREQ=DAILY;COUNT=5'), 'Must contain daily RRULE with COUNT')
assert(medIcs.includes('Take Augmentin 625mg'), 'Must include medicine title')
console.log('✓ Medicine RRULE test passed')

console.log('ALL ICS UNIT TESTS PASSED!')
