import en from './en.json'
import ta from './ta.json'
import hi from './hi.json'

export interface Language {
  id: string
  label: string
  name: string
  isBeta: boolean
}

export const LANGUAGES: Language[] = [
  { id: 'en', label: 'English', name: 'English', isBeta: false },
  { id: 'ta', label: 'தமிழ்', name: 'Tamil', isBeta: false },
  { id: 'hi', label: 'हिंदी', name: 'Hindi', isBeta: false },
  { id: 'kn', label: 'ಕನ್ನಡ', name: 'Kannada', isBeta: true },
  { id: 'ml', label: 'മലയാളം', name: 'Malayalam', isBeta: true },
  { id: 'te', label: 'తెలుగు', name: 'Telugu', isBeta: true },
  { id: 'bn', label: 'বাংলা', name: 'Bengali', isBeta: true },
  { id: 'mr', label: 'मराठी', name: 'Marathi', isBeta: true },
  { id: 'gu', label: 'ગુજરાતી', name: 'Gujarati', isBeta: true },
  { id: 'pa', label: 'ਪੰਜਾਬੀ', name: 'Punjabi', isBeta: true },
  { id: 'or', label: 'ଓଡ଼ିଆ', name: 'Odia', isBeta: true },
  { id: 'ur', label: 'اردو', name: 'Urdu', isBeta: true },
]

export type TranslationKey = keyof typeof en

const dictionaries: Record<string, Record<string, string>> = {
  en,
  ta,
  hi,
}

export function getTranslation(langId: string, key: TranslationKey): string {
  // If language exists in dictionary, use it; otherwise fallback to English UI
  const dict = dictionaries[langId] || dictionaries.en
  return dict[key] || dictionaries.en[key] || key
}

export function getDictionary(langId: string) {
  return dictionaries[langId] || dictionaries.en
}
