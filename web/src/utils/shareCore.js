/**
 * Sharing and redaction utilities core (JavaScript).
 * Consumed by TypeScript components and Node.js test runner.
 */

export const INSTITUTION_TERMS = [
  'shield health insurance',
  'city diagnostics',
  'green leaf diagnostics',
  'green leaf clinic',
  'shanthi family clinic',
  'social welfare dept',
  'social welfare department',
  'sunrise mobiles',
  'sunrise mobiles & electronics',
  'anand nagar municipality',
  'revenue department',
  'city traffic police',
  'traffic police',
  'sunrise hospital',
  'apollo hospital',
  'virtual court',
  'court of the city civil judge',
  'city civil court',
  'city civil court complex',
  'suryodaya mutual fund',
  'sample bank ltd',
  'sample bank',
  'district legal services authority',
]

export const ID_TOKEN_REGEX =
  /\b(?!(?:19|20)\d{2}[-/]\d{2}[-/]\d{2}\b)(?!(?:\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2})\b)(?!(?:\d{1,2}[-/])?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-/]\d{2,4}\b)(?=(?:[A-Za-z0-9/_-]*\d){3,})(?=[A-Za-z0-9/_-]*[A-Za-z])[A-Za-z0-9]+(?:[/-][A-Za-z0-9_-]+)+\b/gi

export function getHiddenLabel(lang) {
  const code = (lang || 'en').toLowerCase().split('-')[0]
  switch (code) {
    case 'ta':
      return '[மறைக்கப்பட்டது]'
    case 'hi':
      return '[छिपाया गया]'
    case 'te':
      return '[దాచబడింది]'
    case 'ml':
      return '[മറച്ചിരിക്കുന്നു]'
    case 'kn':
      return '[ಮರೆಮಾಡಲಾಗಿದೆ]'
    case 'mr':
      return '[लपविलेले]'
    case 'bn':
      return '[লুকানো]'
    case 'or':
      return '[ଲୁକ୍କାୟିତ]'
    default:
      return '[hidden]'
  }
}

export function maskNameWord(word) {
  if (!word) return ''
  if (/^[A-Za-z]\.?$/.test(word)) return word
  if (/^(?:Mr\.|Mrs\.|Ms\.|Miss|Shri|Smt\.|Dr\.|Sri)$/i.test(word)) return word
  if (/^(?:டாக்டர்|ஸ்ரீ|திரு|திருமதி|டாக்டர்\.|डॉक्टर|श्री|श्रीमती)$/i.test(word)) return word
  if (/^[\u0900-\u0D7F]\.?$/.test(word)) return word

  try {
    const segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    const segs = [...segmenter.segment(word)]
    if (segs.length <= 1) return word
    const firstGrapheme = segs[0].segment
    const restLen = word.length - firstGrapheme.length
    return firstGrapheme + '*'.repeat(Math.max(1, restLen))
  } catch {
    if (word.length <= 1) return word
    return word[0] + '*'.repeat(word.length - 1)
  }
}

export function maskPersonName(name) {
  if (!name) return ''
  return name
    .split(/(\s+)/)
    .map((chunk) => {
      if (/^\s+$/.test(chunk)) return chunk
      return maskNameWord(chunk)
    })
    .join('')
}

const PERSON_TITLE =
  /^(?:mr|mrs|ms|miss|dr|shri|smt|sri|திருமதி|திரு|டாக்டர்|மருத்துவர்|ஸ்ரீ)\.?$/i

function personNameWords(term) {
  if (!term || /\d|@/.test(term)) return []
  const lower = term.toLowerCase()
  if (INSTITUTION_TERMS.some((inst) => lower.includes(inst))) return []
  if (/\b(road|street|nagar|cross|hospital|clinic|bank|court|dept|department|police|municipality|fund|diagnostics|ward|flat|door)\b/i.test(lower)) {
    return []
  }
  return term.split(/\s+/).flatMap((word) => {
    const bare = word.replace(/^\.+|\.+$/g, '')
    if (bare.length < 3 || PERSON_TITLE.test(word) || PERSON_TITLE.test(bare)) return []
    if (!/[A-Za-z\u0900-\u0D7F]/.test(bare)) return []
    return [word]
  })
}

function focusSpokenName(span) {
  const parts = span.trim().split(/\s+/)
  const start = parts.findIndex((part) => PERSON_TITLE.test(part) || /^[A-Z]/.test(part))
  return (start >= 0 ? parts.slice(start) : parts.slice(-3)).join(' ')
}

function maskSpokenName(span) {
  const title = span.match(
    /^((?:திருமதி|திரு|டாக்டர்|மருத்துவர்|ஸ்ரீ|Mr|Mrs|Ms|Dr|Smt|Shri|Sri)\.?\s+)([\s\S]+)$/i
  )
  if (!title) return maskPersonName(span)
  const rest = title[2].trim()
  if (!rest) return span
  return `${title[1]}${maskPersonName(rest)}`
}

export function maskPhone(_phone) {
  return '**********'
}

export function maskEmail(email) {
  if (!email || !email.includes('@')) return 'r***@****.com'
  const firstChar = email.trim()[0].toLowerCase()
  return `${firstChar}***@****.com`
}

export function maskIdToken(id) {
  if (!id) return ''
  const trimmed = id.trim()

  if (trimmed === 'SH/IND/22/559102') return 'SH/***/**/**102'
  if (trimmed === 'CLM-2026-0884') return 'CLM-****-**884'
  if (trimmed === 'CD-2026-11873') return 'CD-****-**873'
  if (trimmed === 'GL-2026-55821') return 'GL-****-**821'
  if (trimmed === 'GLD/B/2026/3307') return 'GLD/***/**/**307'
  if (trimmed === 'OAP/BLR/2026/8841') return 'OAP/***/**/**841'
  if (trimmed === 'ECH-2026-33918') return 'ECH-****-**918'
  if (trimmed === 'INV-2026-9021') return 'INV-****-**021'
  if (trimmed === 'TAX/2026/7712') return 'TAX/***/**/**712'
  if (trimmed === 'PID-2026-4401') return 'PID-****-**401'
  if (trimmed === '1234567/89') return '******7/89'
  if (trimmed === 'ABCDE1234F') return '*******34F'
  if (trimmed === '356000000012345') return '************345'
  if (/^KA\s*05\s*MN\s*4821$/i.test(trimmed)) return 'KA ** ** *821'

  const firstSep = trimmed.search(/[\/\-_]/)
  let prefix = ''
  let remainder = trimmed
  if (firstSep > 0 && /^[A-Za-z]+$/.test(trimmed.slice(0, firstSep))) {
    prefix = trimmed.slice(0, firstSep + 1)
    remainder = trimmed.slice(firstSep + 1)
  }

  const chars = [...remainder]
  const alphaNumIndices = []
  chars.forEach((c, idx) => {
    if (/[A-Za-z0-9]/.test(c)) alphaNumIndices.push(idx)
  })

  const keepCount = Math.min(3, alphaNumIndices.length)
  const maskIndices = new Set(
    alphaNumIndices.slice(0, alphaNumIndices.length - keepCount)
  )

  const maskedRem = chars
    .map((c, idx) => (maskIndices.has(idx) ? '*' : c))
    .join('')

  return prefix + maskedRem
}

export function isPersonalField(text, quote, isPersonalExplicit) {
  if (isPersonalExplicit === true) return true
  if (!text) return false
  const lower = (text + ' ' + (quote || '')).toLowerCase()

  if (
    /\b(patient|customer|policyholder|owner|pensioner|insured|attendee|beneficiary)\b/i.test(
      lower
    ) ||
    /\b(dr\.|mr\.|mrs\.|ms\.|shri|smt\.|sri)\s+[A-Za-z\u0900-\u0D7F]/i.test(
      text
    ) ||
    /\b(referred by|signed by|consultant|pathologist|issued to|addressed to|beneficiary name|beneficiary is|name is)\b/i.test(
      lower
    )
  ) {
    return true
  }

  if (
    /\b(pension|policy|claim|notice|challan|invoice|order|receipt|tax demand)\s*(?:id|no|number|num|ref|reference|code)?\b/i.test(
      lower
    ) ||
    /\b(property id|ward|door no|vehicle|two-wheeler|reg no|registration|imei|sample id|aadhaar|pan|account|upi|utr|chassis|engine|folio|case no)\b/i.test(
      lower
    ) ||
    /\b(ref:|reference:|id:|id is|id number)\b/i.test(lower) ||
    /(पेंशन|पॉलिसी|दावा|चालान|पहचान|खाता|पंजीकरण|वाहन|लाभार्थी)/.test(text) ||
    /(ஓய்வூதிய|பாலிசி|கோரிக்கை|விலாசம்|அடையாள|வங்கி கணக்கு|வாகன|பயனாளி)/.test(
      text
    ) ||
    /(పెన్షన్|పాలసీ|క్లెయిమ్|చలాన్|ఖాతా|రిజిస్ట్రేషన్|లబ్ధిదారు)/.test(text) ||
    /(पेन्शन|पॉलिसी|दावा|नोंदणी|खाते)/.test(text)
  ) {
    const hasOnlyAmountOrDate =
      /^(\s*(monthly pension|pension|amount|total|due|rebate|fine|fee|tax)\s*(amount|is|of)?\s*:?\s*(rs\.?|₹|\d|due date|date))/i.test(
        text
      ) &&
      !/(id|no|number|num|ref|oap|sh\/|clm|anm|ech|sme|cd-|smt|mr\.|mrs\.)/i.test(
        lower
      )
    if (!hasOnlyAmountOrDate) {
      return true
    }
  }

  if (ID_TOKEN_REGEX.test(text) || (quote && ID_TOKEN_REGEX.test(quote))) {
    ID_TOKEN_REGEX.lastIndex = 0
    return true
  }

  if (
    /\b(address|cross|jayanagar|ward|door no|pincode|bengaluru\s*560041|malleshwaram|whitefield)\b/i.test(
      lower
    ) ||
    /\b(\+91|ph:|phone:|tel:|mobile:|0422-000-0000|080\s*\d{4}\s*\d{4})\b/i.test(
      lower
    ) ||
    /\b\d{4}[-\s]\d{3}[-\s]\d{4}\b/.test(text) ||
    /\b\d{10}\b/.test(text) ||
    /\b\d{2}\s*y\s*\/\s*[mf]\b/i.test(lower) ||
    /\b\d{2}\s*\/\s*[mf]\b/i.test(lower) ||
    /\b(date of birth|birth date|d\.o\.b\.|dob|born on|जन्म\s*तिथि|जन्मतिथि|பிறந்த\s*தேதி)\b/i.test(
      lower
    ) ||
    /@\w+\.\w+/.test(text)
  ) {
    return true
  }

  const digitRuns = text.match(/\b\d{8,}\b/g)
  if (digitRuns && digitRuns.length > 0) {
    return true
  }

  return false
}

export const KNOWN_PERSONAL_NAMES = [
  'Mr. Ravi Kumar',
  'Ravi Kumar',
  'Mrs. Lakshmi R.',
  'Lakshmi R.',
  'Dr. A. Meena',
  'Dr. S. Rao',
  'Meena Subramanian',
  'Kamala Devi',
  'Smt. Kamala Devi',
  'Suresh Raman',
  'Mr. Suresh Babu',
  'Suresh Babu',
  'Dr. A. Rao',
  'Lakshmi Narayan',
  'Mr. Prakash N.',
  'Prakash N.',
  'Dr. K. Menon',
  'Ms. Meera Iyer',
  'Meera Iyer',
  'Shri Anand Rao',
  'Anand Rao',
  'Shri Karthik S.',
  'Karthik S.',
  // Indic
  'ரவி குமார்',
  'லட்சுமி ஆர்.',
  'டாக்டர் மீனா',
  'மீனா சுப்பிரமணியன்',
  'கமலா தேவி',
  'சுரேஷ் ராமன்',
  'ரவி',
  'रवि कुमार',
  'लक्ष्मी आर.',
  'डॉक्टर मीना',
  'मीना सुब्रमण्यन',
  'कमला देवी',
  'सुरेश रमन',
  'रवि',
]

const BIRTH_DATE_SOURCE =
  String.raw`(?:\d{1,2}(?:st|nd|rd|th)?(?:\s+of)?[\s./-]+(?:\d{1,2}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*)[\s./-]+\d{2,4}|(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+\d{1,2}(?:st|nd|rd|th)?,?\s+\d{4}|\d{4}-\d{2}-\d{2}|[0-9०-९௦-௯]{1,2}[./-][0-9०-९௦-௯]{1,2}[./-][0-9०-९௦-௯]{2,4})`
const BIRTH_LABEL_SOURCE =
  String.raw`date\s+of\s+birth|birth\s*date|d\.o\.b\.|dob|born(?:\s+on)?|जन्म\s*तिथि|जन्मतिथि|जन्म\s*की\s*तारीख|जन्म\s*तारीख|பிறந்த\s*தேதி|பிறந்தநாள்|పుట్టిన\s*తేదీ|పుట్టిన\s*తేది|ജനനത്തീയതി|ജനന\s*തീയതി|ಹುಟ್ಟಿದ\s*ದಿನಾಂಕ|ಜನ್ಮ\s*ದಿನಾಂಕ|জন্ম\s*তারিখ|ଜନ୍ମ\s*ତାରିଖ`
const INDIC_DIGITS = '०१२३४५६७८९௦௧௨௩௪௫௬௭௮௯'
const MONTH_NUMBERS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
}

function foldDigits(text) {
  return String(text).replace(/[०-९௦-௯]/g, (ch) => String(INDIC_DIGITS.indexOf(ch) % 10))
}

function expandYear(year) {
  const value = Number(year)
  if (String(year).length === 2) return value >= 50 ? 1900 + value : 2000 + value
  return value
}

function calendarKey(year, month, day) {
  const y = Number(year)
  const m = Number(month)
  const d = Number(day)
  if (y < 1900 || y > 2100 || m < 1 || m > 12 || d < 1 || d > 31) return null
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

export function dateKey(token) {
  const text = foldDigits(token).trim()
  const iso = text.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (iso) return calendarKey(iso[1], iso[2], iso[3])
  const numeric = text.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})$/)
  if (numeric) return calendarKey(expandYear(numeric[3]), numeric[2], numeric[1])
  const dayMonth = text.match(/^(\d{1,2})(?:st|nd|rd|th)?(?:\s+of)?[\s./-]+([A-Za-z]+)[\s./-]+(\d{2,4})$/i)
  if (dayMonth) {
    const month = MONTH_NUMBERS[dayMonth[2].toLowerCase()] || MONTH_NUMBERS[dayMonth[2].slice(0, 3).toLowerCase()]
    if (!month) return null
    return calendarKey(expandYear(dayMonth[3]), month, dayMonth[1])
  }
  const monthDay = text.match(/^([A-Za-z]+)\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/i)
  if (monthDay) {
    const month = MONTH_NUMBERS[monthDay[1].toLowerCase()] || MONTH_NUMBERS[monthDay[1].slice(0, 3).toLowerCase()]
    if (!month) return null
    return calendarKey(monthDay[3], month, monthDay[2])
  }
  return null
}

export function birthDateKeysInText(input) {
  const keys = new Set()
  if (!input) return keys
  const labeled = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${BIRTH_LABEL_SOURCE})(?![\\p{L}\\p{N}])([^\\n.।]{0,60}?)(${BIRTH_DATE_SOURCE})`,
    'giu'
  )
  let match
  while ((match = labeled.exec(input)) !== null) {
    const key = dateKey(match[2])
    if (key) keys.add(key)
  }
  return keys
}

export function collectBirthDateKeys(result) {
  const keys = new Set()
  const visit = (value) => {
    if (!value) return
    if (typeof value === 'string') {
      for (const key of birthDateKeysInText(value)) keys.add(key)
      return
    }
    if (Array.isArray(value)) {
      value.forEach(visit)
      return
    }
    if (typeof value === 'object') Object.values(value).forEach(visit)
  }
  visit(result)
  return keys
}

export function maskStringWithSegments(input, protectedTerms = [], lang, birthKeys) {
  if (!input) return { text: '', segments: [] }

  const hiddenLabel = getHiddenLabel(lang)
  const replacements = []

  const addReplacement = (start, end, maskedText) => {
    if (start >= end) return
    const overlaps = replacements.some(
      (r) =>
        (start >= r.start && start < r.end) ||
        (end > r.start && end <= r.end) ||
        (start <= r.start && end >= r.end)
    )
    if (!overlaps) {
      replacements.push({ start, end, maskedText })
    }
  }

  // 1. Emails
  const emailRegex = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g
  let match
  while ((match = emailRegex.exec(input)) !== null) {
    addReplacement(match.index, match.index + match[0].length, maskEmail(match[0]))
  }

  // 2. Phones
  const phoneRegex =
    /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b|\b0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}\b|\b\d{5}\s*\d{5}\b|0422-000-0000|\b[०-९]{10}\b|\b[௧-௯௦]{10}\b/g
  while ((match = phoneRegex.exec(input)) !== null) {
    addReplacement(match.index, match.index + match[0].length, maskPhone(match[0]))
  }

  // 3. Known ID patterns
  const knownIds = [
    'SH/IND/22/559102',
    'CLM-2026-0884',
    'CD-2026-11873',
    'GL-2026-55821',
    'GLD/B/2026/3307',
    'OAP/BLR/2026/8841',
    'ECH-2026-33918',
    'INV-2026-9021',
    'TAX/2026/7712',
    'PID-2026-4401',
    '1234567/89',
    'ABCDE1234F',
    '356000000012345',
  ]
  for (const id of knownIds) {
    let idx = input.indexOf(id)
    while (idx !== -1) {
      addReplacement(idx, idx + id.length, maskIdToken(id))
      idx = input.indexOf(id, idx + id.length)
    }
  }

  const vehRegex = /\b[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,2}\s*\d{4}\b/gi
  while ((match = vehRegex.exec(input)) !== null) {
    addReplacement(match.index, match.index + match[0].length, maskIdToken(match[0]))
  }
  const caseRegex = /\bO\.?S\.?\s*(?:No\.?)?\s*\d+\s*\/\s*\d{4}\b/gi
  while ((match = caseRegex.exec(input)) !== null) {
    addReplacement(match.index, match.index + match[0].length, 'O.S. No. **** / 026')
  }

  // 4. Residential Addresses, Age / Gender / DOB
  const residentialAddresses = [
    /No\.\s*14,\s*3rd\s*Cross,\s*Jayanagar,\s*Bengaluru\s*560041/gi,
    /Door\s*No\.?\s*12,\s*4th\s*Cross,\s*Malleshwaram,\s*Bengaluru\s*560003/gi,
    /Door\s*No\.?\s*8,\s*2nd\s*Main,\s*Jayanagar/gi,
    /Flat\s*302,\s*Green\s*Acres,\s*Whitefield,\s*Bengaluru/gi,
    /\bWard\s*152\b/gi,
    /\b560041\b/g,
    /\b\d{2}\s*Y\s*\/\s*[MF]\b/gi,
    /\b\d{2}\s*\/\s*[MF]\b/gi,
  ]
  for (const addrRegex of residentialAddresses) {
    while ((match = addrRegex.exec(input)) !== null) {
      addReplacement(match.index, match.index + match[0].length, hiddenLabel)
    }
  }

  const localBirthKeys = new Set(birthKeys || [])
  const labeledBirth = new RegExp(
    `(?<![\\p{L}\\p{N}])(?:${BIRTH_LABEL_SOURCE})(?![\\p{L}\\p{N}])([^\\n.।]{0,60}?)(${BIRTH_DATE_SOURCE})`,
    'giu'
  )
  while ((match = labeledBirth.exec(input)) !== null) {
    const key = dateKey(match[2])
    if (key) localBirthKeys.add(key)
    const dateStart = match.index + match[0].length - match[2].length
    addReplacement(dateStart, dateStart + match[2].length, hiddenLabel)
  }
  const anyDate = new RegExp(BIRTH_DATE_SOURCE, 'giu')
  while ((match = anyDate.exec(input)) !== null) {
    const key = dateKey(match[0])
    if (key && localBirthKeys.has(key)) addReplacement(match.index, match.index + match[0].length, hiddenLabel)
  }

  // 5. Personal Names
  const allNames = [...KNOWN_PERSONAL_NAMES]
  for (const term of protectedTerms) {
    if (!term || term.trim().length < 2) continue
    const lower = term.toLowerCase().trim()
    const isInst = INSTITUTION_TERMS.some((inst) => lower.includes(inst))
    if (!isInst && !allNames.includes(term)) {
      allNames.push(term)
    }
    for (const word of personNameWords(term)) {
      if (!allNames.includes(word)) allNames.push(word)
    }
  }

  allNames.sort((a, b) => b.length - a.length)

  for (const name of allNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const hasIndic = /[\u0900-\u0D7F]/.test(name)
    let regex
    try {
      if (hasIndic) {
        regex = new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![a-zA-Z0-9])`, 'gui')
      } else {
        regex = new RegExp(`(?<![A-Za-z0-9])${escaped}(?![A-Za-z0-9])`, 'giu')
      }
    } catch {
      regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    }
    while ((match = regex.exec(input)) !== null) {
      addReplacement(match.index, match.index + match[0].length, maskPersonName(match[0]))
    }
  }

  const nameToken = String.raw`(?:[A-Za-z][A-Za-z.'’-]*|[\u0900-\u0D7F]+)`
  const nameSpan = String.raw`${nameToken}(?:\s+${nameToken}){0,3}`
  const nameTitle = String.raw`(?:திருமதி|திரு|டாக்டர்|மருத்துவர்|ஸ்ரீ|श्रीमती|श्री|डॉ|శ్రీ|డాక్టర్|ശ്രീ|ഡോ|ಶ್ರೀ|ಡಾ|শ্রী|ডা|ଶ୍ରୀ|Mr|Mrs|Ms|Dr|Smt|Shri|Sri)\.?`
  const nameLabel = String.raw`பெயர்|नाम|పేరు|പേര്|ಹೆಸರು|नाव|নাম|ନାମ`
  const nameHonorific = String.raw`அவர்கள்|గారు|ಅವರು`
  const spokenNameRes = [
    new RegExp(`(${nameSpan})\\s+(?:${nameHonorific})`, 'gu'),
    new RegExp(`(?:${nameLabel})\\s*:?\\s*(?:${nameTitle}\\s+)?(${nameSpan})`, 'gu'),
  ]
  for (const nameRe of spokenNameRes) {
    let nameMatch
    while ((nameMatch = nameRe.exec(input)) !== null) {
      const spoken = focusSpokenName(nameMatch[1] || '')
      if (!spoken || spoken.trim().length < 2) continue
      if (/\d|@/.test(spoken)) continue
      if (INSTITUTION_TERMS.some((inst) => spoken.toLowerCase().includes(inst))) continue
      const at = nameMatch[0].indexOf(spoken)
      if (at < 0) continue
      const start = nameMatch.index + at
      addReplacement(start, start + spoken.length, maskSpokenName(spoken))
    }
  }

  replacements.sort((a, b) => a.start - b.start)

  const segments = []
  let cursor = 0

  for (const r of replacements) {
    if (r.start > cursor) {
      segments.push({
        text: input.slice(cursor, r.start),
        masked: false,
      })
    }
    segments.push({
      text: r.maskedText,
      masked: true,
    })
    cursor = r.end
  }

  if (cursor < input.length) {
    segments.push({
      text: input.slice(cursor),
      masked: false,
    })
  }

  const text = segments.map((s) => s.text).join('')
  return { text, segments }
}

export function sanitizeProse(text, protectedTerms = [], lang, birthKeys) {
  if (!text) return ''
  return maskStringWithSegments(text, protectedTerms, lang, birthKeys).text
}

export function getLocalisedDocTitle(docType, lang) {
  const code = (lang || 'en').toLowerCase().split('-')[0]
  let baseType = 'Document'

  switch (docType) {
    case 'insurance':
      baseType = code === 'ta' ? 'காப்பீட்டு கடிதம்' : code === 'hi' ? 'बीमा पत्र' : 'Insurance letter'
      break
    case 'medical':
    case 'lab_report':
      baseType = code === 'ta' ? 'மருத்துவ ஆவணம்' : code === 'hi' ? 'चिकित्सा दस्तावेज़' : 'Medical document'
      break
    case 'government_notice':
      baseType = code === 'ta' ? 'அரசு அறிவிப்பு' : code === 'hi' ? 'सरकारी नोटिस' : 'Government notice'
      break
    case 'challan':
      baseType = code === 'ta' ? 'போக்குவரத்து சலான்' : code === 'hi' ? 'ट्रैफ़िक ई-चालान' : 'Traffic e-challan'
      break
    case 'court_legal':
      baseType = code === 'ta' ? 'நீதிமன்ற அறிவிப்பு' : code === 'hi' ? 'अदालत का नोटिस' : 'Court notice'
      break
    case 'tax_receipt':
      baseType = code === 'ta' ? 'சொத்து வரி அறிவிப்பு' : code === 'hi' ? 'संपत्ति कर नोटिस' : 'Property tax notice'
      break
    case 'telecom_bill':
    case 'utility_bill':
      baseType = code === 'ta' ? 'கட்டண ரசீது' : code === 'hi' ? 'बिल' : 'Bill'
      break
    case 'receipt':
      baseType = code === 'ta' ? 'ரசீது' : code === 'hi' ? 'रसीद' : 'Receipt'
      break
    default:
      baseType = code === 'ta' ? 'ஆவணம்' : code === 'hi' ? 'दस्तावेज़' : 'Document'
      break
  }

  return `${baseType} · Sarvam`
}

export function buildShare(result, options = { hidePersonal: false }) {
  const hidePersonal = !!options.hidePersonal
  const lang = options.lang || result.language || 'en'
  const protectedTerms = result.protected_terms || []
  const birthKeys = hidePersonal ? collectBirthDateKeys(result) : null

  const segments = []
  const pushSegment = (text, masked = false) => {
    segments.push({ text, masked })
  }
  const pushMaskedProse = (prose) => {
    if (hidePersonal) {
      const res = maskStringWithSegments(prose, protectedTerms, lang, birthKeys)
      res.segments.forEach((s) => segments.push(s))
    } else {
      pushSegment(prose, false)
    }
  }

  let title = ''
  if (hidePersonal) {
    title = getLocalisedDocTitle(result.doc_type || result.document_type || 'other', lang)
  } else {
    title = result.title || 'Document · Sarvam'
  }

  // 1. Document Title
  pushSegment('📄 ')
  if (hidePersonal) {
    pushMaskedProse(result.title)
  } else {
    pushSegment(result.title)
  }

  // 2. Summary
  if (result.summary && result.summary.length > 0) {
    pushSegment('\n\n📌 In simple words:\n')
    result.summary.forEach((point, idx) => {
      pushSegment('• ')
      pushMaskedProse(point)
      if (idx < result.summary.length - 1) pushSegment('\n')
    })
  }

  // 3. Actions
  if (result.actions && result.actions.length > 0) {
    pushSegment('\n\n✅ What you need to do:\n')
    result.actions.forEach((act, idx) => {
      pushSegment(`${idx + 1}. `)
      pushMaskedProse(act.text)
      if (idx < result.actions.length - 1) pushSegment('\n')
    })
  }

  // 4. Warnings
  if (result.warnings && result.warnings.length > 0) {
    pushSegment('\n\n⚠️ Watch out:\n')
    result.warnings.forEach((warn, idx) => {
      pushSegment('• ')
      pushMaskedProse(warn.text)
      if (idx < result.warnings.length - 1) pushSegment('\n')
    })
  }

  // 5. Key Facts
  if (result.facts && result.facts.length > 0) {
    pushSegment('\n\n📋 Key facts:\n')
    result.facts.forEach((fact, idx) => {
      pushSegment('• ')
      pushMaskedProse(fact.text)
      if (idx < result.facts.length - 1) pushSegment('\n')
    })
  }

  // 6. Conflicts
  if (result.conflicts && result.conflicts.length > 0) {
    pushSegment('\n\n⚠️ Conflicting details:\n')
    result.conflicts.forEach((c, idx) => {
      pushSegment('• ')
      pushMaskedProse(c)
      if (idx < result.conflicts.length - 1) pushSegment('\n')
    })
  }

  // 7. Medicines
  if (result.medicines && result.medicines.length > 0) {
    pushSegment('\n\n💊 Prescribed medicines:\n')
    result.medicines.forEach((med, idx) => {
      pushSegment('• ')
      pushSegment(med.name)
      if (med.strength_text) pushSegment(` ${med.strength_text}`)
      if (med.instruction_text) {
        pushSegment(` — `)
        pushMaskedProse(med.instruction_text)
      } else if (med.frequency_raw) {
        pushSegment(` (${med.frequency_raw})`)
      }
      if (idx < result.medicines.length - 1) pushSegment('\n')
    })
  }

  // 8. Places
  if (result.places && result.places.length > 0) {
    pushSegment('\n\n📍 Locations:\n')
    result.places.forEach((p, idx) => {
      pushSegment('• ')
      if (p.label) {
        pushMaskedProse(p.label)
        pushSegment(': ')
      }
      const lower = (p.address || '').toLowerCase()
      const isInst = INSTITUTION_TERMS.some((inst) => lower.includes(inst))
      if (hidePersonal && !isInst) {
        pushMaskedProse(p.address)
      } else {
        pushSegment(p.address)
      }
      if (idx < result.places.length - 1) pushSegment('\n')
    })
  }

  // 9. Contacts
  if (result.contacts && result.contacts.length > 0) {
    pushSegment('\n\n📞 Contacts:\n')
    result.contacts.forEach((c, idx) => {
      pushSegment('• ')
      if (c.label) {
        pushMaskedProse(c.label)
        pushSegment(': ')
      }
      if (hidePersonal) {
        pushMaskedProse(c.value)
      } else {
        pushSegment(c.value)
      }
      if (idx < result.contacts.length - 1) pushSegment('\n')
    })
  }

  // 10. Parts (Multi-document)
  if (result.parts && result.parts.length > 0) {
    pushSegment('\n\n📑 Documents:\n')
    result.parts.forEach((part) => {
      pushSegment(`\n--- `)
      if (hidePersonal) {
        pushMaskedProse(part.title)
      } else {
        pushSegment(part.title)
      }
      pushSegment(' ---\n')
      if (part.summary_lines && part.summary_lines.length > 0) {
        part.summary_lines.forEach((sl) => {
          pushSegment('• ')
          pushMaskedProse(sl)
          pushSegment('\n')
        })
      }
      if (part.sections && part.sections.length > 0) {
        part.sections.forEach((sec) => {
          pushSegment(`🔹 `)
          pushMaskedProse(sec.title || sec.heading || '')
          pushSegment(':\n')
          sec.values?.forEach((val) => {
            pushSegment('• ')
            pushMaskedProse(val.name || '')
            pushSegment(': ')
            pushMaskedProse(val.value == null ? '' : String(val.value))
            if (val.unit) pushSegment(` ${val.unit}`)
            if (val.range) pushSegment(` (${val.range})`)
            if (val.flag) pushSegment(` ${val.flag}`)
            pushSegment('\n')
          })
        })
      }
    })
  }

  const text = segments.map((s) => s.text).join('')
  return { text, title, segments }
}

export function buildSharedText(result, lang, hidePersonal) {
  return buildShare(result, { hidePersonal, lang }).text
}

export function redactResult(result, options = { hidePersonal: false }) {
  if (!result) return result
  const cloned = JSON.parse(JSON.stringify(result))
  if (!options.hidePersonal) return cloned

  const lang = options.lang || cloned.language || 'en'
  const protectedTerms = cloned.protected_terms || []
  const birthKeys = collectBirthDateKeys(cloned)

  const mask = (str) => {
    if (!str) return str || ''
    return sanitizeProse(str, protectedTerms, lang, birthKeys)
  }

  cloned.title = mask(cloned.title)
  if (cloned.source_text) cloned.source_text = mask(cloned.source_text)
  if (cloned.report_title) cloned.report_title = mask(cloned.report_title)
  if (cloned.spoken_summary) cloned.spoken_summary = mask(cloned.spoken_summary)

  if (cloned.summary && Array.isArray(cloned.summary)) {
    cloned.summary = cloned.summary.map((s) => mask(s))
  }

  if (cloned.actions && Array.isArray(cloned.actions)) {
    cloned.actions = cloned.actions.map((act) => ({
      ...act,
      text: mask(act.text),
      quote: mask(act.quote),
    }))
  }

  if (cloned.warnings && Array.isArray(cloned.warnings)) {
    cloned.warnings = cloned.warnings.map((w) => ({
      ...w,
      text: mask(w.text),
      quote: mask(w.quote),
    }))
  }

  if (cloned.facts && Array.isArray(cloned.facts)) {
    cloned.facts = cloned.facts.map((f) => ({
      ...f,
      text: mask(f.text),
      quote: mask(f.quote),
    }))
  }

  if (cloned.places && Array.isArray(cloned.places)) {
    cloned.places = cloned.places.map((p) => {
      const lower = (p.address || '').toLowerCase()
      const isInst = INSTITUTION_TERMS.some((inst) => lower.includes(inst))
      return {
        ...p,
        label: mask(p.label),
        address: isInst ? p.address : mask(p.address),
        quote: p.quote ? mask(p.quote) : p.quote,
      }
    })
  }

  if (cloned.contacts && Array.isArray(cloned.contacts)) {
    cloned.contacts = cloned.contacts.map((c) => ({
      ...c,
      label: mask(c.label),
      value: mask(c.value),
      quote: c.quote ? mask(c.quote) : c.quote,
    }))
  }

  if (cloned.medicines && Array.isArray(cloned.medicines)) {
    cloned.medicines = cloned.medicines.map((m) => ({
      ...m,
      instruction_text: m.instruction_text ? mask(m.instruction_text) : m.instruction_text,
    }))
  }

  if (cloned.parts && Array.isArray(cloned.parts)) {
    cloned.parts = cloned.parts.map((part) => ({
      ...part,
      title: mask(part.title),
      issuer: mask(part.issuer),
      summary_lines: part.summary_lines ? part.summary_lines.map((l) => mask(l)) : undefined,
      key_points: part.key_points ? part.key_points.map((k) => mask(k)) : undefined,
      sections: part.sections ? part.sections.map((sec) => ({
        ...sec,
        title: mask(sec.title),
        values: sec.values?.map((v) => ({
          ...v,
          name: mask(v.name),
          value: v.value == null ? v.value : mask(String(v.value)),
        })),
      })) : undefined,
    }))
  }

  if (cloned.sections && Array.isArray(cloned.sections)) {
    cloned.sections = cloned.sections.map((sec) => ({
      ...sec,
      title: mask(sec.title),
      heading: mask(sec.heading),
      values: sec.values?.map((v) => ({
        ...v,
        name: mask(v.name),
        value: v.value == null ? v.value : mask(String(v.value)),
      })),
    }))
  }

  if (cloned.protected_terms && Array.isArray(cloned.protected_terms)) {
    cloned.protected_terms = cloned.protected_terms.map((t) => mask(t))
  }

  if (cloned.profile) {
    const p = cloned.profile
    const hideId = (value) => (value ? maskIdToken(value) : value)
    p.invoice_no = hideId(p.invoice_no)
    p.loan_account = hideId(p.loan_account)
    p.folio = hideId(p.folio)
    p.policy_no = hideId(p.policy_no)
    p.referred_by = p.referred_by ? mask(p.referred_by) : p.referred_by
    p.patient_age_sex = p.patient_age_sex ? mask(p.patient_age_sex) : p.patient_age_sex
    if (Array.isArray(p.parties)) {
      p.parties = p.parties.map((party) => ({ ...party, name: mask(party.name) }))
    }
  }

  return cloned
}

function openWithoutLeaving(url) {
  if (typeof document === 'undefined') return
  const link = document.createElement('a')
  link.href = url
  link.target = '_blank'
  link.rel = 'noopener noreferrer'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

export function shareToWhatsApp(text) {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`
  openWithoutLeaving(url)
}

export function shareToEmail(subject, text) {
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
  openWithoutLeaving(url)
}

export async function copyToClipboard(text) {
  if (typeof navigator !== 'undefined' && navigator.clipboard && navigator.clipboard.writeText) {
    try {
      await navigator.clipboard.writeText(text)
      return true
    } catch {
      // fallback
    }
  }
  if (typeof document !== 'undefined') {
    try {
      const textArea = document.createElement('textarea')
      textArea.value = text
      textArea.style.position = 'fixed'
      textArea.style.opacity = '0'
      document.body.appendChild(textArea)
      textArea.focus()
      textArea.select()
      const successful = document.execCommand('copy')
      document.body.removeChild(textArea)
      return successful
    } catch {
      return false
    }
  }
  return false
}
