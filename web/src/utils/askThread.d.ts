export interface AskThreadTurn {
  question: string
  answer: string
}

export function asksForDocument<T>(
  id: string | null | undefined,
  saved: T[] | null | undefined,
  ownerId: string | null | undefined,
  live: T[] | null | undefined,
): T[]

export function turnsForThread<T>(
  stored: T[] | null | undefined,
  initial: T[] | null | undefined,
): T[]
