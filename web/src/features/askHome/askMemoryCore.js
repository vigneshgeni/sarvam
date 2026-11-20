/**
 * Local on-device memory recall for Ask Sarvam.
 * Searches only IndexedDB stores that actually exist (missing stores skipped silently).
 * Supports Unicode letters across all Indian scripts (Tamil, Hindi, Telugu, Kannada,
 * Malayalam, Bengali, Marathi, Gujarati, Odia) plus lower-cased Latin for Tanglish/Hinglish.
 */

const DB_NAME = 'sarvam_db'
const MAX_EXCERPT_LEN = 300
const TOP_K = 3
const SENSITIVE_DRAFT_KEYS = new Set(['pan', 'aadhaar'])

/**
 * Tokenise a query or text using Unicode letters, combining marks (essential for Indic vowel signs),
 * and numbers. Lower-cases Latin letters so Tanglish/Hinglish queries match case-insensitively.
 * Never uses ASCII \w.
 */
export function tokenizeUnicode(text) {
  if (!text || typeof text !== 'string') return []
  const matches = text.normalize('NFC').match(/[\p{L}\p{M}\p{N}]+/gu)
  if (!matches) return []
  const tokens = []
  for (const raw of matches) {
    const token = raw.toLowerCase()
    if (token.length < 2 && !/^\p{N}+$/u.test(token)) continue
    tokens.push(token)
  }
  return tokens
}

/**
 * Compute keyword overlap + recency boost between query tokens and a candidate memory item.
 * Returns 0 if there is zero keyword overlap so unrelated memories are never injected.
 */
export function scoreMemoryItem(queryTokens, item, nowMs = Date.now()) {
  if (!queryTokens.length || !item) return 0
  const titleTokens = new Set(tokenizeUnicode(item.title || ''))
  const bodyTokens = tokenizeUnicode(item.body || '')
  const bodySet = new Set(bodyTokens)

  let overlap = 0
  const seenQuery = new Set(queryTokens)
  for (const qt of seenQuery) {
    if (titleTokens.has(qt)) {
      overlap += 1.5
      continue
    }
    if (bodySet.has(qt)) {
      overlap += 1.0
      continue
    }
    // Partial prefix match for Tanglish/Hinglish/Indic inflections (>= 4 chars)
    if (qt.length >= 4) {
      const prefix = qt.slice(0, 4)
      let matchedPartial = false
      for (const bt of bodySet) {
        if (bt.startsWith(prefix) || (bt.length >= 4 && qt.startsWith(bt.slice(0, 4)))) {
          matchedPartial = true
          break
        }
      }
      if (!matchedPartial) {
        for (const tt of titleTokens) {
          if (tt.startsWith(prefix) || (tt.length >= 4 && qt.startsWith(tt.slice(0, 4)))) {
            matchedPartial = true
            break
          }
        }
      }
      if (matchedPartial) {
        overlap += 0.5
      }
    }
  }

  if (overlap <= 0) return 0

  const ts = Number(item.timestamp) || 0
  const ageDays = ts > 0 ? Math.max(0, (nowMs - ts) / (1000 * 60 * 60 * 24)) : 365
  const recencyBoost = 0.5 * Math.exp(-ageDays / 14)
  return overlap + recencyBoost
}

/**
 * Extract a concise <=300 char excerpt centered around the first matching token.
 */
export function buildExcerpt(body, queryTokens, maxLen = MAX_EXCERPT_LEN) {
  const clean = String(body || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  if (clean.length <= maxLen) return clean

  const lower = clean.toLowerCase()
  let hitIdx = -1
  for (const qt of queryTokens) {
    const idx = lower.indexOf(qt)
    if (idx !== -1 && (hitIdx === -1 || idx < hitIdx)) {
      hitIdx = idx
    }
  }

  if (hitIdx <= 60) {
    return `${clean.slice(0, maxLen - 1).trimEnd()}…`
  }

  const start = Math.max(0, hitIdx - 60)
  const slice = clean.slice(start, start + maxLen - 2).trim()
  const prefix = start > 0 ? '…' : ''
  const suffix = start + maxLen - 2 < clean.length ? '…' : ''
  return `${prefix}${slice}${suffix}`.slice(0, maxLen)
}

/**
 * Rank normalized candidate items and return top 3 excerpts.
 */
export function rankMemoryItems(query, items, nowMs = Date.now(), limit = TOP_K) {
  const queryTokens = tokenizeUnicode(query)
  if (queryTokens.length === 0 || !Array.isArray(items) || items.length === 0) return []

  const scored = []
  for (const item of items) {
    const score = scoreMemoryItem(queryTokens, item, nowMs)
    if (score > 0) {
      scored.push({ item, score })
    }
  }

  scored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score
    return (Number(b.item.timestamp) || 0) - (Number(a.item.timestamp) || 0)
  })

  return scored.slice(0, limit).map(({ item }) => ({
    sourceId: String(item.sourceId),
    sourceType: item.sourceType,
    title: String(item.title || 'Saved item').slice(0, 120),
    excerpt: buildExcerpt(item.body || item.title || '', queryTokens, MAX_EXCERPT_LEN),
    timestamp: Number(item.timestamp) || 0,
  }))
}

function openExistingDB(dbName = DB_NAME) {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null)
      return
    }
    try {
      // Open without bumping version so we inspect whatever stores exist right now
      const req = indexedDB.open(dbName)
      req.onsuccess = () => resolve(req.result)
      req.onerror = () => resolve(null)
    } catch {
      resolve(null)
    }
  })
}

function readAllFromStore(db, storeName) {
  return new Promise((resolve) => {
    try {
      if (!db || !db.objectStoreNames || !db.objectStoreNames.contains(storeName)) {
        resolve([])
        return
      }
      const tx = db.transaction(storeName, 'readonly')
      const store = tx.objectStore(storeName)
      const req = store.getAll()
      req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : [])
      req.onerror = () => resolve([])
    } catch {
      resolve([])
    }
  })
}

function normalizeRecentDoc(row) {
  if (!row) return null
  const title = row.displayName || row.title || row.result?.title || 'Document'
  const parts = []
  if (Array.isArray(row.result?.summary)) parts.push(row.result.summary.join(' '))
  if (Array.isArray(row.result?.actions)) {
    parts.push(row.result.actions.map((a) => [a?.text, a?.due_date].filter(Boolean).join(' ')).join(' '))
  }
  if (Array.isArray(row.result?.facts)) {
    parts.push(row.result.facts.map((f) => f?.text).filter(Boolean).join(' '))
  }
  if (Array.isArray(row.asks)) {
    parts.push(row.asks.map((a) => `${a?.question || ''} ${a?.answer || ''}`).join(' '))
  }
  return {
    sourceId: String(row.id || ''),
    sourceType: 'document',
    title,
    body: parts.join(' ').trim(),
    timestamp: Number(row.timestamp) || 0,
  }
}

function normalizeDraft(row) {
  if (!row) return null
  const safeVals = []
  if (row.values && typeof row.values === 'object') {
    for (const [k, v] of Object.entries(row.values)) {
      if (SENSITIVE_DRAFT_KEYS.has(k.toLowerCase())) continue
      if (v) safeVals.push(`${k}: ${v}`)
    }
  }
  return {
    sourceId: String(row.id || ''),
    sourceType: 'draft',
    title: row.title || 'Form draft',
    body: `${row.title || ''} ${safeVals.join(', ')}`.trim(),
    timestamp: Number(row.updatedAt || row.createdAt) || 0,
  }
}

function normalizeRelaySession(row) {
  if (!row) return null
  const parts = []
  if (Array.isArray(row.participants) && row.participants.length) {
    parts.push(`Participants: ${row.participants.join(', ')}`)
  }
  if (Array.isArray(row.captions)) {
    parts.push(
      row.captions
        .map((c) => (c?.speaker ? `${c.speaker}: ${c.text || ''}` : c?.text || ''))
        .filter(Boolean)
        .join(' ')
    )
  }
  if (Array.isArray(row.cards)) {
    parts.push(row.cards.map((c) => c?.text || c?.title || '').filter(Boolean).join(' '))
  }
  if (typeof row.summary === 'string') parts.push(row.summary)
  return {
    sourceId: String(row.id || ''),
    sourceType: 'relaySession',
    title: row.title || 'Live Relay session',
    body: parts.join(' ').trim(),
    timestamp: Number(row.endedAt || row.startedAt || row.timestamp) || 0,
  }
}

function normalizeGmailItem(row) {
  if (!row) return null
  const parts = [
    row.title,
    row.amount,
    row.dueISO,
    row.source?.from,
    row.source?.subject,
    row.source?.date,
  ].filter(Boolean)
  return {
    sourceId: String(row.id || ''),
    sourceType: 'gmail',
    title: row.title || row.source?.subject || 'Email item',
    body: parts.join(' ').trim(),
    timestamp: Number(row.createdAt || row.timestamp) || 0,
  }
}

function normalizeGenericHistory(row) {
  if (!row) return null
  const text = [row.title, row.question, row.answer, row.text, row.summary].filter(Boolean).join(' ')
  return {
    sourceId: String(row.id || ''),
    sourceType: 'history',
    title: row.title || row.question || 'History',
    body: text.trim(),
    timestamp: Number(row.timestamp || row.createdAt) || 0,
  }
}

/**
 * Search across all available local IndexedDB stores and return top 3 relevant excerpts.
 * Never throws if IndexedDB is unavailable or if any store does not exist yet.
 */
export async function searchMemory(query, options = {}) {
  const queryTokens = tokenizeUnicode(query)
  if (queryTokens.length === 0) return []

  const nowMs = options.nowMs ?? Date.now()
  const dbName = options.dbName || DB_NAME

  let db = null
  try {
    db = await openExistingDB(dbName)
    if (!db) return []

    const [recentDocs, altDocs, drafts, historyRows, gmailItems, relaySessions] = await Promise.all([
      readAllFromStore(db, 'recent_results'),
      readAllFromStore(db, 'documents'),
      readAllFromStore(db, 'drafts'),
      readAllFromStore(db, 'history'),
      readAllFromStore(db, 'gmailItems'),
      readAllFromStore(db, 'relaySessions'),
    ])

    const candidates = []
    for (const r of recentDocs) {
      const n = normalizeRecentDoc(r)
      if (n && n.sourceId) candidates.push(n)
    }
    for (const r of altDocs) {
      const n = normalizeRecentDoc(r)
      if (n && n.sourceId) candidates.push(n)
    }
    for (const r of drafts) {
      const n = normalizeDraft(r)
      if (n && n.sourceId) candidates.push(n)
    }
    for (const r of historyRows) {
      const n = normalizeGenericHistory(r)
      if (n && n.sourceId) candidates.push(n)
    }
    for (const r of gmailItems) {
      const n = normalizeGmailItem(r)
      if (n && n.sourceId) candidates.push(n)
    }
    for (const r of relaySessions) {
      const n = normalizeRelaySession(r)
      if (n && n.sourceId) candidates.push(n)
    }

    return rankMemoryItems(query, candidates, nowMs, TOP_K)
  } catch {
    return []
  } finally {
    try {
      db?.close?.()
    } catch {
      /* ignore */
    }
  }
}
