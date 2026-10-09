/** English placeholders. Final translations land in one later commit. */

export const REASON_CODES = [
  'wrong_date',
  'wrong_amount',
  'missed_action',
  'hard_to_understand',
  'other',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export const FEEDBACK_LANGS = ['en', 'ta', 'hi', 'te', 'ml', 'kn'] as const

export type FeedbackLang = (typeof FEEDBACK_LANGS)[number]

export interface FeedbackCopy {
  prompt: string
  yes: string
  no: string
  whatWasWrong: string
  send: string
  reasons: Record<ReasonCode, string>
  thanks: string
  sendFailed: string
  tryAgain: string
}

const english: FeedbackCopy = {
  prompt: 'Was this explanation right?',
  yes: 'Yes',
  no: 'No',
  whatWasWrong: 'What was wrong?',
  send: 'Send',
  reasons: {
    wrong_date: 'Wrong date',
    wrong_amount: 'Wrong amount',
    missed_action: 'Missed an action',
    hard_to_understand: 'Hard to understand',
    other: 'Other',
  },
  thanks: 'Thanks. Only your rating was saved, never your document.',
  sendFailed: 'Could not send. Please try again.',
  tryAgain: 'Try again',
}

export const feedbackStrings: Record<FeedbackLang, FeedbackCopy> = {
  en: english,
  ta: english,
  hi: english,
  te: english,
  ml: english,
  kn: english,
}

export function feedbackCopy(lang: string): FeedbackCopy {
  if ((FEEDBACK_LANGS as readonly string[]).includes(lang)) {
    return feedbackStrings[lang as FeedbackLang]
  }
  return feedbackStrings.en
}
