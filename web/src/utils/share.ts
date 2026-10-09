/**
 * Sharing utilities for Sarvam document explanation.
 * Formats structured text for native share, WhatsApp, Email, or Clipboard,
 * with personal detail redaction based on protected_terms and common PII patterns.
 */

import type { ExplainResponse } from '../types'
import { getDictionary } from '../i18n'

/**
 * Redacts personal identifiers (names, IDs, phone numbers, addresses from protected_terms)
 * from the input text string.
 */
export function redactPersonalDetails(text: string, protectedTerms: string[] = []): string {
  let redacted = text

  // 1. Redact terms provided by API protected_terms
  for (const term of protectedTerms) {
    if (!term || term.trim().length < 2) continue
    // Escape regex special characters
    const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const regex = new RegExp(`\\b${escaped}\\b`, 'gi')
    redacted = redacted.replace(regex, '[***]')
  }

  // 2. Common Indian PII patterns (Phone, Aadhaar, PAN)
  // Phone numbers (10 digits starting with 6-9, optional +91)
  redacted = redacted.replace(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '[***]')
  // PAN format: 5 letters, 4 digits, 1 letter
  redacted = redacted.replace(/\b[A-Z]{5}\d{4}[A-Z]\b/g, '[***]')
  // 12-digit IDs (like Aadhaar)
  redacted = redacted.replace(/\b\d{4}[\s-]\d{4}[\s-]\d{4}\b/g, '[***]')

  return redacted
}

/**
 * Builds the text to share via native share, WhatsApp, email, or clipboard.
 */
export function buildSharedText(
  result: ExplainResponse,
  lang: string,
  hidePersonal: boolean
): string {
  const t = getDictionary(lang)
  const lines: string[] = []

  // Document Title
  if (result.title) {
    lines.push(`📄 ${result.title}`)
  }

  // Summary
  if (result.summary && result.summary.length > 0) {
    lines.push(`\n📌 ${t.summaryTitle || 'In simple words'}:`)
    result.summary.forEach((point) => {
      lines.push(`• ${point}`)
    })
  }

  // Actions
  if (result.actions && result.actions.length > 0) {
    lines.push(`\n✅ ${t.actionsTitle || 'What you need to do'}:`)
    result.actions.forEach((act, idx) => {
      lines.push(`${idx + 1}. ${act.text}`)
    })
  }

  // Warnings
  if (result.warnings && result.warnings.length > 0) {
    lines.push(`\n⚠️ ${t.riskTitle || 'Watch out'}:`)
    result.warnings.forEach((warn) => {
      lines.push(`• ${warn.text}`)
    })
  }

  // Key Facts
  if (result.facts && result.facts.length > 0) {
    lines.push(`\n📋 ${t.factsTitle || 'Key facts'}:`)
    result.facts.forEach((fact) => {
      lines.push(`• ${fact.text}`)
    })
  }

  // Conflicts
  if (result.conflicts && result.conflicts.length > 0) {
    lines.push(`\n⚠️ ${t.conflictsTitle || 'Conflicting details'}:`)
    result.conflicts.forEach((c) => {
      lines.push(`• ${c}`)
    })
  }

  let finalContent = lines.join('\n')

  if (hidePersonal) {
    finalContent = redactPersonalDetails(finalContent, result.protected_terms || [])
  }

  return finalContent
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
