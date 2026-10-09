import { FEEDBACK_LANGS, REASON_CODES, type FeedbackLang, type ReasonCode } from './strings.js'

export const APP_VERSION = '0.0.0'

export const DOC_TYPES = ['pension', 'lab', 'insurance', 'other', 'unknown'] as const

export type FeedbackDocType = (typeof DOC_TYPES)[number]
export type FeedbackRating = 'up' | 'down'

const INPUT_KEYS = ['rating', 'lang', 'docType', 'reasons', 'sample', 'appVersion'] as const

export interface FeedbackPayloadBase {
  rating: FeedbackRating
  lang: FeedbackLang
  docType: FeedbackDocType
  sample: boolean
  appVersion: string
}

export interface FeedbackPayloadUp extends FeedbackPayloadBase {
  rating: 'up'
}

export interface FeedbackPayloadDown extends FeedbackPayloadBase {
  rating: 'down'
  reasons: ReasonCode[]
}

export type FeedbackPayload = FeedbackPayloadUp | FeedbackPayloadDown

export class FeedbackPayloadError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FeedbackPayloadError'
  }
}

function isReasonCode(value: string): value is ReasonCode {
  return (REASON_CODES as readonly string[]).includes(value)
}

function hash32(value: string): string {
  let hash = 0
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16).padStart(8, '0')
}

/** Stable local id. The raw text is not stored; only this hash is kept on device. */
export function localResultId(parts: {
  title: string
  language: string
  docType: string
  lang: string
  summary: readonly string[]
}): string {
  return hash32(
    [parts.title, parts.language, parts.docType, parts.lang, parts.summary.join('\n')].join('\u001f'),
  )
}

export function isBuiltInSample(fileNames: readonly string[]): boolean {
  return fileNames.length > 0 && fileNames.every((name) => name.startsWith('sample-'))
}

/**
 * True only when every file is a built-in sample. The return value is a boolean.
 * Names, sizes, types and file bytes are not returned.
 */
export function sampleFromFiles(files: readonly object[]): boolean {
  if (files.length === 0) return false
  const names: string[] = []
  for (const file of files) {
    const name = (file as { name?: unknown }).name
    if (typeof name !== 'string') return false
    names.push(name)
  }
  return isBuiltInSample(names)
}

export function toFeedbackDocType(value: unknown): FeedbackDocType {
  if (typeof value !== 'string') return 'unknown'
  const normalized = value.trim().toLowerCase()
  if ((DOC_TYPES as readonly string[]).includes(normalized)) {
    return normalized as FeedbackDocType
  }
  return 'unknown'
}

function assertAppVersion(value: unknown): string {
  const version = value === undefined ? APP_VERSION : value
  if (typeof version !== 'string' || !/^[0-9A-Za-z._+-]{1,32}$/.test(version)) {
    throw new FeedbackPayloadError('appVersion is not an allowed version string')
  }
  return version
}

export function buildFeedbackPayload(input: object): FeedbackPayload {
  const record = input as Record<string, unknown>
  for (const key of Object.keys(record)) {
    if (!(INPUT_KEYS as readonly string[]).includes(key)) {
      throw new FeedbackPayloadError(`Unexpected field: ${key}`)
    }
  }

  const rating = record.rating
  if (rating !== 'up' && rating !== 'down') {
    throw new FeedbackPayloadError('rating must be up or down')
  }

  if (typeof record.lang !== 'string' || !(FEEDBACK_LANGS as readonly string[]).includes(record.lang)) {
    throw new FeedbackPayloadError('lang is not an allowed language')
  }
  const lang = record.lang as FeedbackLang

  if (typeof record.sample !== 'boolean') {
    throw new FeedbackPayloadError('sample must be a boolean')
  }

  const appVersion = assertAppVersion(record.appVersion)
  const docType = toFeedbackDocType(record.docType)
  const hasReasons = Object.prototype.hasOwnProperty.call(record, 'reasons')

  if (rating === 'up') {
    if (hasReasons) {
      throw new FeedbackPayloadError('reasons are only allowed when rating is down')
    }
    return { rating, lang, docType, sample: record.sample, appVersion }
  }

  const rawReasons = hasReasons ? record.reasons : []
  if (!Array.isArray(rawReasons)) {
    throw new FeedbackPayloadError('reasons must be an array of reason codes')
  }
  if (rawReasons.length > REASON_CODES.length) {
    throw new FeedbackPayloadError('reasons cannot exceed five codes')
  }

  const reasons: ReasonCode[] = []
  for (const item of rawReasons) {
    if (typeof item !== 'string' || !isReasonCode(item)) {
      throw new FeedbackPayloadError('reasons must be reason codes, not free text')
    }
    if (!reasons.includes(item)) reasons.push(item)
  }

  return { rating, lang, docType, reasons, sample: record.sample, appVersion }
}
