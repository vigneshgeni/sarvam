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
}

export interface ExplainWarning {
  text: string
  quote: string
  page: number
  evidence: 'matched' | 'check_original' | string
}

export interface ExplainFact {
  text: string
  quote: string
  page: number
  evidence: 'matched' | 'check_original' | string
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
  quote?: string
  page?: number
  evidence: 'matched' | 'check_original' | 'calculated'
}

export interface ExplainResponse {
  doc_type: DocType | string
  document_type?: DocType | string
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
  glance?: GlanceSection
  places?: PlaceItem[]
  contacts?: ContactItem[]
  medicines?: MedicineItem[]
  spoken_summary?: string
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
