import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { createRequire } from 'node:module'
import {
  calendarDraftEvent,
  collectReminders,
  dismissNext,
  pastReminders,
  readDismissed,
  reminderSummary,
  upcomingReminders,
  writeDismissed,
} from '../src/utils/reminders.js'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const source = readFileSync(new URL('../src/documents/reminders.ts', import.meta.url), 'utf8')
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const file = join(mkdtempSync(join(tmpdir(), 'sarvam-rem-')), 'reminders.mjs')
writeFileSync(file, js)
const { emiRrule, noticeByDate } = await import(pathToFileURL(file).href)

test('EMI repeats monthly only when the day and the tenure are printed', () => {
  assert.equal(emiRrule({ emi_day_of_month: 5, tenure: '20 years' }), 'FREQ=MONTHLY;BYMONTHDAY=5')
  assert.equal(emiRrule({ emi_day_of_month: 5 }), undefined)
  assert.equal(emiRrule({ tenure: '20 years' }), undefined)
})

test('notice-by date counts back from the printed end date', () => {
  assert.equal(noticeByDate('2027-09-01', '2 months'), '2027-07-01')
  assert.equal(noticeByDate('2027-09-01', 'as agreed'), null)
})

const now = new Date(2026, 9, 15, 10, 0, 0)
const today = '2026-10-15'

function recent(extra) {
  return {
    id: 'rec-1',
    title: 'Lab report',
    displayName: 'Medical report',
    result: {
      language: 'en',
      actions: [
        { text: 'Go for a review on 15 Jan 2027 with repeat lipid profile and HbA1c tests at the clinic', due_date: '2027-01-15', date_status: 'upcoming' },
        { text: 'Pay the older bill', due_date: '2026-10-01', date_status: 'passed' },
      ],
      medicines: [{ name: 'Amoxicillin', slots: ['morning'] }],
    },
    activity: { remindersAdded: {}, medicine: { slots: {}, times: {}, durations: {} } },
    ...extra,
  }
}

test('dismiss hides one upcoming item and the next one comes back', () => {
  const rows = collectReminders([
    recent(),
    {
      id: 'rec-2',
      title: 'Notice',
      result: {
        actions: [{ text: 'File the reply', due_date: '2026-11-02', date_status: 'upcoming' }],
      },
    },
  ], { now, today, lang: 'en' })
  const first = upcomingReminders(rows, [])
  assert.equal(first.length > 1, true)
  assert.equal(first[0].id.startsWith('act:rec-2'), true)
  const hidden = dismissNext([], first[0].id)
  const next = upcomingReminders(rows, hidden)
  assert.equal(next.some((row) => row.id === first[0].id), false)
  assert.equal(next[0].recentId, 'rec-1')
  const none = dismissNext(hidden, next[0].id)
  assert.equal(upcomingReminders(rows, none).length, 0)
  const added = collectReminders([
    recent(),
    {
      id: 'rec-3',
      title: 'New notice',
      result: { actions: [{ text: 'Attend the hearing', due_date: '2026-10-20', date_status: 'upcoming' }] },
    },
  ], { now, today, lang: 'en' })
  assert.equal(upcomingReminders(added, none)[0].recentId, 'rec-3')
})

test('dismissed ids stay in storage', () => {
  const saved = new Map()
  const storage = {
    getItem: (key) => saved.get(key) || null,
    setItem: (key, value) => saved.set(key, value),
  }
  writeDismissed(storage, dismissNext([], 'act:rec-1:0:2027-01-15'))
  assert.deepEqual(readDismissed(storage), ['act:rec-1:0:2027-01-15'])
})

test('view all splits upcoming and past, and includes an added medicine', () => {
  const rows = collectReminders([recent({
    translations: {
      ta: {
        actions: [
          { text: 'மறுபரிசோதனைக்குச் செல்லுங்கள்', due_date: '2027-01-15' },
          { text: 'பழைய கட்டணம்', due_date: '2026-10-01' },
        ],
      },
    },
    activity: {
      remindersAdded: { medicine: true },
      medicine: { slots: { '0-morning': true }, times: { '0-morning': '08:00' }, durations: {} },
    },
  })], { now, today, lang: 'ta', medicineLine: (name) => `${name} எடுங்கள்` })
  const upcoming = upcomingReminders(rows, [])
  const past = pastReminders(rows)
  assert.equal(upcoming.length, 2)
  assert.equal(past.length, 1)
  assert.equal(upcoming.some((row) => row.kind === 'medicine' && row.time === '08:00'), true)
  assert.equal(upcoming.some((row) => row.summary === 'மறுபரிசோதனைக்குச் செல்லுங்கள்'), true)
  assert.equal(past[0].summary, 'பழைய கட்டணம்')
  for (const row of rows) {
    assert.ok(row.summary.length <= 60, row.summary)
    assert.equal(row.summary.includes('HbA1c'), false)
    assert.ok(row.documentName)
  }
  const withoutMedicine = collectReminders([recent()], { now, today, lang: 'en' })
  assert.equal(withoutMedicine.some((row) => row.kind === 'medicine'), false)
})

test('edit then add writes a short title and a one-line note', () => {
  const long = `${'Review the notice and pay before the printed date. '.repeat(4)}Suresh Raman 0422-000-0000`
  const event = calendarDraftEvent({
    title: long,
    note: 'Sarvam reminder.',
    date: '2027-01-15',
    time: '09:00',
    alert: '1d',
    uid: 'act-1',
    quote: 'Suresh Raman 0422-000-0000',
  })
  assert.ok(event.title.length <= 60)
  assert.equal(event.title.includes('Suresh Raman'), false)
  assert.equal(event.title.includes('0422'), false)
  assert.equal(event.description, 'Sarvam reminder.')
  const ics = [
    'BEGIN:VEVENT',
    `SUMMARY:${event.title}`,
    `DESCRIPTION:${event.description}`,
    'END:VEVENT',
  ].join('\r\n')
  assert.ok(ics.split('\r\n').find((line) => line.startsWith('SUMMARY:')).slice('SUMMARY:'.length).length <= 60)
  assert.equal(ics.includes('Suresh Raman'), false)
  assert.equal(ics.includes('0422-000-0000'), false)
  assert.equal(ics.includes('DESCRIPTION:Sarvam reminder.'), true)
})

test('a summary never passes 60 characters', () => {
  const text = reminderSummary('x'.repeat(80))
  assert.equal(text.length, 60)
  assert.equal(text.endsWith('…'), true)
})
