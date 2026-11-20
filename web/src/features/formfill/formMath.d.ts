import type { FormField, UserProfile } from '../../types'

export const NEVER_FILL_TYPES: Set<string>
export const ID_PROFILE_KEYS: Set<string>
export const SENSITIVE_PROFILE_KEYS: Set<string>

export interface PdfBoxRect {
  x: number
  y: number
  width: number
  height: number
  textX: number
  baselineY: number
  fontSize: number
}

export function clampBox(box: number[]): [number, number, number, number]
export function boxToPdfRect(box: number[], pageWidth: number, pageHeight: number): PdfBoxRect
export function splitCharGrid(value: string, cells: number): string[]
export function parseLooseDate(raw: string): { day: number; month: number; year: number } | null
export function formatDateForForm(rawDate: string, formFormat?: string | null): string
export function isIdNumberField(field: Pick<FormField, 'id' | 'label' | 'profileKey'> | null | undefined): boolean
export function maskIdValue(value: string, profileKey?: string | null): string
export function composeProfileAddress(profile: Partial<UserProfile> | null | undefined): string
export function fillFieldsFromProfile(
  fields: FormField[],
  profile: UserProfile | null | undefined
): { values: Record<string, string>; fromProfileIds: string[] }
export function getMissingFields(fields: FormField[], values: Record<string, string>): FormField[]
export function buildMissingFieldsPrompt(missingFields: FormField[]): string
export function buildFilledPdfFilename(formTitle: string, now?: Date | number): string
export function sanitizeProfileForStorage(profile: Partial<UserProfile>): UserProfile
