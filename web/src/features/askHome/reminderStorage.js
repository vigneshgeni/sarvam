/**
 * IndexedDB storage for accepted Ask/Live reminders ("reminders" store) and dev-only ?seed=ask helper.
 * Uses shared sarvam_db (version 5) with additive, zero-data-loss upgrades.
 */
import { parseWhenToDateAndTime, reminderDedupeKey } from './askProposals.js'

export const SARVAM_DB_NAME = 'sarvam_db'
export const SARVAM_DB_VERSION = 5
export const REMINDERS_STORE = 'reminders'
export const RELAY_SESSIONS_STORE = 'relaySessions'

function openAskDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not supported'))
      return
    }
    const request = indexedDB.open(SARVAM_DB_NAME, SARVAM_DB_VERSION)
    request.onupgradeneeded = (event) => {
      const db = event.target.result
      if (!db.objectStoreNames.contains('recent_results')) {
        const store = db.createObjectStore('recent_results', { keyPath: 'id' })
        store.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains('original_files')) {
        const origStore = db.createObjectStore('original_files', { keyPath: 'resultId' })
        origStore.createIndex('timestamp', 'timestamp', { unique: false })
      }
      if (!db.objectStoreNames.contains('read_cache')) {
        db.createObjectStore('read_cache', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('profile')) {
        db.createObjectStore('profile', { keyPath: 'id' })
      }
      if (!db.objectStoreNames.contains('drafts')) {
        const drafts = db.createObjectStore('drafts', { keyPath: 'id' })
        drafts.createIndex('createdAt', 'createdAt', { unique: false })
      }
      if (!db.objectStoreNames.contains(REMINDERS_STORE)) {
        const rem = db.createObjectStore(REMINDERS_STORE, { keyPath: 'id' })
        rem.createIndex('date', 'date', { unique: false })
      }
      if (!db.objectStoreNames.contains(RELAY_SESSIONS_STORE)) {
        const rel = db.createObjectStore(RELAY_SESSIONS_STORE, { keyPath: 'id' })
        rel.createIndex('startedAt', 'startedAt', { unique: false })
      }
    }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

export async function getSavedReminders() {
  try {
    const db = await openAskDB()
    if (!db.objectStoreNames.contains(REMINDERS_STORE)) return []
    return await new Promise((resolve) => {
      const tx = db.transaction(REMINDERS_STORE, 'readonly')
      const req = tx.objectStore(REMINDERS_STORE).getAll()
      req.onsuccess = () => {
        const rows = Array.isArray(req.result) ? req.result : []
        rows.sort((a, b) => {
          const left = `${a.date || ''}T${a.time || '00:00'}`
          const right = `${b.date || ''}T${b.time || '00:00'}`
          return left.localeCompare(right)
        })
        resolve(rows)
      }
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

/**
 * Save an accepted reminder, deduplicated by normalized title + date + time.
 * Only call this in response to an explicit user tap on Add!
 */
export async function saveAcceptedReminder(input) {
  const title = String(input?.title || '').trim()
  if (!title) return { reminder: null, added: false }

  const parsed = input?.date
    ? { date: String(input.date).slice(0, 10), time: String(input.time || '09:00').slice(0, 5) }
    : parseWhenToDateAndTime(input?.when || '')

  const key = reminderDedupeKey(title, parsed.date, parsed.time)
  const existing = await getSavedReminders()
  const dup = existing.find((r) => reminderDedupeKey(r.title, r.date, r.time) === key)
  if (dup) {
    return { reminder: dup, added: false }
  }

  const record = {
    id: input?.id || `rem-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title,
    date: parsed.date,
    time: parsed.time,
    when: input?.when || `${parsed.date} ${parsed.time}`,
    source: input?.source || 'Ask Sarvam',
    sourceId: input?.sourceId || '',
    createdAt: Date.now(),
  }

  try {
    const db = await openAskDB()
    if (db.objectStoreNames.contains(REMINDERS_STORE)) {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(REMINDERS_STORE, 'readwrite')
        tx.objectStore(REMINDERS_STORE).put(record)
        tx.oncomplete = () => resolve()
        tx.onerror = () => reject(tx.error)
      })
    }
  } catch {
    // Non-fatal
  }
  return { reminder: record, added: true }
}

export async function deleteSavedReminder(id) {
  if (!id) return
  try {
    const db = await openAskDB()
    if (!db.objectStoreNames.contains(REMINDERS_STORE)) return
    await new Promise((resolve) => {
      const tx = db.transaction(REMINDERS_STORE, 'readwrite')
      tx.objectStore(REMINDERS_STORE).delete(id)
      tx.oncomplete = () => resolve()
      tx.onerror = () => resolve()
    })
  } catch {
    // Non-fatal
  }
}

export async function getRelaySessionById(id) {
  if (!id) return null
  try {
    const db = await openAskDB()
    if (!db.objectStoreNames.contains(RELAY_SESSIONS_STORE)) return null
    return await new Promise((resolve) => {
      const tx = db.transaction(RELAY_SESSIONS_STORE, 'readonly')
      const req = tx.objectStore(RELAY_SESSIONS_STORE).get(id)
      req.onsuccess = () => resolve(req.result || null)
      req.onerror = () => resolve(null)
    })
  } catch {
    return null
  }
}

export async function getAllRelaySessions() {
  try {
    const db = await openAskDB()
    if (!db.objectStoreNames.contains(RELAY_SESSIONS_STORE)) return []
    return await new Promise((resolve) => {
      const tx = db.transaction(RELAY_SESSIONS_STORE, 'readonly')
      const req = tx.objectStore(RELAY_SESSIONS_STORE).getAll()
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : [])
      req.onerror = () => resolve([])
    })
  } catch {
    return []
  }
}

/**
 * Dev-only demo seed enabled only with ?seed=ask in dev builds.
 * Writes one fake saved session "Electricity bill call" where Arun says the BESCOM bill is Rs 2,340 due on 28 Nov.
 */
export async function seedAskDemoSession() {
  const now = Date.now()
  const session = {
    id: 'seed-electricity-bill-call',
    title: 'Electricity bill call',
    startedAt: now - 15 * 60 * 1000,
    endedAt: now - 10 * 60 * 1000,
    participants: ['You', 'Arun'],
    captions: [
      {
        id: 'cap-1',
        speaker: 'You',
        lang: 'ta',
        text: 'Arun, BESCOM current bill evlo vandhirukku?',
        final: true,
      },
      {
        id: 'cap-2',
        speaker: 'Arun',
        lang: 'en',
        text: 'The BESCOM electricity bill is Rs 2,340 and it is due on 28 Nov.',
        final: true,
      },
      {
        id: 'cap-3',
        speaker: 'Gemini',
        lang: 'ta',
        text: 'Arun sonnadhu: BESCOM bill Rs 2,340, due date 28 Nov.',
        final: true,
      },
    ],
    pins: [],
    cards: [],
  }
  try {
    const db = await openAskDB()
    if (!db.objectStoreNames.contains(RELAY_SESSIONS_STORE)) return null
    await new Promise((resolve, reject) => {
      const tx = db.transaction(RELAY_SESSIONS_STORE, 'readwrite')
      tx.objectStore(RELAY_SESSIONS_STORE).put(session)
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    return session
  } catch {
    return null
  }
}
