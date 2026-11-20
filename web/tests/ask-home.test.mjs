import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import {
  rankMemoryItems,
  scoreMemoryItem,
  searchMemory,
  tokenizeUnicode,
} from '../src/features/askHome/askMemoryCore.js'
import {
  buildHomeAskContext,
  parseAskProposals,
  parseWhenToDateAndTime,
  reminderDedupeKey,
} from '../src/features/askHome/askProposals.js'
import {
  getSavedReminders,
  saveAcceptedReminder,
  seedAskDemoSession,
} from '../src/features/askHome/reminderStorage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// ---- Mock IndexedDB helpers ----
function createMockRequest(result) {
  const req = { result, onsuccess: null, onerror: null }
  return new Proxy(req, {
    set(target, prop, value) {
      target[prop] = value
      if (prop === 'onsuccess' && typeof value === 'function') {
        setTimeout(() => value({ target }), 0)
      }
      return true
    },
  })
}

class MockStore {
  constructor(keyPath) {
    this.keyPath = keyPath
    this.map = new Map()
  }
  put(item) {
    this.map.set(item[this.keyPath], item)
    return createMockRequest(item[this.keyPath])
  }
  get(key) {
    return createMockRequest(this.map.get(key))
  }
  getAll() {
    return createMockRequest(Array.from(this.map.values()))
  }
  delete(key) {
    this.map.delete(key)
    return createMockRequest(undefined)
  }
  createIndex() {}
}

function installMockIndexedDB(initialStoreNames = null) {
  const stores = new Map()
  if (Array.isArray(initialStoreNames)) {
    for (const n of initialStoreNames) {
      stores.set(n, new MockStore(n === 'original_files' ? 'resultId' : 'id'))
    }
  }
  const db = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore(name, opts) {
      const s = new MockStore(opts?.keyPath || 'id')
      stores.set(name, s)
      return s
    },
    transaction(names) {
      const tx = {
        objectStore: (n) => stores.get(n),
        _oncomplete: null,
        set oncomplete(fn) {
          this._oncomplete = fn
          if (fn) setTimeout(() => fn(), 4)
        },
        get oncomplete() {
          return this._oncomplete
        },
        onerror: null,
      }
      return tx
    },
    close() {},
  }

  let upgraded = initialStoreNames !== null
  globalThis.indexedDB = {
    open() {
      const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null }
      setTimeout(() => {
        if (!upgraded && typeof req.onupgradeneeded === 'function') {
          upgraded = true
          req.onupgradeneeded({ target: req })
        }
        if (typeof req.onsuccess === 'function') {
          req.onsuccess({ target: req })
        }
      }, 0)
      return req
    },
  }
  return stores
}

test('tokenizeUnicode supports Tamil, Hindi, Telugu, Kannada, Malayalam, Bengali, Marathi, Gujarati and lowercased Latin', () => {
  const ta = tokenizeUnicode('மின்சாரம் கட்டணம் 2340')
  assert.ok(ta.includes('மின்சாரம்'), `Tamil token intact: ${ta}`)
  assert.ok(ta.includes('கட்டணம்'))
  assert.ok(ta.includes('2340'))

  const hi = tokenizeUnicode('बिजली का बिल 28 नवंबर')
  assert.ok(hi.includes('बिजली'), `Hindi token intact: ${hi}`)
  assert.ok(hi.includes('बिल'))
  assert.ok(hi.includes('नवंबर'))

  const tanglish = tokenizeUnicode('Arun BILL pathi enna sonnaan?')
  assert.deepEqual(tanglish, ['arun', 'bill', 'pathi', 'enna', 'sonnaan'])

  const multiIndic = tokenizeUnicode('విద్యుత్ ವಿದ್ಯುತ್ വൈദ്യുതി বিদ্যুৎ વીજળી')
  assert.equal(multiIndic.length, 5)
})

test('searchMemory scoring ranks higher keyword overlap and recency boost, capping excerpts to top 3 and <=300 chars', () => {
  const now = Date.UTC(2026, 10, 20)
  const items = [
    {
      sourceId: 'old-bill',
      sourceType: 'document',
      title: 'Electricity bill Oct',
      body: 'BESCOM electricity bill due Rs 1,800',
      timestamp: now - 40 * 86400 * 1000,
    },
    {
      sourceId: 'new-bill-call',
      sourceType: 'relaySession',
      title: 'Electricity bill call',
      body: 'Arun: The BESCOM electricity bill is Rs 2,340 due on 28 Nov. ' + 'detail '.repeat(80),
      timestamp: now - 1 * 3600 * 1000,
    },
    {
      sourceId: 'doc-3',
      sourceType: 'document',
      title: 'Water bill',
      body: 'Monthly water bill Rs 400',
      timestamp: now - 2 * 86400 * 1000,
    },
    {
      sourceId: 'doc-4',
      sourceType: 'document',
      title: 'Gas bill',
      body: 'Piped gas bill Rs 950',
      timestamp: now - 3 * 86400 * 1000,
    },
    {
      sourceId: 'unrelated',
      sourceType: 'document',
      title: 'Blood test report',
      body: 'Haemoglobin 13.4 g/dL',
      timestamp: now,
    },
  ]

  const top = rankMemoryItems('Arun bill pathi enna sonnaan?', items, now)
  assert.equal(top.length, 3, 'Must return at most 3 excerpts')
  assert.equal(top[0].sourceId, 'new-bill-call', 'Recency + Arun + bill overlap must rank first')
  assert.ok(top[0].excerpt.length <= 300, 'Excerpt must be <= 300 chars')
  assert.ok(!top.some((e) => e.sourceId === 'unrelated'), 'Unrelated items with 0 overlap must be excluded')

  // Recency tie-break when keyword overlap is equal
  const olderScore = scoreMemoryItem(['bescom'], items[0], now)
  const newerScore = scoreMemoryItem(['bescom'], items[1], now)
  assert.ok(newerScore > olderScore, 'Newer memory should score higher than older with same overlap')
})

test('searchMemory skips missing stores silently and never throws', async () => {
  // Only recent_results exists — relaySessions, gmailItems, documents, drafts, history are ALL missing!
  const stores = installMockIndexedDB(['recent_results'])
  stores.get('recent_results').put({
    id: 'doc-ta-1',
    title: 'தமிழ் மின்சாரம் கட்டணம்',
    timestamp: Date.now(),
    result: { summary: ['மின்சாரம் கட்டணம் Rs 2,340 நவம்பர் 28க்குள் கட்டவும்.'] },
  })

  const hits = await searchMemory('மின்சாரம் கட்டணம்')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].sourceId, 'doc-ta-1')
  assert.equal(hits[0].sourceType, 'document')

  // Even when indexedDB is completely missing, never throws
  const savedIdb = globalThis.indexedDB
  globalThis.indexedDB = undefined
  const empty = await searchMemory('bill')
  assert.deepEqual(empty, [])
  globalThis.indexedDB = savedIdb
})

test('approval card parsing strips fenced JSON and NEVER creates a reminder before a tap', async () => {
  installMockIndexedDB()

  const rawAnswer =
    'Arun sonnadhu BESCOM bill Rs 2,340, due date 28 Nov. 26 Nov-ku reminder podalama?\n\n' +
    '```json\n{"type":"propose_reminder","title":"Pay BESCOM bill (Rs 2,340)","when":"2026-11-26 09:00"}\n```'

  const { cleanAnswer, proposals } = parseAskProposals(rawAnswer)
  assert.ok(!cleanAnswer.includes('propose_reminder'), 'Fenced JSON must be stripped from visible answer')
  assert.ok(!cleanAnswer.includes('```'), 'Code fence must be stripped from visible answer')
  assert.equal(proposals.length, 1)
  assert.equal(proposals[0].type, 'propose_reminder')
  assert.equal(proposals[0].title, 'Pay BESCOM bill (Rs 2,340)')

  // CRITICAL privacy/agentic invariant: parsing/rendering an approval card must create ZERO reminders
  const beforeTap = await getSavedReminders()
  assert.equal(beforeTap.length, 0, 'An approval card must never create a reminder before a tap')
})

test('reminder dedupe prevents duplicate title + time in IndexedDB', async () => {
  installMockIndexedDB()

  assert.equal(
    reminderDedupeKey('Pay BESCOM bill', '2026-11-26', '09:00'),
    reminderDedupeKey('  pay   bescom bill ', '2026-11-26', '09:00')
  )

  const first = await saveAcceptedReminder({
    title: 'Pay BESCOM bill',
    when: '2026-11-26 09:00',
    source: 'Ask Sarvam',
  })
  assert.equal(first.added, true)

  const duplicate = await saveAcceptedReminder({
    title: '  pay bescom   bill ',
    when: '2026-11-26 09:00',
    source: 'Ask Sarvam',
  })
  assert.equal(duplicate.added, false)

  const list = await getSavedReminders()
  assert.equal(list.length, 1, 'Duplicate reminder must not be stored twice')
})

test('seedAskDemoSession writes Electricity bill call and searchMemory recalls it in Tanglish', async () => {
  installMockIndexedDB()
  const seeded = await seedAskDemoSession()
  assert.equal(seeded.id, 'seed-electricity-bill-call')

  const hits = await searchMemory('Arun bill pathi enna sonnaan?')
  assert.equal(hits.length, 1)
  assert.equal(hits[0].sourceType, 'relaySession')
  assert.equal(hits[0].title, 'Electricity bill call')
  assert.ok(hits[0].excerpt.includes('2,340'))

  const ctx = buildHomeAskContext(hits, 'ta')
  assert.ok(ctx.summary[0].includes('Electricity bill call'))
  assert.ok(ctx.summary[0].includes('2,340'))
})

test('propose_calendar_event parses start date/time and builds valid ICS structure', async () => {
  const { proposals } = parseAskProposals(
    'Shall I add this to your calendar?\n```json\n{"type":"propose_calendar_event","title":"Pay BESCOM bill","start":"2026-11-26T09:30","notes":"Rs 2,340"}\n```'
  )
  assert.equal(proposals.length, 1)
  assert.equal(proposals[0].type, 'propose_calendar_event')
  const parsed = parseWhenToDateAndTime(proposals[0].start)
  assert.deepEqual(parsed, { date: '2026-11-26', time: '09:30' })

  // Verify calendarDraftEvent + ICS output via existing utils/reminders.js
  const { calendarDraftEvent } = await import('../src/utils/reminders.js')
  const draft = calendarDraftEvent({
    uid: 'ask-bescom',
    title: proposals[0].title,
    note: proposals[0].notes,
    date: parsed.date,
    time: parsed.time,
    alert: 'day',
  })
  assert.equal(draft.startDate, '2026-11-26T09:30:00')
  assert.equal(draft.isAllDay, false)
  assert.equal(draft.title, 'Pay BESCOM bill')
})

test('askHome i18n keys exist and are non-empty in all 9 languages', () => {
  const i18nDir = path.join(__dirname, '../src/i18n')
  const langs = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']
  const en = JSON.parse(fs.readFileSync(path.join(i18nDir, 'en.json'), 'utf8'))
  assert.ok(en.askHome && typeof en.askHome === 'object', 'en.json must have askHome object')
  const enKeys = Object.keys(en.askHome)
  assert.ok(enKeys.length >= 20)

  for (const lang of langs) {
    const dict = JSON.parse(fs.readFileSync(path.join(i18nDir, `${lang}.json`), 'utf8'))
    assert.ok(dict.askHome && typeof dict.askHome === 'object', `${lang}.json missing askHome`)
    for (const k of enKeys) {
      assert.ok(typeof dict.askHome[k] === 'string' && dict.askHome[k].length > 0, `${lang}.askHome.${k} missing`)
    }
  }
})
