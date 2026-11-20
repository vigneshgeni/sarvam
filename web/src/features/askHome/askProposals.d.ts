import type { AskProposal, ExplainResponse, MemoryExcerpt } from '../../types'

export function formatIsoDate(date: Date | number | string): string
export function parseWhenToDateAndTime(rawWhen: string, now?: Date | number): { date: string; time: string }
export function parseAskProposals(
  answerText: string,
  structuredProposals?: unknown[] | null
): { cleanAnswer: string; proposals: AskProposal[] }
export function reminderDedupeKey(title: string, date: string, time?: string): string
export function buildHomeAskContext(excerpts: MemoryExcerpt[], lang?: string): ExplainResponse
