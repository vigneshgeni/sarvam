import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { presentActionDate } from '../src/utils/actionChips.mjs'

const LANG_CODES = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']
const CHIP_KEYS = ['calculatedChip', 'datePassed', 'foundInDoc', 'checkAgainstOriginal']

function dictionary(code) {
  const filePath = fs.existsSync(path.resolve('src/i18n', `${code}.json`))
    ? path.resolve('src/i18n', `${code}.json`)
    : path.resolve('web/src/i18n', `${code}.json`)
  return JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}

const today = new Date(2026, 9, 13) // 13 Oct 2026
const labels = {
  calculatedChip: 'Calculated',
  datePassed: 'Date passed',
  foundInDoc: 'Found in your document',
  checkAgainstOriginal: 'Check against original',
}

test('passed calculated date keeps the Calculated chip and hides the calendar button', () => {
  const chips = presentActionDate(
    {
      text: 'Report an out-of-box defect',
      due_date: '2026-10-10',
      date_status: 'calculated',
      evidence: 'calculated',
      quote: 'within 48 hours of purchase',
    },
    { isPhoto: false, today, t: labels }
  )

  assert.equal(chips.evidenceChip?.text, 'Calculated')
  assert.equal(chips.passedMarker, 'Date passed')
  assert.equal(chips.showCalendar, false)
  assert.equal(chips.evidenceChip?.kind, 'calculated')
})

test('passed matched date keeps the matched chip and hides the calendar button', () => {
  const chips = presentActionDate(
    {
      text: 'Submit the form',
      due_date: '2026-09-01',
      date_status: 'passed',
      evidence: 'matched',
      quote: 'submit by 1 September 2026',
    },
    { isPhoto: false, today, t: labels }
  )

  assert.equal(chips.evidenceChip?.text, 'Found in your document')
  assert.equal(chips.evidenceChip?.kind, 'matched')
  assert.equal(chips.passedMarker, 'Date passed')
  assert.equal(chips.showCalendar, false)
  assert.notEqual(chips.evidenceChip?.text, 'Check against original')
})

test('calculated and passed-marker chip text exists in all nine UI languages', () => {
  const missingDeadlinePassed = []
  for (const code of LANG_CODES) {
    const dict = dictionary(code)
    for (const key of CHIP_KEYS) {
      assert.ok(dict[key] && dict[key].trim().length > 0, `${code} is missing ${key}`)
    }
    if (!dict.deadlinePassed || !dict.deadlinePassed.trim()) {
      missingDeadlinePassed.push(code)
    }
  }
  assert.equal(dictionary('en').calculatedChip, 'Calculated')
  // deadlinePassed is optional; the marker falls back to datePassed.
  assert.deepEqual(missingDeadlinePassed, ['en', 'ta', 'hi', 'te', 'ml', 'kn'])
})
