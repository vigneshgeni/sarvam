export interface ReminderRow {
  id: string
  kind: 'deadline' | 'medicine'
  summary: string
  date: string
  time: string
  documentName: string
  status: 'upcoming' | 'past'
  recentId: string
}

export interface CalendarDraft {
  title?: string
  note?: string
  date?: string
  time?: string
  alert?: string
  uid?: string
}

export function langCode(lang?: string): string
export function localDate(now?: Date): string
export function reminderSummary(text?: string, limit?: number): string
export function collectReminders(recents: unknown[] | null | undefined, options?: {
  now?: Date | string
  today?: string
  lang?: string
  medicineLine?: (name: string) => string
}): ReminderRow[]
export function dismissNext(dismissed: string[] | null | undefined, id: string): string[]
export function readDismissed(storage: { getItem(key: string): string | null }): string[]
export function writeDismissed(storage: { setItem(key: string, value: string): void }, ids: string[]): void
export function upcomingReminders(rows: ReminderRow[] | null | undefined, dismissed?: string[] | null): ReminderRow[]
export function pastReminders(rows: ReminderRow[] | null | undefined): ReminderRow[]
export function calendarDraftEvent(draft?: CalendarDraft): {
  uid: string
  title: string
  description: string
  startDate: string
  isAllDay: boolean
  alarmTrigger: string
}
