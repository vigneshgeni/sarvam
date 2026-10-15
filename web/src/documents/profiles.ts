import type { DocIconName, DocVisual, GlanceKind } from '../design/catalog'
import { amountDue, isMoneyValue, pickGlance, visualForDocument } from '../design/catalog'
import type { ExplainResponse } from '../types'
import { inferKind, type DocumentKind, type KindSource } from './kinds'

export type BlockId =
  | 'directions'
  | 'waysToPay'
  | 'howToContest'
  | 'consequence'
  | 'items'
  | 'warranty'
  | 'sections'
  | 'notADiagnosis'
  | 'medicines'
  | 'diagnosis'
  | 'advice'
  | 'loanTerms'
  | 'nextEmi'
  | 'keyTerms'
  | 'timeline'
  | 'formSteps'
  | 'simpleWords'
  | 'actions'
  | 'watchOut'
  | 'places'
  | 'facts'

export interface DocumentProfileView {
  kind: DocumentKind
  glanceLayout: GlanceKind
  blocks: BlockId[]
  visual: DocVisual
}

const VISUAL_BY_KIND: Partial<Record<DocumentKind, { icon: DocIconName; bg: string; ink: string }>> = {
  government_notice: { icon: 'stamp', bg: '#CFE5E0', ink: '#1A1A1A' },
  pension_notice: { icon: 'rupee', bg: '#D9603B', ink: '#1A1A1A' },
  tax_notice: { icon: 'house', bg: '#CFE5E0', ink: '#1A1A1A' },
  challan: { icon: 'car', bg: '#D9603B', ink: '#FFFFFF' },
  court_legal: { icon: 'gavel', bg: 'var(--sv-fill)', ink: 'var(--sv-on-dark)' },
  utility_bill: { icon: 'bolt', bg: '#E9B44C', ink: '#1A1A1A' },
  telecom_bill: { icon: 'wifi', bg: 'var(--sv-fill)', ink: 'var(--sv-on-dark)' },
  invoice: { icon: 'receipt', bg: '#E9B44C', ink: '#1A1A1A' },
  receipt: { icon: 'bank', bg: '#F8D9CB', ink: '#1A1A1A' },
  insurance: { icon: 'shield', bg: '#E9B44C', ink: '#1A1A1A' },
  lab_report: { icon: 'flask', bg: '#034F46', ink: '#F4F5F2' },
  prescription: { icon: 'pill', bg: '#CFE5E0', ink: '#1A1A1A' },
  discharge_summary: { icon: 'pill', bg: '#CFE5E0', ink: '#1A1A1A' },
  hospital_bill: { icon: 'receipt', bg: '#E9B44C', ink: '#1A1A1A' },
  investment: { icon: 'trend', bg: '#CFE5E0', ink: '#1A1A1A' },
  bank_statement: { icon: 'bank', bg: '#F8D9CB', ink: '#1A1A1A' },
  salary_slip: { icon: 'bank', bg: '#F8D9CB', ink: '#1A1A1A' },
  loan: { icon: 'key', bg: '#E9B44C', ink: '#1A1A1A' },
  agreement: { icon: 'pen', bg: '#F4F5F2', ink: '#1A1A1A' },
  form: { icon: 'clip', bg: '#E9B44C', ink: '#1A1A1A' },
  school: { icon: 'cap', bg: '#CFE5E0', ink: '#1A1A1A' },
  corporate: { icon: 'pen', bg: '#F4F5F2', ink: '#1A1A1A' },
  other: { icon: 'pen', bg: '#F4F5F2', ink: '#1A1A1A' },
}

function sectionCount(source: KindSource): number {
  return (source.sections || []).reduce((n, s) => n + (s.values?.length || 0), 0)
}

export function blockWhen(id: BlockId, source: ExplainResponse): boolean {
  const profile = source.profile
  switch (id) {
    case 'directions':
      return (profile?.directions?.length || 0) > 0 && !(source.actions || []).some((a) => a.due_date)
    case 'waysToPay':
    case 'howToContest':
      return (profile?.how_to_pay?.length || 0) > 0
    case 'consequence':
      return !!profile?.consequence
    case 'items':
      return (profile?.line_items?.length || 0) > 0
    case 'warranty':
      return !!profile?.warranty_until
    case 'sections':
      return sectionCount(source) > 0
    case 'notADiagnosis':
      return inferKind(source) === 'lab_report' || sectionCount(source) > 0
    case 'medicines':
      return (source.medicines?.length || 0) > 0
    case 'diagnosis':
      return !!profile?.diagnosis_as_written
    case 'advice':
      return (profile?.advice_lines?.length || 0) > 0
    case 'loanTerms':
      return !!(profile?.tenure || profile?.loan_account || profile?.outstanding || profile?.interest_rate || (profile?.charges?.length || 0) > 0)
    case 'nextEmi':
      return !!(profile?.next_emi_date || profile?.emi_amount)
    case 'keyTerms':
      return !!(profile?.rent_or_price || profile?.deposit || profile?.lock_in || profile?.notice_period || profile?.term)
    case 'timeline':
      return !!(profile?.start_date || profile?.end_date)
    case 'formSteps':
      return (profile?.form_fields?.length || 0) > 0
    case 'simpleWords':
      return (source.summary?.length || 0) > 0
    case 'actions':
      return (source.actions?.length || 0) > 0
    case 'watchOut':
      return (source.warnings?.length || 0) > 0 || (profile?.deduction_reasons?.length || 0) > 0
    case 'places':
      return (source.places?.length || 0) > 0 || (source.contacts?.length || 0) > 0
    case 'facts':
      return (source.facts?.length || 0) > 0
    default:
      return false
  }
}

const SPECIFIC: Record<DocumentKind, BlockId[]> = {
  government_notice: ['directions'],
  pension_notice: [],
  tax_notice: ['waysToPay'],
  challan: ['howToContest'],
  court_legal: ['consequence'],
  utility_bill: [],
  telecom_bill: [],
  invoice: ['items', 'warranty'],
  receipt: [],
  insurance: [],
  lab_report: ['sections', 'notADiagnosis'],
  prescription: ['medicines'],
  discharge_summary: ['diagnosis', 'medicines', 'advice'],
  hospital_bill: ['items'],
  investment: [],
  bank_statement: [],
  salary_slip: [],
  loan: ['nextEmi', 'loanTerms'],
  agreement: ['keyTerms', 'timeline'],
  form: ['formSteps'],
  school: [],
  corporate: [],
  other: [],
}

const COMMON: BlockId[] = ['simpleWords', 'actions', 'watchOut', 'places', 'facts']

function layoutFor(kind: DocumentKind, source: ExplainResponse): GlanceKind {
  if ((source.parts?.length || 0) > 1) return 'multi'
  const fallback = pickGlance(source)
  const values = sectionCount(source)
  switch (kind) {
    case 'lab_report':
      return values > 4 ? 'Dplus' : 'D'
    case 'prescription':
    case 'form':
    case 'agreement':
    case 'corporate':
    case 'other':
      return 'E'
    case 'discharge_summary':
      return source.profile?.follow_up ? 'C' : 'E'
    case 'hospital_bill':
    case 'investment':
    case 'salary_slip':
    case 'bank_statement':
      return 'F'
    case 'loan':
      return source.profile?.emi_amount || source.profile?.next_emi_date ? 'B' : 'F'
    case 'invoice':
      return amountDue(source).value && (source.profile?.paid_or_due || source.profile?.amounts?.some((item) => /due|payable|balance/i.test(item.label || '')))
        ? 'B'
        : 'F'
    case 'insurance':
      return source.profile?.premium ? 'B' : fallback === 'A' ? 'A' : 'F'
    case 'challan':
    case 'tax_notice':
      return 'B'
    case 'school':
      return source.actions?.some((a) => a.due_date) && !(source.glance?.key_values || []).some((k) => isMoneyValue(k.kind, k.value))
        ? 'C'
        : 'B'
    case 'court_legal':
    case 'pension_notice':
      return 'C'
    case 'government_notice':
      return source.actions?.some((a) => a.due_date) ? 'C' : 'E'
    case 'utility_bill':
      return fallback === 'A' ? 'A' : 'B'
    case 'receipt':
      return fallback === 'B' ? 'B' : 'F'
    default:
      return fallback
  }
}

export function resolveProfile(source: ExplainResponse): DocumentProfileView {
  const kind = inferKind(source)
  const specific = (SPECIFIC[kind] || []).filter((id) => blockWhen(id, source))
  const common = COMMON.filter((id) => blockWhen(id, source))
  const painted = VISUAL_BY_KIND[kind]
  const visual = painted || visualForDocument(kind, { medicines: (source.medicines?.length || 0) > 0, title: source.title })
  return {
    kind,
    glanceLayout: layoutFor(kind, source),
    blocks: [...specific, ...common],
    visual,
  }
}
