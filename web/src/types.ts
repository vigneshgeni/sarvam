export type DocType =
  | 'utility_bill'
  | 'telecom_bill'
  | 'tax_receipt'
  | 'insurance'
  | 'bank'
  | 'government_notice'
  | 'court_legal'
  | 'challan'
  | 'medical'
  | 'receipt'
  | 'agreement'
  | 'corporate'
  | 'other'
  | 'lab_report'
  | 'school'

export type DateStatus =
  | 'upcoming'
  | 'passed'
  | 'calculated'
  | 'recurring'
  | 'none'

export type EvidenceType = 'matched' | 'check_original' | 'calculated' | 'none'

export interface ExplainAction {
  text: string
  due_date: string | null
  deadline_rule: string | null
  deadline_days: number | null
  deadline_anchor: string | null
  recurrence: string | null
  date_status: DateStatus | string
  quote: string
  page: number
  evidence: EvidenceType | string
  part_id?: string
}

export interface ExplainWarning {
  text: string
  quote: string
  page: number
  evidence: 'matched' | 'check_original' | string
  part_id?: string
}

export interface ExplainFact {
  text: string
  quote: string
  page: number
  evidence: 'matched' | 'check_original' | string
  part_id?: string
}

export interface EvidenceSummary {
  matched: number
  check_original: number
  calculated: number
}

export interface GlanceKeyValue {
  label: string
  value: string
  kind: 'amount' | 'date' | 'text'
  evidence: 'matched' | 'check_original' | 'calculated'
}

export interface GlanceSection {
  headline: string
  key_values: GlanceKeyValue[]
}

export interface PlaceItem {
  label: string
  address: string
  quote?: string
  page?: number
  evidence: 'matched' | 'check_original' | 'calculated'
}

export interface ContactItem {
  label: string
  value: string
  quote?: string
  page?: number
  evidence: 'matched' | 'check_original' | 'calculated'
}

export type MedicineSlot = 'morning' | 'afternoon' | 'evening' | 'night' | 'bedtime' | 'as_needed'
export type FoodTiming = 'before_food' | 'after_food' | null

export interface MedicineItem {
  name: string
  strength_text: string | null
  frequency_raw: string
  frequency_code: string
  slots: MedicineSlot[]
  food_timing: FoodTiming
  duration_days: number | null
  instruction_text: string
  decoded: boolean
  as_needed?: boolean
  quote?: string
  page?: number
  evidence: 'matched' | 'check_original' | 'calculated'
}

export interface QuotedField {
  label: string
  value: string
  quote?: string
  page?: number
}

export interface DocumentProfile {
  lab_name?: string | null
  patient_age_sex?: string | null
  sample_date?: string | null
  referred_by?: string | null
  follow_up?: string | null
  diagnosis_as_written?: string | null
  advice_lines?: string[]
  amounts?: QuotedField[]
  due_date?: string | null
  last_date_without_penalty?: string | null
  how_to_pay?: string[]
  seller?: string | null
  invoice_no?: string | null
  invoice_date?: string | null
  line_items?: { description: string; qty?: string | null; amount?: string | null }[]
  taxable_value?: string | null
  taxes?: QuotedField[]
  total?: string | null
  paid_or_due?: string | null
  warranty_until?: string | null
  return_window?: string | null
  claimed?: string | null
  approved?: string | null
  deducted?: string | null
  deduction_reasons?: string[]
  policy_no?: string | null
  sum_insured?: string | null
  premium?: string | null
  renewal_date?: string | null
  review_window?: string | null
  invested?: string | null
  current_value?: string | null
  gain?: string | null
  gain_calculated?: boolean
  units?: string | null
  nav?: string | null
  nav_date?: string | null
  folio?: string | null
  next_sip_date?: string | null
  opening?: string | null
  closing?: string | null
  credits_total?: string | null
  debits_total?: string | null
  gross?: string | null
  deductions?: string | null
  net_pay?: string | null
  period?: string | null
  lender?: string | null
  loan_type?: string | null
  loan_account?: string | null
  sanctioned_amount?: string | null
  interest_rate?: string | null
  tenure?: string | null
  emi_amount?: string | null
  emi_day_of_month?: number | null
  first_emi_date?: string | null
  next_emi_date?: string | null
  outstanding?: string | null
  charges?: QuotedField[]
  agreement_type?: string | null
  parties?: { role: string; name: string }[]
  subject?: string | null
  start_date?: string | null
  end_date?: string | null
  term?: string | null
  rent_or_price?: string | null
  deposit?: string | null
  lock_in?: string | null
  notice_period?: string | null
  renewal_or_escalation?: string | null
  penalties?: string[]
  case_or_notice_no?: string | null
  hearing_or_deadline?: string | null
  directions?: string[]
  consequence?: string | null
  form_fields?: { name: string; instruction?: string; quote?: string; page?: number }[]
}

export interface ExplainResponse {
  doc_type: DocType | string
  document_type?: DocType | string
  document_kind?: string | null
  profile?: DocumentProfile | null
  title: string
  report_title: string | null
  report_date: string | null
  report_date_iso?: string | null
  source_kind?: 'text_pdf' | 'scanned_pdf' | 'photo' | string | null
  language: string
  document_language?: string
  letter_date: string | null
  summary: string[]
  actions: ExplainAction[]
  warnings: ExplainWarning[]
  facts: ExplainFact[]
  conflicts: string[]
  evidence_summary: EvidenceSummary
  unreadable: boolean
  unreadable_reason: string | null
  protected_terms: string[]
  protected_terms_rendered?: Record<string, string[]>
  mask_fallback?: boolean
  glance?: GlanceSection
  places?: PlaceItem[]
  contacts?: ContactItem[]
  medicines?: MedicineItem[]
  spoken_summary?: string
  source_text?: string | null
  parts?: Part[]
  sections?: Section[]
}

export interface SectionValue {
  label: string
  name?: string
  value: string
  unit?: string
  ref_range?: string
  range?: string
  flag_printed?: 'High' | 'Low' | 'In range' | null
  flag?: string
  evidence?: string
}

export interface Section {
  heading: string
  heading_printed?: string
  title?: string
  page: number
  values: SectionValue[]
}

export interface KeyPoint {
  text: string
  quote?: string
}

export interface Part {
  part_id: string
  title: string
  document_type: string
  document_kind?: string | null
  profile?: DocumentProfile | null
  issuer?: string
  date_iso?: string
  pages: [number, number]
  glance?: GlanceSection
  sections?: Section[]
  medicines?: MedicineItem[]
  key_points?: (string | KeyPoint)[]
  summary_lines?: string[]
}

export interface AskResponse {
  answer: string
  quote: string | null
  page: number | null
  evidence: 'matched' | 'check_original' | 'none'
  answered_from: 'document' | 'summary'
  not_found: boolean
  language: string
}

export interface A11ySettings {
  textSize: 100 | 115 | 130 | 150
  lineSpacing: 'normal' | 'relaxed'
  easyRead: boolean
  highContrast: boolean
  reduceMotion: boolean
  largerTapTargets: boolean
  readAloud?: boolean
  slowVoice?: boolean
}

export interface ErrorResponse {
  message: string
  message_local: string
}

export type ApiError = ErrorResponse

export interface TranslateRequest {
  result: ExplainResponse
  lang: string
}

export interface AppErrorInfo {
  message: string
  messageLocal: string
  statusCode: number
  retryAfter?: number
}

export interface StagedFile {
  id: string
  file: File
  name: string
  size: number
  type: string
  previewUrl?: string
}

export interface MultiReportCard {
  id: string
  fileName: string
  title: string
  date?: string | null
  evidence_summary?: EvidenceSummary
  result?: ExplainResponse
  error?: AppErrorInfo | null
  status: 'pending' | 'ready' | 'error'
}

export interface RecentResult {
  id: string
  timestamp: number
  title: string
  fileCount: number
  fileNames: string[]
  lang: string
  result: ExplainResponse
  translations?: Record<string, ExplainResponse>
  multiReports?: MultiReportCard[]
}

export type AppScreen = 'home' | 'tray' | 'reading' | 'result'
