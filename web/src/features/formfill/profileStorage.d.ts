import type { FormDraft, UserProfile } from '../../types'

export const SARVAM_DB_NAME: string
export const SARVAM_DB_VERSION: number
export const PROFILE_STORE: string
export const DRAFTS_STORE: string

export function getUserProfile(id?: string): Promise<UserProfile | null>
export function saveUserProfile(profile: Partial<UserProfile>): Promise<UserProfile>
export function getFormDrafts(): Promise<FormDraft[]>
export function getFormDraft(id: string): Promise<FormDraft | null>
export function saveFormDraft(draft: Partial<FormDraft>): Promise<FormDraft>
export function deleteFormDraft(id: string): Promise<void>
