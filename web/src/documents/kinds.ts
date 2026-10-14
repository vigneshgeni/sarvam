import type { DocumentProfile, ExplainResponse, Part } from '../types'

export const DOCUMENT_KINDS = [
  'government_notice',
  'pension_notice',
  'tax_notice',
  'challan',
  'court_legal',
  'utility_bill',
  'telecom_bill',
  'invoice',
  'receipt',
  'insurance',
  'lab_report',
  'prescription',
  'discharge_summary',
  'hospital_bill',
  'investment',
  'bank_statement',
  'loan',
  'agreement',
  'form',
  'salary_slip',
  'school',
  'corporate',
  'other',
] as const

export type DocumentKind = (typeof DOCUMENT_KINDS)[number]

const KIND_SET = new Set<string>(DOCUMENT_KINDS)

export const KIND_TO_DOCUMENT_TYPE: Record<DocumentKind, string> = {
  government_notice: 'government_notice',
  pension_notice: 'government_notice',
  tax_notice: 'tax_receipt',
  challan: 'challan',
  court_legal: 'court_legal',
  utility_bill: 'utility_bill',
  telecom_bill: 'telecom_bill',
  invoice: 'receipt',
  receipt: 'receipt',
  insurance: 'insurance',
  lab_report: 'medical',
  prescription: 'medical',
  discharge_summary: 'medical',
  hospital_bill: 'medical',
  investment: 'bank',
  bank_statement: 'bank',
  loan: 'bank',
  agreement: 'agreement',
  form: 'other',
  salary_slip: 'bank',
  school: 'other',
  corporate: 'corporate',
  other: 'other',
}

type Cue = { kind: DocumentKind; words: string[] }

const CUES: Cue[] = [
  { kind: 'lab_report', words: ['lab report', 'reference range', 'pathologist', 'haemoglobin', 'hemoglobin', 'cbc'] },
  { kind: 'prescription', words: ['prescription', ' rx', 'tab.', 'cap.', 'bd', 'tds', '1-0-1'] },
  { kind: 'discharge_summary', words: ['discharge summary', 'advice on discharge', 'admission'] },
  { kind: 'hospital_bill', words: ['hospital bill', 'room charges', 'ip bill', 'op bill'] },
  { kind: 'pension_notice', words: ['pension', 'life certificate', 'jeevan pramaan', 'ppo'] },
  { kind: 'tax_notice', words: ['property tax', 'demand notice', 'assessment', 'rebate'] },
  { kind: 'challan', words: ['e-challan', 'echallan', 'offence', 'virtual court'] },
  { kind: 'court_legal', words: ['summons', 'plaintiff', 'defendant', 'hearing', 'case no'] },
  { kind: 'invoice', words: ['tax invoice', 'gstin', 'hsn', 'cgst', 'warranty'] },
  { kind: 'insurance', words: ['sum insured', 'premium', 'claim', 'policy'] },
  { kind: 'investment', words: ['mutual fund', 'folio', 'nav', 'sip', 'demat', 'ppf'] },
  { kind: 'loan', words: ['emi', 'sanction', 'interest rate', 'foreclosure', 'tenure'] },
  { kind: 'bank_statement', words: ['account statement', 'opening balance', 'closing balance'] },
  { kind: 'salary_slip', words: ['salary', 'net pay', 'earnings', 'deductions'] },
  { kind: 'agreement', words: ['rental', 'lease', 'lock-in', 'notice period', 'tenant', 'lessor'] },
  { kind: 'form', words: ['fill in', 'block letters', 'application form', 'account opening'] },
  { kind: 'utility_bill', words: ['electricity', 'units consumed', 'water bill', 'gas bill'] },
  { kind: 'telecom_bill', words: ['broadband', 'mobile bill', 'data plan'] },
  { kind: 'school', words: ['school', 'college', 'report card', 'tuition'] },
  { kind: 'receipt', words: ['received with thanks', 'payment receipt'] },
  { kind: 'government_notice', words: ['hereby informed', 'government of'] },
]

const TYPE_FALLBACK: Record<string, DocumentKind> = {
  utility_bill: 'utility_bill',
  telecom_bill: 'telecom_bill',
  tax_receipt: 'tax_notice',
  insurance: 'insurance',
  bank: 'bank_statement',
  government_notice: 'government_notice',
  court_legal: 'court_legal',
  challan: 'challan',
  medical: 'lab_report',
  lab_report: 'lab_report',
  receipt: 'receipt',
  agreement: 'agreement',
  corporate: 'corporate',
  school: 'school',
  form: 'form',
  prescription: 'prescription',
  investment: 'investment',
}

export interface KindSource {
  document_kind?: string | null
  document_type?: string | null
  doc_type?: string | null
  title?: string | null
  medicines?: unknown[] | null
  sections?: { values?: unknown[] }[] | null
  facts?: { text?: string }[] | null
  summary?: string[] | null
  profile?: DocumentProfile | null
}

function haystack(source: KindSource): string {
  const bits = [
    source.title || '',
    ...(source.summary || []),
    ...(source.facts || []).map((f) => f.text || ''),
  ]
  return bits.join(' \n ').toLowerCase()
}

export function inferKind(source: KindSource): DocumentKind {
  const given = (source.document_kind || '').toLowerCase()
  if (KIND_SET.has(given)) return given as DocumentKind
  if ((source.medicines?.length || 0) > 0 && !(source.sections && source.sections.length)) return 'prescription'
  if ((source.sections?.length || 0) > 0) return 'lab_report'
  const text = haystack(source)
  for (const cue of CUES) {
    if (cue.words.some((word) => text.includes(word))) return cue.kind
  }
  const type = (source.document_type || source.doc_type || '').toLowerCase()
  if ((source.medicines?.length || 0) > 0 && type === 'medical') return 'prescription'
  return TYPE_FALLBACK[type] || 'other'
}

export function partAsResult(part: Part, parent?: ExplainResponse): ExplainResponse {
  return {
    ...(parent || {}),
    doc_type: part.document_type || parent?.doc_type || 'other',
    document_type: part.document_type,
    document_kind: part.document_kind,
    profile: part.profile || null,
    title: part.title,
    language: parent?.language || 'en',
    report_title: part.title,
    report_date: part.date_iso || null,
    letter_date: part.date_iso || null,
    summary: part.summary_lines || [],
    actions: [],
    warnings: [],
    facts: [],
    conflicts: [],
    evidence_summary: parent?.evidence_summary || { matched: 0, check_original: 0, calculated: 0 },
    unreadable: false,
    unreadable_reason: null,
    protected_terms: parent?.protected_terms || [],
    glance: part.glance,
    sections: part.sections,
    medicines: part.medicines,
    parts: undefined,
  }
}
