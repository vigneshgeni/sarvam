export type CategoryId =
  | 'wallet'
  | 'phone'
  | 'bag'
  | 'keys'
  | 'passport'
  | 'driving_licence'
  | 'aadhaar_card'
  | 'pan_card'
  | 'voter_id'
  | 'other_id'
  | 'certificate'
  | 'bank_card'
  | 'laptop_tablet'
  | 'jewellery'
  | 'vehicle_rc'
  | 'other'

export type Tone = 'gold' | 'blue' | 'violet' | 'green' | 'coral' | 'indigo'

export interface Category {
  id: CategoryId
  label: string
  ico: string
  tone: Tone
  idCat: boolean
  noNumber?: boolean
  note: string
}

export const CATEGORIES: Category[] = [
  { id: 'passport', label: 'Passport', ico: 'book', tone: 'violet', idCat: true, note: 'ID number is matched privately' },
  { id: 'driving_licence', label: 'Driving licence', ico: 'card', tone: 'blue', idCat: true, note: 'ID number is matched privately' },
  { id: 'aadhaar_card', label: 'Aadhaar / ID card', ico: 'card', tone: 'coral', idCat: true, noNumber: true, note: 'We never take the number' },
  { id: 'certificate', label: 'Certificates', ico: 'file', tone: 'gold', idCat: true, note: 'Marksheets, degrees' },
  { id: 'wallet', label: 'Wallet', ico: 'wallet', tone: 'gold', idCat: false, note: 'Cards, cash, passes' },
  { id: 'phone', label: 'Phone', ico: 'phone', tone: 'blue', idCat: false, note: 'Colour, case, cracks' },
  { id: 'bag', label: 'Bag', ico: 'bag', tone: 'green', idCat: false, note: 'Backpack, laptop bag' },
  { id: 'keys', label: 'Keys', ico: 'key', tone: 'indigo', idCat: false, note: 'Tags, keyrings' },
  { id: 'pan_card', label: 'PAN card', ico: 'card', tone: 'gold', idCat: true, note: 'Number is fingerprinted only' },
  { id: 'voter_id', label: 'Voter ID', ico: 'card', tone: 'indigo', idCat: true, note: 'EPIC number is private' },
  { id: 'vehicle_rc', label: 'Vehicle RC', ico: 'file', tone: 'blue', idCat: true, note: 'Plate is fingerprinted only' },
  { id: 'other', label: 'Other', ico: 'search', tone: 'indigo', idCat: false, note: 'Describe it clearly' },
]

export const TONE_CLASS: Record<Tone, string> = {
  gold: 'lf-ic-gold',
  blue: 'lf-ic-blue',
  violet: 'lf-ic-violet',
  green: 'lf-ic-green',
  coral: 'lf-ic-coral',
  indigo: 'lf-ic-indigo',
}

export function catOf(id: string): Category {
  return CATEGORIES.find((c) => c.id === id) || CATEGORIES[CATEGORIES.length - 1]
}

export const DEMO_QUESTIONS: Record<string, [string, string]> = {
  passport: ['What colour is the cover and is it in any case?', 'Which city is on the most recent stamp inside?'],
  driving_licence: ['What is the date of birth on it?', 'Which RTO issued it?'],
  aadhaar_card: ['What is the name on it?', 'Which district is in the address?'],
  certificate: ['Which college or board is on it?', 'What is the year printed on it?'],
  wallet: ['Which card is in the front pocket?', 'What is folded inside?'],
  phone: ['What is the lock-screen wallpaper?', 'What colour is the case?'],
  bag: ['What is in the front pocket?', 'Is there a tag or sticker?'],
  keys: ['What is on the keyring?', 'How many keys are there?'],
}

export const TEST_IDS: Partial<Record<CategoryId, { lost: string; found: string }>> = {
  passport: { lost: 'Z1234567', found: 'Z7654321' },
  driving_licence: { lost: 'TN01 20230012345', found: 'TN01 20230012345' },
}
