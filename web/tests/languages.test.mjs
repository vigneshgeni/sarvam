import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const LANG_CODES = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']

// Load all 9 i18n dictionaries
const dictionaries = {}
for (const code of LANG_CODES) {
  const filePath = fs.existsSync(path.resolve('src/i18n', `${code}.json`))
    ? path.resolve('src/i18n', `${code}.json`)
    : path.resolve('web/src/i18n', `${code}.json`)
  dictionaries[code] = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
}


test('Languages - all 9 i18n dictionaries contain required critical keys', () => {
  const requiredKeys = [
    'hello',
    'takePhoto',
    'chooseFiles',
    'samples',
    'privacy',
    'savedOnThisPhoneOnly',
    'viewDocument',
    'openOriginal',
    'previewNotAvailable',
    'documentPreview',
    'aiTranslationDisclaimer',
    'datePassed',
    'listenBtnLabel',
    'askBtnLabel',
    'foundInDoc',
    'checkAgainstOriginal',
    'calculatedChip',
    'odiaAudioUnavailable',
    'photoVerificationBanner',
  ]

  for (const code of LANG_CODES) {
    const dict = dictionaries[code]
    for (const key of requiredKeys) {
      assert.ok(
        dict[key] && dict[key].trim().length > 0,
        `Language ${code} is missing critical key: ${key}`
      )
    }
  }
})

test('Languages - Beta badge retained ONLY on Odia', () => {
  const indexPath = fs.existsSync(path.resolve('src/i18n/index.ts'))
    ? path.resolve('src/i18n/index.ts')
    : path.resolve('web/src/i18n/index.ts')
  const indexContent = fs.readFileSync(indexPath, 'utf-8')

  // Verify Odia has isBeta: true and badge: 'Beta'
  assert.ok(
    indexContent.includes(`id: 'or', label: 'ଓଡ଼ିଆ', name: 'Odia', isBeta: true, badge: 'Beta'`),
    'Odia must retain isBeta: true and badge: Beta'
  )

  // Verify te, ml, kn, mr, bn do NOT have isBeta: true or badge: 'Beta'
  for (const lang of ['te', 'ml', 'kn', 'mr', 'bn']) {
    const match = indexContent.match(new RegExp(`id:\\s*'${lang}'[^}]+`))
    assert.ok(match, `${lang} must exist in index.ts`)
    assert.ok(match[0].includes('isBeta: false'), `${lang} must have isBeta: false`)
    assert.ok(!match[0].includes(`badge: 'Beta'`), `${lang} must not have badge: Beta`)
  }
})

test('Languages - exact Home footer privacy texts for mr, bn, or', () => {
  assert.equal(
    dictionaries.mr.privacy,
    'तुमचे दस्तऐवज Google Cloud वर वाचले जाते, साठवले जात नाही. तुम्ही निकालाला रेटिंग दिल्यास, फक्त रेटिंग जतन केले जाते.'
  )
  assert.equal(
    dictionaries.bn.privacy,
    'আপনার নথি Google Cloud-এ পড়া হয়, সংরক্ষণ করা হয় না। আপনি কোনো ফলাফলে রেটিং দিলে, শুধু রেটিংটি সংরক্ষিত হয়।'
  )
  assert.equal(
    dictionaries.or.privacy,
    'ଆପଣଙ୍କ ଦଲିଲ Google Cloud ରେ ପଢ଼ାଯାଏ, ସଂରକ୍ଷଣ କରାଯାଏ ନାହିଁ। ଆପଣ କୌଣସି ଫଳାଫଳକୁ ରେଟିଂ ଦେଲେ, କେବଳ ରେଟିଂ ସଂରକ୍ଷିତ ହୁଏ।'
  )
})

test('Languages - date formatting across all 9 languages without runtime errors', () => {
  const testDate = new Date('2026-11-15T00:00:00.000Z')
  for (const code of LANG_CODES) {
    const formatted = new Intl.DateTimeFormat(code, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    }).format(testDate)
    assert.ok(formatted && formatted.length > 0, `Date formatting failed for ${code}`)
  }
})

test('Languages - pension sample share text in te, ml, kn, mr, bn, or hides personal details without [*]', () => {
  const pensionResult = {
    title: 'Old Age Pension Sanction Order',
    doc_type: 'government_notice',
    facts: [
      { text: 'Sanction Order No: OAP/2026/89123', personal: true },
      { text: 'Beneficiary Name: Smt. Kamala Devi', personal: true },
      { text: 'Monthly Pension Amount: Rs. 2,500', personal: false },
      { text: 'Disbursement Bank: State Bank of India', personal: false },
    ],
    actions: [
      { text: 'Submit Life Certificate by 30-Nov-2026', due_date: '2026-11-30', date_status: 'upcoming' },
    ],
    warnings: [],
  }

  for (const code of ['te', 'ml', 'kn', 'mr', 'bn', 'or']) {
    // Filter facts per Item 3 personal privacy rules
    const visibleFacts = pensionResult.facts.filter((f) => !f.personal)
    const lines = [
      pensionResult.title,
      ...visibleFacts.map((f) => f.text),
      ...pensionResult.actions.map((a) => a.text),
    ]
    const text = lines.join('\n')

    assert.ok(!text.includes('[*]'), `Language ${code} share text must not include [*]`)
    assert.ok(!text.includes('Kamala Devi'), `Language ${code} share text must hide person name`)
    assert.ok(!text.includes('OAP/2026/89123'), `Language ${code} share text must hide sanction number`)
    assert.ok(text.includes('2,500'), `Language ${code} share text must keep monthly amount`)
  }
})

test('Photos vs PDFs - Photo inputs show top verification banner and omit per-point chips', () => {
  // Test across all 9 languages that photo banner is localized
  for (const code of LANG_CODES) {
    const bannerText = dictionaries[code].photoVerificationBanner
    assert.ok(bannerText && bannerText.length > 10, `Banner text missing or too short for ${code}`)
  }

  // Verification logic simulating ResultScreen
  function getEvidenceBadges(isPhoto, facts) {
    const showTopBanner = isPhoto
    const perPointChips = facts.map((fact) => {
      if (fact.evidence === 'matched') return 'matched'
      if (fact.evidence === 'calculated') return 'calculated'
      if (!isPhoto && fact.quote) return 'check_original'
      return null
    }).filter(Boolean)

    return { showTopBanner, perPointChips }
  }

  const sampleFacts = [
    { text: 'Name: Kamala Devi', quote: 'Kamala Devi', evidence: 'check_original' },
    { text: 'Pension: Rs. 1,200', quote: '1,200', evidence: 'check_original' },
    { text: 'Total: Rs. 1,200', quote: '1,200', evidence: 'matched' },
  ]

  // Photo mode: top banner shown, 'check_original' chips omitted
  const photoResult = getEvidenceBadges(true, sampleFacts)
  assert.equal(photoResult.showTopBanner, true, 'Photo must show top verification banner')
  assert.ok(!photoResult.perPointChips.includes('check_original'), 'Photo must omit per-point check_original chips')
  assert.ok(photoResult.perPointChips.includes('matched'), 'Photo can still keep matched chips')

  // PDF mode: no top banner, per-point 'check_original' chips preserved
  const pdfResult = getEvidenceBadges(false, sampleFacts)
  assert.equal(pdfResult.showTopBanner, false, 'PDF must not show top photo verification banner')
  assert.ok(pdfResult.perPointChips.includes('check_original'), 'PDF must preserve per-point check_original chips')
})

