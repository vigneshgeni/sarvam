export function presentActionDate(
  action: {
    due_date?: string | null
    date_status?: string
    evidence?: string
    quote?: string | null
    recurrence?: string | null
  },
  options?: {
    isPhoto?: boolean
    today?: Date
    t?: Record<string, string>
  }
): {
  isPassed: boolean
  passedMarker: string | null
  evidenceChip: { kind: string; text: string } | null
  showCalendar: boolean
}
