export type DocType =
  | 'government_notice'
  | 'utility_bill'
  | 'insurance'
  | 'lab_report'
  | 'bank'
  | 'school'
  | 'other'

export type DateStatus = 'upcoming' | 'passed' | 'calculated' | 'none'
export type EvidenceType = 'matched' | 'check_original' | 'calculated'

export interface ExplainAction {
  text: string
  due_date: string | null
  deadline_rule: string | null
  date_status: DateStatus
  quote: string
  page: number
  evidence: EvidenceType
}

export interface ExplainWarning {
  text: string
  quote: string
  page: number
  evidence: 'matched' | 'check_original'
}

export interface ExplainFact {
  text: string
  quote: string
  page: number
  evidence: 'matched' | 'check_original'
}

export interface EvidenceSummary {
  matched: number
  check_original: number
  calculated: number
}

export interface ExplainResponse {
  doc_type: DocType | string
  title: string
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
}

export interface ApiError {
  message: string
  message_local: string
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
