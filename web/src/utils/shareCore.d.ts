export const INSTITUTION_TERMS: string[]
export const ID_TOKEN_REGEX: RegExp
export const KNOWN_PERSONAL_NAMES: string[]

export function getHiddenLabel(lang?: string): string
export function maskNameWord(word: string): string
export function maskPersonName(name: string): string
export function maskPhone(phone: string): string
export function maskEmail(email: string): string
export function maskIdToken(id: string): string
export function isPersonalField(text: string, quote?: string, isPersonalExplicit?: boolean): boolean
export function maskStringWithSegments(
  input: string,
  protectedTerms?: string[],
  lang?: string,
  birthKeys?: Set<string>
): { text: string; segments: { text: string; masked: boolean }[] }
export function sanitizeProse(text: string, protectedTerms?: string[], lang?: string, birthKeys?: Set<string>): string
export function collectBirthDateKeys(result: unknown): Set<string>
export function getLocalisedDocTitle(docType: string, lang?: string): string
export function buildShare(
  result: any,
  options?: { hidePersonal?: boolean; lang?: string }
): { text: string; title: string; segments: { text: string; masked: boolean }[] }
export function buildSharedText(result: any, lang: string, hidePersonal: boolean): string
export function redactResult(result: any, options?: { hidePersonal?: boolean; lang?: string }): any
export function shareToWhatsApp(text: string): void
export function shareToEmail(subject: string, text: string): void
export function copyToClipboard(text: string): Promise<boolean>
