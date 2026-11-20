import type { MemoryExcerpt } from '../../types'

export interface MemoryCandidate {
  sourceId: string
  sourceType: MemoryExcerpt['sourceType']
  title: string
  body: string
  timestamp: number
}

export function tokenizeUnicode(text: string): string[]
export function scoreMemoryItem(queryTokens: string[], item: MemoryCandidate, nowMs?: number): number
export function buildExcerpt(body: string, queryTokens: string[], maxLen?: number): string
export function rankMemoryItems(query: string, items: MemoryCandidate[], nowMs?: number, limit?: number): MemoryExcerpt[]
export function searchMemory(query: string, options?: { nowMs?: number; dbName?: string }): Promise<MemoryExcerpt[]>
