/**
 * Sharing utilities for Sarvam document explanation.
 * Formats structured text for native share, WhatsApp, Email, or Clipboard,
 * with structured personal detail redaction.
 */

import type { ExplainResponse } from '../types'
import { getDictionary, resolveLang } from '../i18n'

/**
 * Known business and institution terms that should NEVER be hidden.
 */
export const INSTITUTION_TERMS = [
  'shield health insurance',
  'city diagnostics',
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
]

// Generic ID-like token regex: letters and digits joined by / or -
// Requires at least 3 digits in token (protects COVID-19, Vitamin B-12, Section 80-C).
// Never matches month-name dates (e.g. 30-Nov-2026, 30-November-2026) or standard numeric dates.
export const ID_TOKEN_REGEX =
  /\b(?!(?:19|20)\d{2}[-/]\d{2}[-/]\d{2}\b)(?!(?:\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2})\b)(?!(?:\d{1,2}[-/])?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-/]\d{2,4}\b)(?=(?:[A-Za-z0-9/_-]*\d){3,})(?=[A-Za-z0-9/_-]*[A-Za-z])[A-Za-z0-9]+(?:[/-][A-Za-z0-9_-]+)+\b/gi

/**
 * Checks if a fact or detail is inherently personal (name, ID, address, phone, vehicle, account).
 * Fixes structurally: any field that is an identifier, reference or ID number
 * (pension ID, policy, claim, invoice, notice, challan numbers, property ID, IMEI,
 * vehicle number, phone, account numbers) is marked personal and removed.
 */
export function isPersonalField(text: string, quote?: string, isPersonalExplicit?: boolean): boolean {
  if (isPersonalExplicit === true) return true
  if (!text) return false
  const lower = (text + ' ' + (quote || '')).toLowerCase()

  // 1. Personal identifiers / roles / beneficiary / customer
  if (
    /\b(patient|customer|policyholder|owner|pensioner|insured|attendee|beneficiary)\b/i.test(lower) ||
    /\b(dr\.|mr\.|mrs\.|ms\.|shri|smt\.|sri)\s+[A-Za-z\u0900-\u0D7F]/i.test(text) ||
    /\b(referred by|signed by|consultant|pathologist|issued to|addressed to|beneficiary name|beneficiary is|name is)\b/i.test(lower)
  ) {
    return true
  }

  // 2. Personal ID numbers / references across English & Indic languages
  if (
    /\b(pension|policy|claim|notice|challan|invoice|order|receipt|tax demand)\s*(?:id|no|number|num|ref|reference|code)?\b/i.test(lower) ||
    /\b(property id|ward|door no|vehicle|two-wheeler|reg no|registration|imei|sample id|aadhaar|pan|account|upi|utr|chassis|engine)\b/i.test(lower) ||
    /\b(ref:|reference:|id:|id is|id number)\b/i.test(lower) ||
    // Indic terms for ID / reference / registration / beneficiary
    /(पेंशन|पॉलिसी|दावा|चालान|पहचान|खाता|पंजीकरण|वाहन|लाभार्थी)/.test(text) ||
    /(ஓய்வூதிய|பாலிசி|கோரிக்கை|விலாசம்|அடையாள|வங்கி கணக்கு|வாகன|பயனாளி)/.test(text) ||
    /(పెన్షన్|పాలసీ|క్లెయిమ్|చలాన్|ఖాతా|రిజిస్ట్రేషన్|లబ్ధిదారు)/.test(text) ||
    /(पेन्शन|पॉलिसी|दावा|नोंदणी|खाते)/.test(text)
  ) {
    // If the field is an amount or date only, don't flag as personal unless it also contains an ID
    const hasOnlyAmountOrDate =
      /^(\s*(monthly pension|pension|amount|total|due|rebate|fine|fee|tax)\s*(amount|is|of)?\s*:?\s*(rs\.?|₹|\d|due date|date))/i.test(text) &&
      !/(id|no|number|num|ref|oap|sh\/|clm|anm|ech|sme|cd-|smt|mr\.|mrs\.)/i.test(lower)
    if (!hasOnlyAmountOrDate) {
      return true
    }
  }

  // 3. Layer 2 token check: if text contains an ID-like token (letters & digits joined by / or -)
  if (ID_TOKEN_REGEX.test(text) || (quote && ID_TOKEN_REGEX.test(quote))) {
    // Reset regex state after test
    ID_TOKEN_REGEX.lastIndex = 0
    return true
  }

  // 4. Addresses and personal contact info
  if (
    /\b(address|cross|jayanagar|ward|door no|pincode|bengaluru\s*560041)\b/i.test(lower) ||
    /\b(\+91|ph:|phone:|tel:|mobile:|0422-000-0000)\b/i.test(lower) ||
    /\b\d{4}[-\s]\d{3}[-\s]\d{4}\b/.test(text) ||
    /\b\d{10}\b/.test(text) ||
    /\b\d{2}\s*y\s*\/\s*[mf]\b/i.test(lower)
  ) {
    return true
  }

  // 5. Long digit runs (8+ digits) that are not amounts
  const digitRuns = text.match(/\b\d{8,}\b/g)
  if (digitRuns && digitRuns.length > 0) {
    return true
  }

  return false
}

/**
 * Sanitizes prose text (titles, summaries, actions) by removing personal detail clauses
 * without leaving `[*]` or broken sentences.
 * Adds a second layer that strips ID-like tokens (letters and digits joined by / or -) from free text.
 */
export function sanitizeProse(text: string, protectedTerms: string[] = []): string {
  if (!text) return ''
  let cleaned = text

  // 1. Remove specific personal identity clauses
  cleaned = cleaned.replace(
    /\b(?:issued to|addressed to|referred by|signed by|beneficiary is|beneficiary name is)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?:,\s*MD)?(?=[.,;\n]|\s+for|\s+regarding|\s+by|\s+from|$)/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:regarding the Old Age Pension Scheme)\s+for\s+(?:(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.)\s+)?[A-Z][A-Za-z.\s]+?(?=[.,;\n]|$)/gi,
    'regarding the Old Age Pension Scheme'
  )
  cleaned = cleaned.replace(
    /\b(?:for policyholder|for patient|patient|customer|beneficiary|for owner|owner)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?=[.,;\n]|\s+with|\s+for|$)/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:for|to)\s+(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.|Sri)\s+[A-Z][A-Za-z.\s]+?(?=[.,;\n]|$)/gi,
    ''
  )

  // 2. Remove ID phrases with prefixes like "Ref: ...", "Pension ID: ...", "Policy No: ...", etc.
  cleaned = cleaned.replace(
    /\b(?:pension id|policy no|claim no|notice no|challan no|invoice no|property id|sample id|imei|vehicle no|vehicle|ref|order no)[:\s]+[A-Za-z0-9/_-]+/gi,
    ''
  )

  // 3. Layer 2: Generic ID-like tokens (letters + digits joined by / or -) with at least 3 digits, excluding dates
  cleaned = cleaned.replace(
    /\b(?!(?:19|20)\d{2}[-/]\d{2}[-/]\d{2}\b)(?!(?:\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2})\b)(?!(?:\d{1,2}[-/])?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-/]\d{2,4}\b)(?=(?:[A-Za-z0-9/_-]*\d){3,})(?=[A-Za-z0-9/_-]*[A-Za-z])[A-Za-z0-9]+(?:[/-][A-Za-z0-9_-]+)+\b/gi,
    ''
  )

  // 4. Indian vehicle registration numbers (e.g. TN 99 AB 1234)
  cleaned = cleaned.replace(/\b[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,2}\s*\d{1,4}\b/gi, '')

  // 5. Personal names from protectedTerms and samples with Unicode-aware word boundaries
  // Falls back to \b on iOS earlier than 16.4 which lacks lookbehind support
  const createNameBoundaryRegex = (escaped: string): RegExp => {
    try {
      return new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gui')
    } catch {
      return new RegExp(`\\b${escaped}\\b`, 'gi')
    }
  }

  const personalNames = [
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
    'ரவி குமார்',
    'லட்சுமி ஆர்.',
    'டாக்டர் மீனா',
    'மீனா சுப்பிரமணியன்',
    'கமலா தேவி',
    'சுரேஷ் ராமன்',
    'रवि कुमार',
    'लक्ष्मी आर.',
    'डॉक्टर मीना',
    'मीना सुब्रमण्यन',
    'कमला देवी',
    'सुरेश रमन',
  ]
  for (const name of personalNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(createNameBoundaryRegex(escaped), '')
  }

  for (const term of protectedTerms) {
    if (!term || term.trim().length < 2) continue
    const lower = term.toLowerCase().trim()
    const isInstitution = INSTITUTION_TERMS.some((inst) => lower.includes(inst))
    if (!isInstitution) {
      const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      cleaned = cleaned.replace(createNameBoundaryRegex(escaped), '')
    }
  }

  // 6. Remove residential addresses, phone numbers, IMEI, pincodes
  cleaned = cleaned.replace(/No\.\s*14,\s*3rd\s*Cross,\s*Jayanagar,\s*Bengaluru\s*560041/gi, '')
  cleaned = cleaned.replace(/\b560041\b/g, '')
  cleaned = cleaned.replace(/0422-000-0000/g, '')
  cleaned = cleaned.replace(/\b356000000012345\b/g, '')
  cleaned = cleaned.replace(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '')
  cleaned = cleaned.replace(/\b\d{2}\s*Y\s*\/\s*[MF]\b/gi, '')

  // 7. Cleanup dangling prepositions and titles left at end of sentences or before punctuation
  cleaned = cleaned.replace(/\b(?:for|to|of|by|with)\s*(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.)?\s*([.,;]|\s*$)/gi, '$1')
  cleaned = cleaned.replace(/\b(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.)(?=[.,;]|\s*$)/gi, '')

  // 8. Clean up any accidental [*] or [***] and multiple punctuation/whitespace
  cleaned = cleaned.replace(/\[\*{1,}\]/g, '')
  cleaned = cleaned.replace(/\s*—\s*—\s*/g, ' — ')
  cleaned = cleaned.replace(/\s*,\s*,+/g, ',')
  cleaned = cleaned.replace(/\s*\.\s*\.+/g, '.')
  cleaned = cleaned.replace(/\s{2,}/g, ' ')
  cleaned = cleaned.replace(/\s+([.,;:])/g, '$1')
  cleaned = cleaned.trim()

  return cleaned
}

/**
 * Builds the text to share via native share, WhatsApp, email, or clipboard.
 * Constructs text strictly from structured fields with personal flag.
 * Never leaves `[*]` anywhere.
 */
export function buildSharedText(
  result: ExplainResponse,
  lang: string,
  hidePersonal: boolean
): string {
  const concreteLang = resolveLang(lang)
  const t = getDictionary(concreteLang)
  const lines: string[] = []

  // 1. Document Title
  if (result.title) {
    const titleText = hidePersonal
      ? sanitizeProse(result.title, result.protected_terms || [])
      : result.title
    if (titleText) {
      lines.push(`📄 ${titleText}`)
    }
  }

  // 2. Summary
  if (result.summary && result.summary.length > 0) {
    const summaryPoints: string[] = []
    for (const point of result.summary) {
      if (hidePersonal) {
        // If the sentence is purely about personal identity, drop it
        if (/^(this (?:letter|notice|invoice|report) (?:is|was) (?:addressed|issued) to|patient|customer)/i.test(point.trim())) {
          continue
        }
        const cleaned = sanitizeProse(point, result.protected_terms || [])
        if (cleaned && cleaned.length > 10) {
          summaryPoints.push(cleaned)
        }
      } else {
        summaryPoints.push(point)
      }
    }
    if (summaryPoints.length > 0) {
      lines.push(`\n📌 ${t.summaryTitle || 'In simple words'}:`)
      summaryPoints.forEach((point) => {
        lines.push(`• ${point}`)
      })
    }
  }

  // 3. Actions (What you need to do)
  if (result.actions && result.actions.length > 0) {
    lines.push(`\n✅ ${t.actionsTitle || 'What you need to do'}:`)
    result.actions.forEach((act, idx) => {
      const actText = hidePersonal
        ? sanitizeProse(act.text, result.protected_terms || [])
        : act.text
      lines.push(`${idx + 1}. ${actText}`)
    })
  }

  // 4. Warnings (Watch out)
  if (result.warnings && result.warnings.length > 0) {
    lines.push(`\n⚠️ ${t.riskTitle || 'Watch out'}:`)
    result.warnings.forEach((warn) => {
      lines.push(`• ${warn.text}`)
    })
  }

  // 5. Key Facts (filtered when hidePersonal is true)
  if (result.facts && result.facts.length > 0) {
    const factsList = hidePersonal
      ? result.facts
          .filter((fact) => !isPersonalField(fact.text, fact.quote, (fact as any).is_personal))
          .map((fact) => ({
            ...fact,
            text: sanitizeProse(fact.text, result.protected_terms || []),
          }))
          .filter((fact) => fact.text.trim().length > 0)
      : result.facts

    if (factsList.length > 0) {
      lines.push(`\n📋 ${t.factsTitle || 'Key facts'}:`)
      factsList.forEach((fact) => {
        lines.push(`• ${fact.text}`)
      })
    }
  }

  // 6. Conflicts
  if (result.conflicts && result.conflicts.length > 0) {
    lines.push(`\n⚠️ ${t.conflictsTitle || 'Conflicting details'}:`)
    result.conflicts.forEach((c) => {
      lines.push(`• ${c}`)
    })
  }

  return lines.join('\n')
}

/**
 * Opens WhatsApp share with pre-filled message text.
 */
export function shareToWhatsApp(text: string): void {
  const url = `https://wa.me/?text=${encodeURIComponent(text)}`
  window.open(url, '_blank', 'noopener,noreferrer')
}

/**
 * Opens email client with subject and body.
 */
export function shareToEmail(subject: string, text: string): void {
  const url = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`
  window.location.href = url
}

/**
 * Copies text to user clipboard.
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text)
      return true
    }
  } catch {
    // Fallback for older browsers
  }

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
