export interface MedicineActivity {
  slots: Record<string, boolean>
  times: Record<string, string>
  durations: Record<string, number>
}

export interface DocumentActivity {
  doneActions: Record<string, boolean>
  remindersAdded: Record<string, boolean>
  medicine: MedicineActivity
  rating: '' | 'up' | 'down'
  lang: string
  reportIndex: number | null
}

export function emptyActivity(): DocumentActivity
export function mergeActivity(current: Partial<DocumentActivity> | null | undefined, patch?: Partial<DocumentActivity> | null): DocumentActivity
export function clearTicks(activity: Partial<DocumentActivity> | null | undefined): DocumentActivity
export function visibleTitle(record?: { displayName?: string; title?: string } | null): string
export function applyRename(name: string, fallback?: string): string
export function shortIssuer(value?: string | null): string
export function shortDate(iso?: string | null): string
export function defaultDocumentName(kind?: string, issuer?: string | null, isoDate?: string | null): string
export function isSampleResultId(id?: string | null): boolean
