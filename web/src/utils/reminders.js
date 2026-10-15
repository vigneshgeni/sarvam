/** Home reminders: short lines, dismiss, and calendar events without the full text. */

const LANGS = new Set(['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or'])
const SUMMARY_LIMIT = 60
const DISMISS_KEY = 'sarvam.nextUpDismissed'
const DEFAULT_TIMES = {
  morning: '08:00',
  afternoon: '14:00',
  evening: '18:00',
  night: '21:00',
  bedtime: '22:00',
}

export function langCode(lang) {
  const code = String(lang || 'en').toLowerCase().split('-')[0]
  return LANGS.has(code) ? code : 'en'
}

export function localDate(now) {
  const date = now instanceof Date ? now : new Date()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function reminderSummary(text, limit = SUMMARY_LIMIT) {
  const clean = String(text || '').replace(/\s+/g, ' ').trim()
  if (!clean) return ''
  if (clean.length <= limit) return clean
  return `${clean.slice(0, limit - 1).trimEnd()}…`
}

function translatedAction(actions, act, index) {
  if (!Array.isArray(actions)) return ''
  const due = act?.due_date
  const match = due ? actions.find((item) => item?.due_date === due) : null
  const chosen = match || actions[index]
  return chosen?.text || ''
}

function byWhen(a, b) {
  const left = `${a.date}T${a.time || '00:00'}`
  const right = `${b.date}T${b.time || '00:00'}`
  if (left < right) return -1
  if (left > right) return 1
  return 0
}

function nextDoseDate(today, now, time) {
  const [hour, minute] = String(time || '00:00').split(':').map((part) => Number(part))
  const passed = now.getHours() > hour || (now.getHours() === hour && now.getMinutes() >= minute)
  if (!passed) return today
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
  return localDate(next)
}

export function collectReminders(recents, options = {}) {
  const now = options.now ? new Date(options.now) : new Date()
  const today = options.today || localDate(now)
  const lang = langCode(options.lang)
  const medicineLine = options.medicineLine || ((name) => `Take ${name}`)
  const rows = []

  for (const item of recents || []) {
    if (!item?.result) continue
    const docName = String(item.displayName || item.title || '').trim()
    const translated = item.translations?.[lang]?.actions
    const actions = item.result.actions || []
    actions.forEach((act, index) => {
      const date = String(act?.due_date || '').slice(0, 10)
      if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return
      const source = translatedAction(translated, act, index) || act.text
      const summary = reminderSummary(source)
      if (!summary) return
      const past = date < today || act.date_status === 'passed'
      rows.push({
        id: `act:${item.id}:${index}:${date}`,
        kind: 'deadline',
        summary,
        date,
        time: '',
        documentName: docName,
        status: past ? 'past' : 'upcoming',
        recentId: item.id,
      })
    })

    if (!item.activity?.remindersAdded?.medicine) continue
    const meds = item.result.medicines || []
    const slots = item.activity.medicine?.slots || {}
    const times = item.activity.medicine?.times || {}
    const selected = Object.entries(slots).filter(([, on]) => on)
    if (selected.length === 0) {
      const names = meds.map((med) => med?.name).filter(Boolean)
      if (!names.length) continue
      const summary = reminderSummary(names.map((name) => medicineLine(name)).join(', '))
      if (!summary) continue
      rows.push({
        id: `med:${item.id}:added`,
        kind: 'medicine',
        summary,
        date: today,
        time: '',
        documentName: docName,
        status: 'upcoming',
        recentId: item.id,
      })
      continue
    }
    for (const [key] of selected) {
      const [indexText, slot] = key.split('-')
      const med = meds[Number(indexText)]
      const name = med?.name || ''
      const summary = reminderSummary(name ? medicineLine(name) : medicineLine(''))
      if (!summary) continue
      const time = times[key] || DEFAULT_TIMES[slot] || '08:00'
      rows.push({
        id: `med:${item.id}:${key}`,
        kind: 'medicine',
        summary,
        date: nextDoseDate(today, now, time),
        time,
        documentName: docName,
        status: 'upcoming',
        recentId: item.id,
      })
    }
  }
  return rows
}

export function dismissNext(dismissed, id) {
  const ids = Array.isArray(dismissed) ? dismissed.filter((item) => typeof item === 'string') : []
  if (id && !ids.includes(id)) ids.push(id)
  return ids
}

export function readDismissed(storage) {
  try {
    const parsed = JSON.parse(storage.getItem(DISMISS_KEY) || '[]')
    return Array.isArray(parsed) ? parsed.filter((item) => typeof item === 'string') : []
  } catch {
    return []
  }
}

export function writeDismissed(storage, ids) {
  storage.setItem(DISMISS_KEY, JSON.stringify(ids || []))
}

export function upcomingReminders(rows, dismissed) {
  const hidden = new Set(dismissed || [])
  return (rows || [])
    .filter((row) => row.status === 'upcoming' && !hidden.has(row.id))
    .sort(byWhen)
}

export function pastReminders(rows) {
  return (rows || []).filter((row) => row.status === 'past').sort((a, b) => byWhen(b, a))
}

function alarmFor(choice) {
  if (choice === '1d') return '-P1D'
  if (choice === '3d') return '-P3D'
  if (choice === '1w') return '-P1W'
  if (choice === '0') return '-PT0S'
  return 'PT9H'
}

export function calendarDraftEvent(draft) {
  const title = reminderSummary(draft?.title)
  const note = reminderSummary(draft?.note || 'Sarvam reminder.', 80)
  const date = String(draft?.date || '').slice(0, 10)
  const time = String(draft?.time || '').slice(0, 5)
  const timed = /^\d{2}:\d{2}$/.test(time)
  return {
    uid: draft?.uid || 'reminder',
    title,
    description: note,
    startDate: timed ? `${date}T${time}:00` : date,
    isAllDay: !timed,
    alarmTrigger: alarmFor(draft?.alert),
  }
}
