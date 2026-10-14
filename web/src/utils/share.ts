/**
 * Sharing utilities for Sarvam document explanation.
 * Formats structured text for native share, WhatsApp, Email, or Clipboard,
 * with structured personal detail redaction (1A).
 */

import type { ExplainResponse } from '../types'
import {
  INSTITUTION_TERMS as CORE_INSTITUTION_TERMS,
  ID_TOKEN_REGEX as CORE_ID_TOKEN_REGEX,
  KNOWN_PERSONAL_NAMES as CORE_KNOWN_PERSONAL_NAMES,
  getHiddenLabel as coreGetHiddenLabel,
  maskNameWord as coreMaskNameWord,
  maskPersonName as coreMaskPersonName,
  maskPhone as coreMaskPhone,
  maskEmail as coreMaskEmail,
  maskIdToken as coreMaskIdToken,
  isPersonalField as coreIsPersonalField,
  maskStringWithSegments as coreMaskStringWithSegments,
  sanitizeProse as coreSanitizeProse,
  getLocalisedDocTitle as coreGetLocalisedDocTitle,
  buildShare as coreBuildShare,
  buildSharedText as coreBuildSharedText,
  redactResult as coreRedactResult,
  shareToWhatsApp as coreShareToWhatsApp,
  shareToEmail as coreShareToEmail,
  copyToClipboard as coreCopyToClipboard,
} from './shareCore.js'

export const INSTITUTION_TERMS = CORE_INSTITUTION_TERMS
export const ID_TOKEN_REGEX = CORE_ID_TOKEN_REGEX
export const KNOWN_PERSONAL_NAMES = CORE_KNOWN_PERSONAL_NAMES

export interface ShareSegment {
  text: string
  masked: boolean
}

export interface ShareResult {
  text: string
  title: string
  segments: ShareSegment[]
}

export const getHiddenLabel = coreGetHiddenLabel
export const maskNameWord = coreMaskNameWord
export const maskPersonName = coreMaskPersonName
export const maskPhone = coreMaskPhone
export const maskEmail = coreMaskEmail
export const maskIdToken = coreMaskIdToken
export const isPersonalField = coreIsPersonalField
export const maskStringWithSegments = coreMaskStringWithSegments
export const sanitizeProse = coreSanitizeProse
export const getLocalisedDocTitle = coreGetLocalisedDocTitle

export function buildShare(
  result: ExplainResponse,
  options: { hidePersonal: boolean; lang?: string }
): ShareResult {
  return coreBuildShare(result, options) as ShareResult
}

export function buildSharedText(
  result: ExplainResponse,
  lang: string,
  hidePersonal: boolean
): string {
  return coreBuildSharedText(result, lang, hidePersonal)
}

export function redactResult(
  result: ExplainResponse,
  options: { hidePersonal: boolean; lang?: string }
): ExplainResponse {
  return coreRedactResult(result, options) as ExplainResponse
}

export const shareToWhatsApp = coreShareToWhatsApp
export const shareToEmail = coreShareToEmail
export const copyToClipboard = coreCopyToClipboard
