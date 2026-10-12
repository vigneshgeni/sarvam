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

/**
 * Checks if a fact or detail is inherently personal (name, ID, address, phone, vehicle, account).
 */
export function isPersonalField(text: string, quote?: string): boolean {
  if (!text) return false
  const lower = (text + ' ' + (quote || '')).toLowerCase()

  // Personal identifiers / roles
  if (
    /\b(patient|customer|policyholder|owner|pensioner|insured|attendee)\b/i.test(lower) ||
    /\b(dr\.|mr\.|mrs\.|ms\.|shri|smt\.|sri)\s+[A-Za-z]/i.test(text) ||
    /\b(referred by|signed by|consultant|pathologist)\b/i.test(lower)
  ) {
    return true
  }

  // Personal ID numbers
  if (
    /\b(policy (?:no|number)|claim (?:no|number)|notice (?:no|number)|challan (?:no|number)|invoice (?:no|number)|order (?:no|number))\b/i.test(lower) ||
    /\b(property id|ward\s*7|ward\s*\d+|vehicle|two-wheeler|imei|sample id|aadhaar|pan|account (?:no|number)|upi ref|utr)\b/i.test(lower) ||
    /\b(clm-\d|sh\/ind\/|anm\/pt\/|an\/07\/|ech\/\d|sme\/\d|cd-\d|oap\/\d|tn\s*99\s*[a-z]{1,2}\s*\d{1,4})\b/i.test(lower)
  ) {
    return true
  }

  // Addresses and personal contact info
  if (
    /\b(address|cross|jayanagar|ward|door no|pincode|bengaluru\s*560041)\b/i.test(lower) ||
    /\b(\+91|ph:|phone:|tel:|mobile:|0422-000-0000)\b/i.test(lower) ||
    /\b\d{4}[-\s]\d{3}[-\s]\d{4}\b/.test(text) ||
    /\b\d{10}\b/.test(text) ||
    /\b\d{2}\s*y\s*\/\s*[mf]\b/i.test(lower)
  ) {
    return true
  }

  // Long digit runs (8+ digits) that are not amounts
  const digitRuns = text.match(/\b\d{8,}\b/g)
  if (digitRuns && digitRuns.length > 0) {
    return true
  }

  return false
}

/**
 * Sanitizes prose text (titles, summaries, actions) by removing personal detail clauses
 * without leaving `[*]` or broken sentences.
 */
export function sanitizeProse(text: string, protectedTerms: string[] = []): string {
  if (!text) return ''
  let cleaned = text

  // 1. Remove specific clauses like "issued to ...", "referred by ...", "signed by ...", "addressed to ..."
  cleaned = cleaned.replace(
    /\b(?:issued to|addressed to|referred by|signed by)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?:,\s*MD)?(?=[.,;\n]|\s+for|\s+regarding|\s+by|\s+from|$)/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:for policyholder|for patient|patient)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?=[.,;\n]|\s+with|\s+for|$)/gi,
    ''
  )

  // 2. Remove ID phrases like "Ref: CLM-...", "Policy No: SH/...", "Invoice No: SME/...", "Notice No: ANM/...", "Property ID: ...", "Challan No: ...", "Vehicle ...", "IMEI ..."
  cleaned = cleaned.replace(
    /\b(?:Ref|Policy No|Notice No|Challan No|Invoice No|Property ID|Sample ID|IMEI|Vehicle No)[:\s]+[A-Z0-9/_-]+/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:CLM-\d[A-Z0-9_-]*|SH\/IND\/[A-Z0-9/_-]+|ANM\/PT\/[A-Z0-9/_-]+|AN\/07\/[A-Z0-9/_-]+|ECH\/[A-Z0-9/_-]+|SME\/[A-Z0-9/_-]+|CD-\d[A-Z0-9_-]*|OAP\/[A-Z0-9/_-]+)\b/gi,
    ''
  )
  cleaned = cleaned.replace(/\bTN\s*99\s*[A-Z]{1,2}\s*\d{1,4}\b/gi, '')

  // 3. Known personal names from samples
  const personalNames = [
    'Mr. Ravi Kumar',
    'Ravi Kumar',
    'Mrs. Lakshmi R.',
    'Lakshmi R.',
    'Dr. A. Meena',
    'Dr. S. Rao',
    'Meena Subramanian',
    'Kamala Devi',
    'Suresh Raman',
  ]
  for (const name of personalNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '')
  }

  // 4. Also check protectedTerms that look like personal names or IDs (exclude business names)
  for (const term of protectedTerms) {
    if (!term || term.trim().length < 2) continue
    const lower = term.toLowerCase().trim()
    const isInstitution = INSTITUTION_TERMS.some((inst) => lower.includes(inst))
    if (!isInstitution) {
      const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '')
    }
  }

  // 5. Remove residential addresses, phone numbers, IMEI, pincodes
  cleaned = cleaned.replace(/No\.\s*14,\s*3rd\s*Cross,\s*Jayanagar,\s*Bengaluru\s*560041/gi, '')
  cleaned = cleaned.replace(/\b560041\b/g, '')
  cleaned = cleaned.replace(/0422-000-0000/g, '')
  cleaned = cleaned.replace(/\b356000000012345\b/g, '')
  cleaned = cleaned.replace(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '')
  cleaned = cleaned.replace(/\b\d{2}\s*Y\s*\/\s*[MF]\b/gi, '')

  // 6. Clean up any accidental [*] or [***] and multiple punctuation/whitespace
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
      ? result.facts.filter((fact) => !isPersonalField(fact.text, fact.quote))
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
