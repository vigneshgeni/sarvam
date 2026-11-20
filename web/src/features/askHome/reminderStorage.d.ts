import type { RelaySessionRecord, SavedReminder } from '../../types'

export const SARVAM_DB_NAME: string
export const SARVAM_DB_VERSION: number
export const REMINDERS_STORE: string
export const RELAY_SESSIONS_STORE: string

export function getSavedReminders(): Promise<SavedReminder[]>
export function saveAcceptedReminder(input: {
  id?: string
  title: string
  date?: string
  time?: string
  when?: string
  source?: string
  sourceId?: string
}): Promise<{ reminder: SavedReminder | null; added: boolean }>
export function deleteSavedReminder(id: string): Promise<void>
export function getRelaySessionById(id: string): Promise<RelaySessionRecord | null>
export function getAllRelaySessions(): Promise<RelaySessionRecord[]>
export function seedAskDemoSession(): Promise<RelaySessionRecord | null>
