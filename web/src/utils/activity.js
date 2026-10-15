/** Per-document ticks, reminders and names. Stored on the saved result, not on a sample tile. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function emptyActivity() {
  return {
    doneActions: {},
    remindersAdded: {},
    medicine: { slots: {}, times: {}, durations: {} },
    rating: '',
    lang: '',
    reportIndex: null,
  }
}

export function mergeActivity(current, patch) {
  const base = current && typeof current === 'object' ? current : emptyActivity()
  const next = {
    ...emptyActivity(),
    ...base,
    medicine: {
      slots: { ...(base.medicine?.slots || {}) },
      times: { ...(base.medicine?.times || {}) },
      durations: { ...(base.medicine?.durations || {}) },
    },
    doneActions: { ...(base.doneActions || {}) },
    remindersAdded: { ...(base.remindersAdded || {}) },
  }
  if (!patch) return next
  if (patch.doneActions) next.doneActions = { ...patch.doneActions }
  if (patch.remindersAdded) next.remindersAdded = { ...patch.remindersAdded }
  if (patch.medicine) {
    next.medicine = {
      slots: { ...(patch.medicine.slots || {}) },
      times: { ...(patch.medicine.times || {}) },
      durations: { ...(patch.medicine.durations || {}) },
    }
  }
  if ('rating' in patch) next.rating = patch.rating || ''
  if ('lang' in patch) next.lang = patch.lang || ''
  if ('reportIndex' in patch) next.reportIndex = patch.reportIndex ?? null
  return next
}

export function clearTicks(activity) {
  return mergeActivity(activity, { doneActions: {} })
}

export function visibleTitle(record) {
  const custom = String(record?.displayName || '').trim()
  if (custom) return custom.slice(0, 60)
  return String(record?.title || '')
}

export function applyRename(name, fallback) {
  const trimmed = String(name || '').trim().slice(0, 60)
  return trimmed || String(fallback || '').trim()
}

export function shortIssuer(value) {
  const text = String(value || '').replace(/\s+/g, ' ').trim()
  if (!text) return ''
  if (/(?:^|\s)(?:mr|mrs|ms|dr|shri|smt)\.?(?:\s|$)/i.test(text)) return ''
  return text.split(/[,·]/)[0].trim().slice(0, 28)
}

export function shortDate(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ''))
  if (!match) return ''
  const month = MONTHS[Number(match[2]) - 1]
  if (!month) return ''
  return `${Number(match[3])} ${month}`
}

export function defaultDocumentName(kind, issuer, isoDate) {
  const bits = [String(kind || '').trim(), shortIssuer(issuer), shortDate(isoDate)].filter(Boolean)
  return bits.join(' · ').slice(0, 60)
}

export function isSampleResultId(id) {
  return String(id || '').startsWith('sample-')
}

/** In-memory stand-in for the IndexedDB record. Delete drops the activity with the document. */
export function createMemoryStore() {
  const rows = new Map()
  return {
    save(id, record) {
      rows.set(id, { ...record, id, activity: mergeActivity(record.activity) })
    },
    patch(id, patch) {
      const row = rows.get(id)
      if (!row) return null
      row.activity = mergeActivity(row.activity, patch)
      return row
    },
    rename(id, name, fallback) {
      const row = rows.get(id)
      if (!row) return null
      const next = applyRename(name, fallback || row.title)
      row.displayName = next === row.title ? '' : next
      return row
    },
    get(id) {
      return rows.get(id) || null
    },
    remove(id) {
      rows.delete(id)
    },
  }
}
