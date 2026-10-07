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

export function getDictionary(langId: string): Record<string, string> {
  return dictionaries[langId] || dictionaries.en
}

const STORAGE_KEY = 'sarvam.lang'

/**
 * Returns initial language:
 * 1. Persisted choice from localStorage `sarvam.lang` if present.
 * 2. On first run: navigator.language starting with ta or hi uses that, else English.
 * Never default to Tamil.
 */
export function getStoredLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && typeof saved === 'string') {
      const match = LANGUAGES.find((l) => l.id === saved)
      if (match) return match.id
    }
  } catch {
    // Ignore localStorage unavailable
  }

  if (typeof navigator !== 'undefined' && navigator.language) {
    const nav = navigator.language.trim().toLowerCase()
    if (nav.startsWith('ta')) {
      return 'ta'
    }
    if (nav.startsWith('hi')) {
      return 'hi'
    }
  }

  return 'en'
}

/**
 * Persists selected language to localStorage `sarvam.lang`.
 */
export function setStoredLanguage(lang: string): void {
  try {
    localStorage.setItem(STORAGE_KEY, lang)
  } catch {
    // Ignore localStorage unavailable
  }
}

/**
 * Returns localized fallback strings in en, ta, or hi for API/network errors.
 */
export function getLocalFallbackError(
  lang: string,
  type: 'network' | 'timeout' | 'busy' | 'rate_limit' | 'generic'
): string {
  const norm = (lang || 'en').toLowerCase().slice(0, 2)
  const strings: Record<string, Record<string, string>> = {
    network: {
      en: 'Network error. Could not connect to Sarvam API.',
      ta: 'பிணையத் தொடர்பு பிழை. சர்வர் உடன் இணைக்க முடியவில்லை.',
      hi: 'नेटवर्क त्रुटि. सर्वर से कनेक्ट नहीं हो सका.',
    },
    timeout: {
      en: 'Request timed out. Please try again.',
      ta: 'கோரிக்கைக்கான நேரம் முடிந்துவிட்டது. மீண்டும் முயற்சிக்கவும்.',
      hi: 'अनुरोध का समय समाप्त हो गया. कृपया पुन: प्रयास करें.',
    },
    busy: {
      en: 'Service is busy. Please try again shortly.',
      ta: 'சேவை தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
      hi: 'सेवा व्यस्त है. कृपया थोड़ी देर बाद पुनः प्रयास करें.',
    },
    rate_limit: {
      en: 'Too many requests. Please try again later.',
      ta: 'அதிகப்படியான கோரிக்கைகள். சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
      hi: 'बहुत अधिक अनुरोध. कृपया बाद में पुनः प्रयास करें.',
    },
    generic: {
      en: 'Could not read notice. Please try again.',
      ta: 'ஆவணத்தைப் படிக்க இயலவில்லை. மீண்டும் முயற்சி செய்.',
      hi: 'दस्तावेज़ पढ़ा नहीं जा सका. कृपया पुनः प्रयास करें.',
    },
  }

  const group = strings[type] || strings.generic
  return group[norm] || group.en
}
