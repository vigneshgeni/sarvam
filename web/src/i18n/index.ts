import en from './en.json'
import ta from './ta.json'
import hi from './hi.json'
import te from './te.json'
import ml from './ml.json'
import kn from './kn.json'

export const CONCRETE_LANGS = [
  'en',
  'ta',
  'hi',
  'te',
  'ml',
  'kn',
  'mr',
  'bn',
  'or',
] as const

export type ConcreteLang = (typeof CONCRETE_LANGS)[number]

export const LANG_LABELS: Record<ConcreteLang, string> = {
  en: 'English',
  ta: 'தமிழ்',
  hi: 'हिंदी',
  te: 'తెలుగు',
  ml: 'മലയാളം',
  kn: 'ಕನ್ನಡ',
  mr: 'मराठी',
  bn: 'বাংলা',
  or: 'ଓଡ଼ିଆ',
}

/**
 * Resolves any selected language code (including 'auto' or undefined) into a concrete language code
 * from the nine supported languages.
 *
 * Auto rule: First language in navigator.languages (or passed deviceLanguages) that we support, else English.
 * Never silently uses the document language or a remembered earlier choice.
 */
export function resolveLang(
  selected?: string | null,
  deviceLanguages?: readonly string[] | string[] | null
): ConcreteLang {
  if (selected && selected !== 'auto') {
    const norm = selected.toLowerCase().split('-')[0].split('_')[0]
    if (CONCRETE_LANGS.includes(norm as ConcreteLang)) {
      return norm as ConcreteLang
    }
  }

  const langs =
    deviceLanguages ??
    (typeof navigator !== 'undefined' && Array.isArray(navigator.languages)
      ? navigator.languages
      : typeof navigator !== 'undefined' && navigator.language
      ? [navigator.language]
      : [])

  for (const raw of langs) {
    if (!raw || typeof raw !== 'string') continue
    const code = raw.toLowerCase().split('-')[0].split('_')[0]
    if (CONCRETE_LANGS.includes(code as ConcreteLang)) {
      return code as ConcreteLang
    }
  }

  return 'en'
}

export interface LanguageOption {
  id: string
  label: string
  name: string
  isBeta?: boolean
  badge?: string
  disabled?: boolean
  speechCode?: string
}

export const SUPPORTED_LANGS: LanguageOption[] = [
  { id: 'auto', label: 'Auto', name: 'Auto (Detect)', isBeta: false },
  { id: 'en', label: 'English', name: 'English', isBeta: false, speechCode: 'en-IN' },
  { id: 'ta', label: 'தமிழ்', name: 'Tamil', isBeta: false, speechCode: 'ta-IN' },
  { id: 'hi', label: 'हिंदी', name: 'Hindi', isBeta: false, speechCode: 'hi-IN' },
  { id: 'te', label: 'తెలుగు', name: 'Telugu', isBeta: true, badge: 'Beta', disabled: false, speechCode: 'te-IN' },
  { id: 'ml', label: 'മലയാളം', name: 'Malayalam', isBeta: true, badge: 'Beta', disabled: false, speechCode: 'ml-IN' },
  { id: 'kn', label: 'ಕನ್ನಡ', name: 'Kannada', isBeta: true, badge: 'Beta', disabled: false, speechCode: 'kn-IN' },
]

export const LANGUAGES = SUPPORTED_LANGS

export type TranslationKey = keyof typeof en

const dictionaries: Record<string, Record<string, string>> = {
  en,
  ta,
  hi,
  te,
  ml,
  kn,
}

export function getTranslation(langId: string, key: TranslationKey): string {
  const concrete = resolveLang(langId)
  const dict = dictionaries[concrete] || dictionaries.en
  return dict[key] || dictionaries.en[key] || key
}

export function getDictionary(langId: string): Record<string, string> {
  const concrete = resolveLang(langId)
  return dictionaries[concrete] || dictionaries.en
}

export function getLocalisedDocType(langId: string, docType?: string | null): string {
  const concrete = resolveLang(langId)
  if (!docType) return getTranslation(concrete, 'doctype_document' as TranslationKey)
  const key = `doctype_${docType}` as TranslationKey
  const dict = dictionaries[concrete] || dictionaries.en
  if (dict[key]) return dict[key]
  if (dictionaries.en[key]) return dictionaries.en[key]
  return getTranslation(concrete, 'doctype_document' as TranslationKey)
}

const STORAGE_KEY = 'sarvam.lang'

/**
 * Returns initial language:
 * 1. Persisted choice from localStorage `sarvam.lang` if present.
 * 2. Defaults to 'auto' for new users (WEB-3).
 */
export function getStoredLanguage(): string {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved && typeof saved === 'string') {
      const match = SUPPORTED_LANGS.find((l) => l.id === saved && !l.disabled)
      if (match) return match.id
    }
  } catch {
    // Ignore localStorage unavailable
  }

  // Default for new users: 'auto'
  return 'auto'
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
 * Returns localized fallback strings in en, ta, hi, te, ml, kn for API/network errors.
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
      te: 'నెట్‌వర్క్ లోపం. సర్వర్‌కు కనెక్ట్ కాలేదు.',
      ml: 'നെറ്റ്‌വർക്ക് പിശക്. സെർവറുമായി ബന്ധപ്പെടാനായില്ല.',
      kn: 'ನೆಟ್‌ವರ್ಕ್ ದೋಷ. ಸರ್ವರ್‌ಗೆ ಸಂಪರ್ಕಿಸಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ.',
    },
    timeout: {
      en: 'Request timed out. Please try again.',
      ta: 'கோரிக்கைக்கான நேரம் முடிந்துவிட்டது. மீண்டும் முயற்சிக்கவும்.',
      hi: 'अनुरोध का समय समाप्त हो गया. कृपया पुन: प्रयास करें.',
      te: 'అభ్యర్థన సమయం ముగిసింది. దయచేసి మళ్లీ ప్రయత్నించండి.',
      ml: 'അഭ്യർത്ഥന സമയം കഴിഞ്ഞു. ദയവായി വീണ്ടും ശ്രമിക്കുക.',
      kn: 'ವಿನಂತಿಯ ಸಮಯ ಮೀರಿದೆ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    },
    busy: {
      en: 'Service is busy. Please try again shortly.',
      ta: 'சேவை தற்போது பிஸியாக உள்ளது. சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
      hi: 'सेवा व्यस्त है. कृपया थोड़ी देर बाद पुनः प्रयास करें.',
      te: 'సేవ బిజీగా ఉంది. కాసేపట్లో మళ్లీ ప్రయత్నించండి.',
      ml: 'സേവനം തിരക്കിലാണ്. ഉടൻ വീണ്ടും ശ്രമിക്കുക.',
      kn: 'ಸೇವೆ ನಿರತವಾಗಿದೆ. ದಯವಿಟ್ಟು ಶೀಘ್ರದಲ್ಲೇ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    },
    rate_limit: {
      en: 'Too many requests. Please try again later.',
      ta: 'அதிகப்படியான கோரிக்கைகள். சிறிது நேரம் கழித்து மீண்டும் முயற்சிக்கவும்.',
      hi: 'बहुत अधिक अनुरोध. कृपया बाद में पुनः प्रयास करें.',
      te: 'చాలా ఎక్కువ అభ్యర్థనలు. దయచేసి తర్వాత మళ్లీ ప్రయత్నించండి.',
      ml: 'നിരവധി അഭ്യർത്ഥനകൾ. പിന്നീട് വീണ്ടും ശ്രമിക്കുക.',
      kn: 'ತುಂಬಾ ವಿನಂತಿಗಳು. ದಯವಿಟ್ಟು ನಂತರ ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    },
    generic: {
      en: 'Could not read notice. Please try again.',
      ta: 'ஆவணத்தைப் படிக்க இயலவில்லை. மீண்டும் முயற்சி செய்.',
      hi: 'दस्तावेज़ पढ़ा नहीं जा सका. कृपया पुनः प्रयास करें.',
      te: 'పత్రాన్ని చదవలేకపోయాము. దయచేసి మళ్లీ ప్రయత్నించండి.',
      ml: 'പ്രമാണം വായിക്കാനായില്ല. ദയവായി വീണ്ടും ശ്രമിക്കുക.',
      kn: 'ದಾಖಲೆಯನ್ನು ಓದಲು ಸಾಧ್ಯವಾಗಲಿಲ್ಲ. ದಯವಿಟ್ಟು ಮತ್ತೆ ಪ್ರಯತ್ನಿಸಿ.',
    },
  }

  const group = strings[type] || strings.generic
  return group[norm] || group.en
}
