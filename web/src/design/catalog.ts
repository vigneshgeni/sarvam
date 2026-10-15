import type { ExplainResponse } from '../types'

export type DocIconName =
  | 'flask'
  | 'pill'
  | 'shield'
  | 'stamp'
  | 'rupee'
  | 'bank'
  | 'trend'
  | 'bolt'
  | 'wifi'
  | 'car'
  | 'house'
  | 'gavel'
  | 'clip'
  | 'phone'
  | 'receipt'
  | 'pen'
  | 'pages'
  | 'key'
  | 'cap'

export interface DocVisual {
  icon: DocIconName
  bg: string
  ink: string
}

const VISUAL: Record<string, DocVisual> = {
  medical: { icon: 'flask', bg: '#034F46', ink: '#F4F5F2' },
  lab_report: { icon: 'flask', bg: '#034F46', ink: '#F4F5F2' },
  prescription: { icon: 'pill', bg: '#CFE5E0', ink: '#1A1A1A' },
  insurance: { icon: 'shield', bg: '#E9B44C', ink: '#1A1A1A' },
  government_notice: { icon: 'stamp', bg: '#CFE5E0', ink: '#1A1A1A' },
  pension: { icon: 'rupee', bg: '#D9603B', ink: '#1A1A1A' },
  bank: { icon: 'bank', bg: '#F8D9CB', ink: '#1A1A1A' },
  receipt: { icon: 'bank', bg: '#F8D9CB', ink: '#1A1A1A' },
  investment: { icon: 'trend', bg: '#034F46', ink: '#F4F5F2' },
  utility_bill: { icon: 'bolt', bg: '#E9B44C', ink: '#1A1A1A' },
  telecom_bill: { icon: 'wifi', bg: 'var(--sv-fill)', ink: 'var(--sv-on-dark)' },
  challan: { icon: 'car', bg: '#D9603B', ink: '#FFFFFF' },
  tax_receipt: { icon: 'house', bg: '#CFE5E0', ink: '#1A1A1A' },
  court_legal: { icon: 'gavel', bg: 'var(--sv-fill)', ink: 'var(--sv-on-dark)' },
  form: { icon: 'clip', bg: '#E9B44C', ink: '#1A1A1A' },
  agreement: { icon: 'pen', bg: 'var(--sv-bg)', ink: 'var(--sv-ink)' },
  other: { icon: 'pen', bg: 'var(--sv-bg)', ink: 'var(--sv-ink)' },
  multi: { icon: 'pages', bg: '#E2E5E0', ink: '#1A1A1A' },
}

export function visualForDocument(
  docType?: string | null,
  opts?: { medicines?: boolean; title?: string; multi?: boolean; billPart?: boolean }
): DocVisual {
  if (opts?.multi) return VISUAL.multi
  if (opts?.billPart) return { icon: 'receipt', bg: '#E9B44C', ink: '#1A1A1A' }
  const aliases: Record<string, string> = {
    loan: 'bank',
    salary_slip: 'bank',
    bank_statement: 'bank',
    hospital_bill: 'receipt',
    discharge_summary: 'medical',
    tax_notice: 'tax_receipt',
    pension_notice: 'pension',
    invoice: 'receipt',
  }
  const type = aliases[(docType || 'other').toLowerCase()] || (docType || 'other').toLowerCase()
  if (opts?.medicines || type === 'prescription') return VISUAL.prescription
  if (type === 'government_notice' && /pension/i.test(opts?.title || '')) return VISUAL.pension
  return VISUAL[type] || VISUAL.other
}

export type FilterGroup = 'health' | 'money' | 'bills' | 'notices' | 'legal' | 'forms'

export function filterGroup(docType?: string | null, title?: string): FilterGroup | null {
  const type = (docType || '').toLowerCase()
  if (type === 'medical' || type === 'lab_report' || type === 'prescription') return 'health'
  if (['insurance', 'bank', 'receipt', 'investment'].includes(type) || /pension/i.test(title || ''))
    return 'money'
  if (['utility_bill', 'telecom_bill', 'tax_receipt', 'challan'].includes(type)) return 'bills'
  if (type === 'government_notice') return 'notices'
  if (type === 'court_legal' || type === 'agreement') return 'legal'
  if (type === 'form') return 'forms'
  return null
}

export interface HomeSample {
  file: string
  titleKey: string
  title: string
  subKey: string
  sub: string
  kind: 'PDF' | 'PHOTO'
  icon: DocIconName
  bg: string
  ink: string
}

export const HOME_SAMPLES: HomeSample[] = [
  { file: 'sample-lab-report.pdf', titleKey: 'sampleLabName', title: 'Lab report', subKey: 'sampleLabOrg', sub: 'City Diagnostics', kind: 'PDF', icon: 'flask', bg: '#034F46', ink: '#F4F5F2' },
  { file: 'sample-insurance-letter.pdf', titleKey: 'sampleInsuranceName', title: 'Insurance letter', subKey: 'sampleInsuranceOrg', sub: 'Health insurer', kind: 'PDF', icon: 'shield', bg: '#E9B44C', ink: '#1A1A1A' },
  { file: 'sample-pension-notice.jpg', titleKey: 'samplePensionName', title: 'Pension notice', subKey: 'samplePensionOrg', sub: 'Social Welfare Dept.', kind: 'PHOTO', icon: 'rupee', bg: '#D9603B', ink: '#1A1A1A' },
  { file: 'sample-invoice-warranty.pdf', titleKey: 'sampleInvoiceName', title: 'Phone invoice & warranty', subKey: 'sampleInvoiceOrg', sub: 'Retail store', kind: 'PDF', icon: 'receipt', bg: '#E9B44C', ink: '#1A1A1A' },
  { file: 'sample-property-tax-notice.pdf', titleKey: 'sampleTaxName', title: 'Property tax notice', subKey: 'sampleTaxOrg', sub: 'City municipality', kind: 'PDF', icon: 'house', bg: '#CFE5E0', ink: '#1A1A1A' },
  { file: 'sample-echallan.pdf', titleKey: 'sampleChallanName', title: 'Traffic e-challan', subKey: 'sampleChallanOrg', sub: 'Traffic Police', kind: 'PDF', icon: 'car', bg: '#D9603B', ink: '#FFFFFF' },
  { file: 'sample-prescription.jpg', titleKey: 'sampleRxName', title: 'Prescription', subKey: 'sampleRxOrg', sub: 'Neighbourhood clinic', kind: 'PHOTO', icon: 'pill', bg: '#CFE5E0', ink: '#1A1A1A' },
  { file: 'sample-mutual-fund-statement.pdf', titleKey: 'sampleFundName', title: 'Mutual fund statement', subKey: 'sampleFundOrg', sub: 'Fund house', kind: 'PDF', icon: 'trend', bg: '#034F46', ink: '#F4F5F2' },
  { file: 'sample-court-summons.pdf', titleKey: 'sampleCourtName', title: 'Court summons', subKey: 'sampleCourtOrg', sub: 'City Civil Court', kind: 'PDF', icon: 'gavel', bg: 'var(--sv-fill)', ink: 'var(--sv-on-dark)' },
  { file: 'sample-bank-deposit-slip.jpg', titleKey: 'sampleSlipName', title: 'Bank deposit slip (form)', subKey: 'sampleSlipOrg', sub: 'Your bank', kind: 'PHOTO', icon: 'clip', bg: '#E9B44C', ink: '#1A1A1A' },
]

export const HEALTH_SAMPLE = 'sample-health-checkup.pdf'

export type ReadingLetter = 'A' | 'B' | 'C' | 'D'

const READING_ORDER: ReadingLetter[] = ['A', 'B', 'C', 'D']

function storedReading(): string | null {
  try {
    return localStorage.getItem('sarvam.readingVariant')
  } catch {
    return null
  }
}

function rememberReading(pick: ReadingLetter): ReadingLetter {
  try {
    localStorage.setItem('sarvam.readingVariant', pick)
  } catch {
    /* ignore */
  }
  return pick
}

function forcedReading(explicit?: string | null): ReadingLetter | null {
  const fromQuery =
    explicit ??
    (typeof window !== 'undefined' && import.meta.env?.DEV
      ? new URLSearchParams(window.location.search).get('reading')
      : null)
  const letter = (fromQuery || '').toUpperCase()
  return letter === 'A' || letter === 'B' || letter === 'C' || letter === 'D' ? letter : null
}

export function pickReadingVariant(opts: {
  photo: boolean
  fileCount: number
  language: string
  force?: string | null
}): ReadingLetter {
  const forced = forcedReading(opts.force)
  if (forced) return rememberReading(forced)
  let pick: ReadingLetter
  if (opts.photo || opts.fileCount > 1) pick = 'B'
  else if (opts.language && opts.language !== 'en' && opts.language !== 'auto') pick = 'C'
  else pick = storedReading() === 'A' ? 'D' : 'A'
  if (storedReading() === pick) {
    pick = READING_ORDER[(READING_ORDER.indexOf(pick) + 1) % READING_ORDER.length]
  }
  return rememberReading(pick)
}

function amountNumber(value: string): number | null {
  const n = Number(value.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) && n > 0 ? n : null
}

/** A printed amount. Reference numbers and lab readings are not amounts. */
export function isMoneyValue(kind: string, value: string): boolean {
  if (kind === 'date') return false
  const hasCurrency = /[₹]|Rs\.?|INR/i.test(value)
  if (kind !== 'amount' && !hasCurrency) return false
  const withoutCurrency = value.replace(/Rs\.?|INR/gi, '')
  if (/[A-Za-z]/.test(withoutCurrency)) return false
  if ((value.match(/,/g) || []).length > 2) return false
  return amountNumber(value) != null
}

export type GlanceKind = 'A' | 'B' | 'C' | 'D' | 'Dplus' | 'F' | 'E' | 'multi'

const SPLIT_TYPES = new Set(['insurance', 'utility_bill', 'telecom_bill', 'tax_receipt', 'receipt'])

function dueLabel(label: string): boolean {
  return /total due|amount due|total payable|to pay|net payable|grand total|amount payable|premium|emi|fine|balance/i.test(label)
}

function rentalLabel(label: string): boolean {
  return /rental|monthly rent|plan rent/i.test(label)
}

function moneyText(value?: string | null): string {
  if (!value || !isMoneyValue('amount', value)) return ''
  return value
}

/** The figure and date for the TO PAY glance. Empty when the page did not print one. */
export function amountDue(result: ExplainResponse): { value: string; due: string } {
  const profile = result.profile
  const kvs = result.glance?.key_values || []
  const labeled = kvs.find((item) => dueLabel(item.label) && !rentalLabel(item.label) && isMoneyValue(item.kind, item.value))
  const quoted = profile?.amounts?.find((item) => item.value && dueLabel(item.label || '') && isMoneyValue('amount', item.value))
  const value =
    labeled?.value ||
    quoted?.value ||
    moneyText(profile?.emi_amount) ||
    moneyText(profile?.premium) ||
    moneyText(profile?.paid_or_due) ||
    moneyText(profile?.total) ||
    kvs.find((item) => !rentalLabel(item.label) && isMoneyValue(item.kind, item.value))?.value ||
    ''
  const actionDue = (result.actions || []).find((action) => action.due_date && action.date_status !== 'passed')?.due_date
  const due = profile?.due_date || profile?.next_emi_date || actionDue || ''
  return { value, due }
}

export function pickGlance(result: ExplainResponse): GlanceKind {
  if (result.parts && result.parts.length > 1) return 'multi'
  const sections = result.sections || []
  const sectionValues = sections.reduce((n, s) => n + (s.values?.length || 0), 0)
  if (sectionValues > 0) return 'Dplus'

  const kvs = result.glance?.key_values || []
  const amounts = kvs.filter((k) => isMoneyValue(k.kind, k.value))
  const doc = String(result.doc_type || result.document_type || '')
  if (amounts.length === 3 && SPLIT_TYPES.has(doc)) {
    const nums = amounts.map((a) => amountNumber(a.value)).filter((n): n is number => n != null)
    if (nums.length === 3) {
      const sorted = [...nums].sort((a, b) => b - a)
      if (Math.abs(sorted[0] - (sorted[1] + sorted[2])) < 1.5) return 'A'
    }
  }
  if (amounts.length === 1) return 'B'
  const upcoming = (result.actions || []).some(
    (a) => a.due_date && a.date_status !== 'passed' && a.date_status !== 'none'
  )
  if (amounts.length === 0 && upcoming) return 'C'
  const textish = kvs.filter((k) => k.kind === 'text' || k.kind === 'date')
  if (textish.length > 0 && textish.length <= 4 && amounts.length === 0) return 'D'
  if (amounts.length >= 2 && amounts.length <= 3) return 'F'
  return 'E'
}
