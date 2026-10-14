import type { ExplainResponse } from '../types'
import { idbGetReadCache, idbPutReadCache, isSaveRecentEnabled, type ReadCacheRecord } from './db'

/** Bump this when the reader prompt or the result schema changes. */
export const READER_VERSION = '3'

const memory = new Map<string, ReadCacheRecord>()

export function readCacheId(hash: string): string {
  return `${hash}:${READER_VERSION}`
}

export async function sha256Files(files: Blob[]): Promise<string> {
  const buffers = await Promise.all(files.map((file) => file.arrayBuffer()))
  const total = buffers.reduce((sum, buffer) => sum + buffer.byteLength, 0)
  const merged = new Uint8Array(total)
  let offset = 0
  for (const buffer of buffers) {
    merged.set(new Uint8Array(buffer), offset)
    offset += buffer.byteLength
  }
  const digest = await crypto.subtle.digest('SHA-256', merged)
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('')
}

export async function recallRead(hash: string, lang: string): Promise<ExplainResponse | null> {
  const id = readCacheId(hash)
  const local = memory.get(id)
  if (local?.translations[lang]) return local.translations[lang] as ExplainResponse
  if (!isSaveRecentEnabled()) return null
  const stored = await idbGetReadCache(id)
  if (!stored?.translations?.[lang]) return null
  memory.set(id, stored)
  return stored.translations[lang] as ExplainResponse
}

export async function rememberRead(hash: string, lang: string, result: ExplainResponse, resultId?: string): Promise<void> {
  const id = readCacheId(hash)
  const prev = memory.get(id) || { id, translations: {} }
  prev.translations = { ...prev.translations, [lang]: result }
  if (resultId) prev.resultId = resultId
  memory.set(id, prev)
  if (isSaveRecentEnabled()) await idbPutReadCache(prev)
}

export function forgetReadMemory(): void {
  memory.clear()
}

export function forgetReadResult(resultId: string): void {
  for (const [id, record] of memory) {
    if (record.resultId === resultId) memory.delete(id)
  }
}
