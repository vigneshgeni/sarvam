export type DocType =
  | 'government_notice'
  | 'utility_bill'
  | 'insurance'
  | 'lab_report'
  | 'bank'
  | 'school'
  | 'other'

export type DateStatus =
  | 'upcoming'
  | 'passed'
  | 'calculated'
  | 'recurring'
  | 'none'

export type EvidenceType = 'matched' | 'check_original' | 'calculated'

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

export interface ExplainResponse {
  doc_type: DocType | string
  title: string
  report_title: string | null
  report_date: string | null
  language: string
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

export type AppScreen = 'home' | 'tray' | 'reading' | 'result'
