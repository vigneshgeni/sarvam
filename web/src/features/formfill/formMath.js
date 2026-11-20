/**
 * Pure Form Fill math, formatting, masking, and profile-mapping helpers.
 * Coordinates use [x1, y1, x2, y2] in 0..1000 (top-left origin).
 */

export const NEVER_FILL_TYPES = new Set(['signature', 'photo'])

export const ID_PROFILE_KEYS = new Set(['pan', 'aadhaar'])

export const SENSITIVE_PROFILE_KEYS = new Set(['pan', 'aadhaar'])

const ID_LABEL_RE = /\b(pan|aadhaar|aadhar|uid|passport|voter\s*id|driving\s*licen[cs]e|id\s*number)\b/i

/**
 * Clamp a 0..1000 box [x1, y1, x2, y2] safely and normalize ordering.
 */
export function clampBox(box) {
  if (!Array.isArray(box) || box.length < 4) {
    return [0, 0, 100, 40]
  }
  const nums = box.slice(0, 4).map((v) => {
    const n = Number(v)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(1000, n))
  })
  let [x1, y1, x2, y2] = nums
  if (x1 > x2) [x1, x2] = [x2, x1]
  if (y1 > y2) [y1, y2] = [y2, y1]
  if (x2 - x1 < 4) {
    if (x1 <= 996) x2 = Math.min(1000, x1 + 4)
    else x1 = Math.max(0, x2 - 4)
  }
  if (y2 - y1 < 4) {
    if (y1 <= 996) y2 = Math.min(1000, y1 + 4)
    else y1 = Math.max(0, y2 - 4)
  }
  return [x1, y1, x2, y2]
}

/**
 * Convert a 0..1000 top-left box [x1, y1, x2, y2] to PDF points (bottom-left origin).
 */
export function boxToPdfRect(box, pageWidth, pageHeight) {
  const [x1, y1, x2, y2] = clampBox(box)
  const w = Math.max(1, Number(pageWidth) || 595.28)
  const h = Math.max(1, Number(pageHeight) || 841.89)

  const x = (x1 / 1000) * w
  const width = ((x2 - x1) / 1000) * w
  const height = ((y2 - y1) / 1000) * h
  // PDF origin is bottom-left: y2 (bottom in image) maps to bottom of box in PDF
  const y = h * (1 - y2 / 1000)
  const padX = Math.min(4, width * 0.04)
  const padY = Math.max(1.5, height * 0.2)
  const fontSize = Math.max(7, Math.min(16, height * 0.62))
  const baselineY = y + padY

  return {
    x,
    y,
    width,
    height,
    textX: x + padX,
    baselineY,
    fontSize,
  }
}

/**
 * Split a value into individual character cells for a charGrid field.
 * Strips whitespace/hyphens for compact code grids (e.g. PAN, PIN, Aadhaar, DDMMYYYY)
 * when the raw string is longer than `cells`, otherwise preserves characters cleanly.
 */
export function splitCharGrid(value, cells) {
  const count = Math.max(1, Math.min(40, Math.floor(Number(cells) || 1)))
  const raw = String(value ?? '').trim()
  if (!raw) return Array(count).fill('')

  let chars = Array.from(raw)
  if (chars.length > count) {
    const compact = Array.from(raw.replace(/[\s\-/]/g, ''))
    if (compact.length <= count || compact.length < chars.length) {
      chars = compact
    }
  }
  const out = Array(count).fill('')
  for (let i = 0; i < count && i < chars.length; i++) {
    out[i] = chars[i]
  }
  return out
}

const MONTH_NAMES = {
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

const SHORT_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/**
 * Parse a date string into { day, month, year } or null.
 */
export function parseLooseDate(raw) {
  if (!raw || typeof raw !== 'string') return null
  const s = raw.trim()
  if (!s) return null

  // YYYY-MM-DD or YYYY/MM/DD
  let m = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/)
  if (m) {
    const year = Number(m[1])
    const month = Number(m[2])
    const day = Number(m[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year }
    }
  }

  // DD-MM-YYYY or DD/MM/YYYY or DD.MM.YYYY (Indian standard default)
  m = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})$/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    let year = Number(m[3])
    if (year < 100) year += year >= 30 ? 1900 : 2000
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year }
    }
  }

  // 1 Jan 1990 or 01 January 1990
  m = s.match(/^(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})$/)
  if (m) {
    const day = Number(m[1])
    const month = MONTH_NAMES[m[2].toLowerCase()]
    const year = Number(m[3])
    if (month && day >= 1 && day <= 31) {
      return { day, month, year }
    }
  }

  // DDMMYYYY
  m = s.match(/^(\d{2})(\d{2})(\d{4})$/)
  if (m) {
    const day = Number(m[1])
    const month = Number(m[2])
    const year = Number(m[3])
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return { day, month, year }
    }
  }

  return null
}

/**
 * Format a date string to follow the form's own dateFormat (e.g. DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD, DDMMYYYY, MM/DD/YYYY).
 * Defaults to DD-MM-YYYY if formFormat is omitted.
 */
export function formatDateForForm(rawDate, formFormat) {
  const raw = String(rawDate ?? '').trim()
  if (!raw) return ''
  const parsed = parseLooseDate(raw)
  if (!parsed) return raw

  const dd = String(parsed.day).padStart(2, '0')
  const mm = String(parsed.month).padStart(2, '0')
  const yyyy = String(parsed.year).padStart(4, '0')
  const yy = yyyy.slice(-2)
  const mmm = SHORT_MONTHS[parsed.month - 1] || mm

  const fmt = (formFormat || 'DD-MM-YYYY').trim()
  if (!fmt) return `${dd}-${mm}-${yyyy}`

  // Replace longest tokens first
  return fmt
    .replace(/YYYY/gi, yyyy)
    .replace(/YY/gi, yy)
    .replace(/MMM/gi, mmm)
    .replace(/MM/gi, mm)
    .replace(/DD/gi, dd)
}

/**
 * Returns true if a field represents an ID number (never spoken aloud, masked until tapped).
 */
export function isIdNumberField(field) {
  if (!field) return false
  if (field.profileKey && ID_PROFILE_KEYS.has(field.profileKey)) return true
  if (field.label && ID_LABEL_RE.test(field.label)) return true
  if (field.id && ID_LABEL_RE.test(field.id)) return true
  return false
}

/**
 * Mask an ID number for on-screen display until the user taps the box to reveal/edit it.
 * Keeps only the last 3-4 characters visible with bullet dots.
 */
export function maskIdValue(value, profileKey) {
  const s = String(value ?? '').trim()
  if (!s) return ''
  if (profileKey === 'aadhaar' || /^\d{4}[\s-]?\d{4}[\s-]?\d{4}$/.test(s)) {
    const digits = s.replace(/\D/g, '')
    if (digits.length >= 4) {
      return `•••• •••• ${digits.slice(-4)}`
    }
  }
  if (s.length <= 4) return '•'.repeat(s.length)
  const keep = Math.min(3, Math.max(2, s.length - 4))
  return `${'•'.repeat(s.length - keep)}${s.slice(-keep)}`
}

/**
 * Format a full address from profile fields when a single address box is detected.
 */
export function composeProfileAddress(profile) {
  if (!profile) return ''
  const parts = [profile.addressLine, profile.city, profile.state, profile.pin]
    .map((p) => (typeof p === 'string' ? p.trim() : ''))
    .filter(Boolean)
  return parts.join(', ')
}

/**
 * Fill detected form fields from the local UserProfile.
 * Never fills signature or photo fields. Respects profile.saveIds for PAN/Aadhaar.
 */
export function fillFieldsFromProfile(fields, profile) {
  const values = {}
  const fromProfileIds = []

  if (!Array.isArray(fields) || !profile) {
    return { values, fromProfileIds }
  }

  const hasSeparateCity = fields.some((f) => f.profileKey === 'city')
  const hasSeparatePin = fields.some((f) => f.profileKey === 'pin')

  for (const field of fields) {
    if (!field || NEVER_FILL_TYPES.has(field.type)) continue
    const key = field.profileKey
    if (!key) continue
    if (ID_PROFILE_KEYS.has(key) && !profile.saveIds) continue

    let raw = ''
    if (key === 'addressLine' && !hasSeparateCity && !hasSeparatePin) {
      raw = composeProfileAddress(profile)
    } else if (typeof profile[key] === 'string') {
      raw = profile[key].trim()
    }

    if (!raw) continue

    if (field.type === 'date' || (field.dateFormat && (key === 'dob' || key === 'nomineeDob'))) {
      raw = formatDateForForm(raw, field.dateFormat)
    }

    values[field.id] = raw
    fromProfileIds.push(field.id)
  }

  return { values, fromProfileIds }
}

/**
 * Return required fillable fields that still have no value (excluding signature and photo).
 */
export function getMissingFields(fields, values) {
  if (!Array.isArray(fields)) return []
  return fields.filter((f) => {
    if (!f || NEVER_FILL_TYPES.has(f.type)) return false
    const v = values?.[f.id]
    return !v || !String(v).trim()
  })
}

/**
 * Build the Gemini Live instruction for asking missing fields one at a time.
 * Excludes signature/photo and instructs Gemini never to speak ID numbers aloud.
 */
export function buildMissingFieldsPrompt(missingFields) {
  const askable = (missingFields || []).filter((f) => f && !NEVER_FILL_TYPES.has(f.type))
  if (askable.length === 0) return ''
  const labels = askable.map((f) => f.label || f.id).join(', ')
  return `Ask the user, one at a time, for: ${labels}. Keep each question short. Never read out ID numbers aloud.`
}

/**
 * Build the filled PDF file name: "<Form title> - filled - <YYYY-MM-DD>.pdf"
 */
export function buildFilledPdfFilename(formTitle, now = new Date()) {
  const cleanTitle = (String(formTitle || 'Form').trim() || 'Form')
    .replace(/[<>:"/\\|?*\u0000-\u001F]/g, '')
    .replace(/\s+/g, ' ')
    .slice(0, 80)
  const d = now instanceof Date ? now : new Date(now)
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${cleanTitle} - filled - ${yyyy}-${mm}-${dd}.pdf`
}

/**
 * Sanitize a UserProfile before persisting: strips PAN/Aadhaar when saveIds is false.
 */
export function sanitizeProfileForStorage(profile) {
  const saveIds = Boolean(profile?.saveIds)
  const clean = {
    id: profile?.id || 'me',
    fullName: String(profile?.fullName || '').trim(),
    dob: String(profile?.dob || '').trim(),
    gender: String(profile?.gender || '').trim(),
    mobile: String(profile?.mobile || '').trim(),
    email: String(profile?.email || '').trim(),
    addressLine: String(profile?.addressLine || '').trim(),
    city: String(profile?.city || '').trim(),
    state: String(profile?.state || '').trim(),
    pin: String(profile?.pin || '').trim(),
    occupation: String(profile?.occupation || '').trim(),
    fatherOrSpouseName: String(profile?.fatherOrSpouseName || '').trim(),
    nomineeName: String(profile?.nomineeName || '').trim(),
    nomineeRelation: String(profile?.nomineeRelation || '').trim(),
    nomineeDob: String(profile?.nomineeDob || '').trim(),
    saveIds,
    pan: saveIds ? String(profile?.pan || '').trim().toUpperCase() : '',
    aadhaar: saveIds ? String(profile?.aadhaar || '').trim() : '',
    updatedAt: Number(profile?.updatedAt) || Date.now(),
  }
  return clean
}
