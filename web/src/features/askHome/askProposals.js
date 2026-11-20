/**
 * Pure proposal parser, date parser, deduplication key, and Home Ask context builder.
 * Never performs any side effect — proposals are returned as inert cards until the user taps Add.
 */

const FENCED_JSON_RE = /```(?:json)?\s*([\s\S]*?)```/gi

const MONTHS = {
  jan: 1, january: 1,
  feb: 2, february: 2,
  mar: 3, march: 3,
  apr: 4, april: 4,
  may: 5,
  jun: 6, june: 6,
  jul: 7, july: 7,
  aug: 8, august: 8,
  sep: 9, sept: 9, september: 9,
  oct: 10, october: 10,
  nov: 11, november: 11,
  dec: 12, december: 12,
}

function pad2(n) {
  return String(n).padStart(2, '0')
}

export function formatIsoDate(date) {
  const d = date instanceof Date ? date : new Date(date)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

/**
 * Parse a `when` or `start` string (ISO date/datetime, "26 Nov", "26 Nov 9:00 AM", "tomorrow")
 * into { date: 'YYYY-MM-DD', time: 'HH:mm' }.
 */
export function parseWhenToDateAndTime(rawWhen, now = new Date()) {
  const ref = now instanceof Date ? now : new Date(now)
  const fallbackDate = formatIsoDate(ref)
  if (!rawWhen || typeof rawWhen !== 'string') {
    return { date: fallbackDate, time: '09:00' }
  }
  const s = rawWhen.trim()
  if (!s) return { date: fallbackDate, time: '09:00' }

  // ISO datetime: 2026-11-26T09:00 or 2026-11-26 09:00
  let m = s.match(/(\d{4}-\d{2}-\d{2})(?:[T\s](\d{2}:\d{2}))?/)
  if (m) {
    return { date: m[1], time: m[2] || '09:00' }
  }

  // Extract optional time (e.g. 9:30 AM, 18:00, 8 PM)
  let time = '09:00'
  const tm = s.match(/(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i)
  if (tm) {
    let hr = Number(tm[1])
    const min = Number(tm[2] || 0)
    const ap = tm[3].toLowerCase()
    if (ap === 'pm' && hr < 12) hr += 12
    if (ap === 'am' && hr === 12) hr = 0
    time = `${pad2(hr)}:${pad2(min)}`
  } else {
    const tm24 = s.match(/\b([01]?\d|2[0-3]):([0-5]\d)\b/)
    if (tm24) time = `${pad2(Number(tm24[1]))}:${tm24[2]}`
  }

  const lower = s.toLowerCase()
  if (lower.includes('tomorrow')) {
    const d = new Date(ref.getFullYear(), ref.getMonth(), ref.getDate() + 1)
    return { date: formatIsoDate(d), time }
  }
  if (lower.includes('today')) {
    return { date: fallbackDate, time }
  }

  // "26 Nov" or "26 Nov 2026"
  m = s.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})(?:\s+(\d{4}))?\b/)
  if (m) {
    const day = Number(m[1])
    const mon = MONTHS[m[2].toLowerCase()]
    const yr = m[3] ? Number(m[3]) : ref.getFullYear()
    if (mon && day >= 1 && day <= 31) {
      return { date: `${yr}-${pad2(mon)}-${pad2(day)}`, time }
    }
  }

  return { date: fallbackDate, time }
}

function normalizeProposal(obj, idx) {
  if (!obj || typeof obj !== 'object') return null
  const kind = obj.type || obj.kind || obj.action

  if (kind === 'propose_reminder' || kind === 'reminder') {
    const title = String(obj.title || '').trim()
    if (!title) return null
    const when = String(obj.when || obj.date || '').trim()
    return {
      id: `prop-rem-${idx}-${title.slice(0, 16)}`,
      type: 'propose_reminder',
      title: title.slice(0, 100),
      when,
    }
  }

  if (kind === 'propose_calendar_event' || kind === 'calendar' || kind === 'calendar_event') {
    const title = String(obj.title || '').trim()
    if (!title) return null
    const start = String(obj.start || obj.when || obj.date || '').trim()
    const end = obj.end ? String(obj.end).trim() : undefined
    const notes = obj.notes ? String(obj.notes).trim() : undefined
    return {
      id: `prop-cal-${idx}-${title.slice(0, 16)}`,
      type: 'propose_calendar_event',
      title: title.slice(0, 100),
      start,
      end,
      notes,
    }
  }

  if (kind === 'open_session') {
    const sourceId = String(obj.sourceId || obj.sessionId || '').trim()
    if (!sourceId) return null
    return {
      id: `prop-open-${idx}-${sourceId}`,
      type: 'open_session',
      sourceId,
      title: obj.title ? String(obj.title).trim() : undefined,
    }
  }

  // Shorthand object keys: { propose_reminder: { title, when } }
  if (obj.propose_reminder && typeof obj.propose_reminder === 'object') {
    return normalizeProposal({ ...obj.propose_reminder, type: 'propose_reminder' }, idx)
  }
  if (obj.propose_calendar_event && typeof obj.propose_calendar_event === 'object') {
    return normalizeProposal({ ...obj.propose_calendar_event, type: 'propose_calendar_event' }, idx)
  }
  if (obj.open_session && typeof obj.open_session === 'object') {
    return normalizeProposal({ ...obj.open_session, type: 'open_session' }, idx)
  }

  return null
}

/**
 * Parse agentic proposals from fenced JSON blocks inside an Ask answer (and/or a structured array)
 * and return { cleanAnswer, proposals }. Strips parsed proposal blocks from the visible answer.
 */
export function parseAskProposals(answerText, structuredProposals = null) {
  const proposals = []
  let idx = 0

  if (Array.isArray(structuredProposals)) {
    for (const raw of structuredProposals) {
      const p = normalizeProposal(raw, idx++)
      if (p) proposals.push(p)
    }
  }

  const rawAnswer = String(answerText || '')
  const cleanAnswer = rawAnswer
    .replace(FENCED_JSON_RE, (fullMatch, jsonBody) => {
      try {
        const parsed = JSON.parse(jsonBody.trim())
        const list = Array.isArray(parsed)
          ? parsed
          : Array.isArray(parsed?.proposals)
          ? parsed.proposals
          : [parsed]
        let foundAny = false
        for (const item of list) {
          const p = normalizeProposal(item, idx++)
          if (p) {
            proposals.push(p)
            foundAny = true
          }
        }
        return foundAny ? '' : fullMatch
      } catch {
        return fullMatch
      }
    })
    .replace(/\n{3,}/g, '\n\n')
    .trim()

  return { cleanAnswer, proposals }
}

/**
 * Stable deduplication key by normalized title + date + time.
 */
export function reminderDedupeKey(title, date, time = '') {
  const normTitle = String(title || '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim()
  const normDate = String(date || '').trim().slice(0, 10)
  const normTime = String(time || '').trim().slice(0, 5)
  return `${normTitle}|${normDate}|${normTime}`
}

/**
 * Build a minimal ExplainResponse payload for POST /api/ask in Home mode containing
 * ONLY the top 3 memory excerpts (never entire stores).
 */
export function buildHomeAskContext(excerpts, lang = 'en') {
  const list = Array.isArray(excerpts) ? excerpts.slice(0, 3) : []
  const summaryLines =
    list.length > 0
      ? list.map((e, i) => `[Source ${i + 1} | id=${e.sourceId} | ${e.title}]: ${e.excerpt}`)
      : ['No matching saved documents or Live Relay sessions were found on this phone.']

  const proposalHint =
    'If the user asks to set a reminder, add a calendar event, or open a saved session, append a single ```json``` block with one of: ' +
    '{"type":"propose_reminder","title":"...","when":"YYYY-MM-DD HH:MM"}, ' +
    '{"type":"propose_calendar_event","title":"...","start":"YYYY-MM-DDTHH:MM","end":"YYYY-MM-DDTHH:MM","notes":"..."}, ' +
    'or {"type":"open_session","sourceId":"..."}. If nothing in the excerpts answers the question, say so plainly and do not invent figures or dates.'

  return {
    doc_type: 'other',
    document_type: 'other',
    document_kind: 'other',
    title: list[0]?.title || 'Sarvam Memory',
    report_title: null,
    report_date: null,
    language: lang,
    letter_date: null,
    summary: [...summaryLines, proposalHint],
    actions: [],
    warnings: [],
    facts: list.map((e) => ({
      text: `${e.title}: ${e.excerpt}`,
      quote: e.excerpt,
      page: 1,
      evidence: 'matched',
    })),
    conflicts: [],
    evidence_summary: { matched: list.length, check_original: 0, calculated: 0 },
    unreadable: false,
    unreadable_reason: null,
    protected_terms: [],
  }
}
