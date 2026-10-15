/** English placeholders. Final translations land in one later commit. */

export const REASON_CODES = [
  'wrong_date',
  'wrong_amount',
  'missed_action',
  'hard_to_understand',
  'other',
] as const

export type ReasonCode = (typeof REASON_CODES)[number]

export const FEEDBACK_LANGS = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or'] as const

export type FeedbackLang = (typeof FEEDBACK_LANGS)[number]

export interface FeedbackCopy {
  prompt: string
  yes: string
  no: string
  whatWasWrong: string
  send: string
  reasons: Record<ReasonCode, string>
  thanks: string
  sending: string
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
  sending: 'Sending…',
  sendFailed: 'Could not send. Please try again.',
  tryAgain: 'Try again',
}

function copy(prompt: string, yes: string, no: string, whatWasWrong: string): FeedbackCopy {
  return { ...english, prompt, yes, no, whatWasWrong }
}

export const feedbackStrings: Record<FeedbackLang, FeedbackCopy> = {
  en: english,
  ta: copy('இந்த விளக்கம் சரியா?', 'ஆம்', 'இல்லை', 'என்ன தவறு?'),
  hi: copy('क्या यह व्याख्या सही थी?', 'हाँ', 'नहीं', 'क्या गलत था?'),
  te: copy('ఈ వివరణ సరైనదేనా?', 'అవును', 'కాదు', 'ఏమి తప్పు?'),
  ml: copy('ഈ വിശദീകരണം ശരിയാണോ?', 'അതെ', 'അല്ല', 'എന്താണ് തെറ്റ്?'),
  kn: copy('ಈ ವಿವರಣೆ ಸರಿಯೇ?', 'ಹೌದು', 'ಅಲ್ಲ', 'ಏನು ತಪ್ಪು?'),
  mr: copy('हे स्पष्टीकरण बरोबर होते का?', 'होय', 'नाही', 'काय चुकले?'),
  bn: copy('এই ব্যাখ্যা কি ঠিক ছিল?', 'হ্যাঁ', 'না', 'কী ভুল ছিল?'),
  or: copy('ଏହି ବ୍ୟାଖ୍ୟା ଠିକ ଥିଲା କି?', 'ହଁ', 'ନା', 'କଣ ଭୁଲ ଥିଲା?'),
}

export function feedbackCopy(lang: string): FeedbackCopy {
  if ((FEEDBACK_LANGS as readonly string[]).includes(lang)) {
    return feedbackStrings[lang as FeedbackLang]
  }
  return feedbackStrings.en
}
