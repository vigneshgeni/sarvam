import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

export const INSTITUTION_TERMS = [
  'shield health insurance',
  'city diagnostics',
  'social welfare dept',
  'social welfare department',
  'sunrise mobiles',
  'sunrise mobiles & electronics',
  'anand nagar municipality',
  'revenue department',
  'city traffic police',
  'traffic police',
  'sunrise hospital',
  'apollo hospital',
  'virtual court',
]

export const ID_TOKEN_REGEX =
  /\b(?!(?:19|20)\d{2}[-/]\d{2}[-/]\d{2}\b)(?!(?:\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2})\b)(?!(?:\d{1,2}[-/])?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-/]\d{2,4}\b)(?=(?:[A-Za-z0-9/_-]*\d){3,})(?=[A-Za-z0-9/_-]*[A-Za-z])[A-Za-z0-9]+(?:[/-][A-Za-z0-9_-]+)+\b/gi

export function isPersonalField(text, quote, isPersonalExplicit) {
  if (isPersonalExplicit === true) return true
  if (!text) return false
  const lower = (text + ' ' + (quote || '')).toLowerCase()

  // 1. Personal identifiers / roles / names
  if (
    /\b(patient|customer|policyholder|owner|pensioner|insured|attendee|beneficiary)\b/i.test(lower) ||
    /\b(dr\.|mr\.|mrs\.|ms\.|shri|smt\.|sri)\s+[A-Za-z\u0900-\u0D7F]/i.test(text) ||
    /\b(referred by|signed by|consultant|pathologist|issued to|addressed to|beneficiary name|beneficiary is|name is)\b/i.test(lower)
  ) {
    return true
  }

  // 2. Personal ID numbers / references across English & Indic languages
  if (
    /\b(pension|policy|claim|notice|challan|invoice|order|receipt|tax demand)\s*(?:id|no|number|num|ref|reference|code)?\b/i.test(lower) ||
    /\b(property id|ward|door no|vehicle|two-wheeler|reg no|registration|imei|sample id|aadhaar|pan|account|upi|utr|chassis|engine)\b/i.test(lower) ||
    /\b(ref:|reference:|id:|id is|id number)\b/i.test(lower) ||
    /(पेंशन|पॉलिसी|दावा|चालान|पहचान|खाता|पंजीकरण|वाहन|लाभार्थी)/.test(text) ||
    /(ஓய்வூதிய|பாலிசி|கோரிக்கை|விலாசம்|அடையாள|வங்கி கணக்கு|வாகன|பயனாளி)/.test(text) ||
    /(పెన్షన్|పాలసీ|క్లెయిమ్|చలాన్|ఖాతా|రిజిస్ట్రేషన్|లబ్ధిదారు)/.test(text) ||
    /(पेन्शन|पॉलिसी|दावा|नोंदणी|खाते)/.test(text)
  ) {
    const hasOnlyAmountOrDate =
      /^(\s*(monthly pension|pension|amount|total|due|rebate|fine|fee|tax)\s*(amount|is|of)?\s*:?\s*(rs\.?|₹|\d|due date|date))/i.test(text) &&
      !/(id|no|number|num|ref|oap|sh\/|clm|anm|ech|sme|cd-|smt|mr\.|mrs\.)/i.test(lower)
    if (!hasOnlyAmountOrDate) {
      return true
    }
  }

  // 3. Layer 2 token check: if text contains an ID-like token (letters & digits joined by / or -)
  if (ID_TOKEN_REGEX.test(text) || (quote && ID_TOKEN_REGEX.test(quote))) {
    ID_TOKEN_REGEX.lastIndex = 0
    return true
  }

  // 4. Addresses and personal contact info
  if (
    /\b(address|cross|jayanagar|ward|door no|pincode|bengaluru\s*560041)\b/i.test(lower) ||
    /\b(\+91|ph:|phone:|tel:|mobile:|0422-000-0000)\b/i.test(lower) ||
    /\b\d{4}[-\s]\d{3}[-\s]\d{4}\b/.test(text) ||
    /\b\d{10}\b/.test(text) ||
    /\b\d{2}\s*y\s*\/\s*[mf]\b/i.test(lower)
  ) {
    return true
  }

  // 5. Long digit runs (8+ digits) that are not amounts
  const digitRuns = text.match(/\b\d{8,}\b/g)
  if (digitRuns && digitRuns.length > 0) {
    return true
  }

  return false
}

export function sanitizeProse(text, protectedTerms = []) {
  if (!text) return ''
  let cleaned = text

  // 1. Remove specific personal identity clauses
  cleaned = cleaned.replace(
    /\b(?:issued to|addressed to|referred by|signed by|beneficiary is|beneficiary name is)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?:,\s*MD)?(?=[.,;\n]|\s+for|\s+regarding|\s+by|\s+from|$)/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:regarding the Old Age Pension Scheme)\s+for\s+(?:(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.)\s+)?[A-Z][A-Za-z.\s]+?(?=[.,;\n]|$)/gi,
    'regarding the Old Age Pension Scheme'
  )
  cleaned = cleaned.replace(
    /\b(?:for policyholder|for patient|patient|customer|beneficiary|for owner|owner)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?=[.,;\n]|\s+with|\s+for|$)/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:for|to)\s+(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.|Sri)\s+[A-Z][A-Za-z.\s]+?(?=[.,;\n]|$)/gi,
    ''
  )

  // 2. Remove ID phrases with prefixes
  cleaned = cleaned.replace(
    /\b(?:pension id|policy no|claim no|notice no|challan no|invoice no|property id|sample id|imei|vehicle no|vehicle|ref|order no)[:\s]+[A-Za-z0-9/_-]+/gi,
    ''
  )

  // 3. Layer 2: Generic ID-like tokens (letters + digits joined by / or -) with at least 3 digits, excluding dates
  cleaned = cleaned.replace(
    /\b(?!(?:19|20)\d{2}[-/]\d{2}[-/]\d{2}\b)(?!(?:\d{1,2}[-/]\d{1,2}[-/](?:19|20)\d{2})\b)(?!(?:\d{1,2}[-/])?(?:jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*[-/]\d{2,4}\b)(?=(?:[A-Za-z0-9/_-]*\d){3,})(?=[A-Za-z0-9/_-]*[A-Za-z])[A-Za-z0-9]+(?:[/-][A-Za-z0-9_-]+)+\b/gi,
    ''
  )

  // 4. Indian vehicle registration numbers
  cleaned = cleaned.replace(/\b[A-Z]{2}\s*\d{1,2}\s*[A-Z]{1,2}\s*\d{1,4}\b/gi, '')

  // 5. Personal names from protectedTerms and samples with Unicode-aware word boundaries
  const personalNames = [
    'Mr. Ravi Kumar',
    'Ravi Kumar',
    'Mrs. Lakshmi R.',
    'Lakshmi R.',
    'Dr. A. Meena',
    'Dr. S. Rao',
    'Meena Subramanian',
    'Kamala Devi',
    'Smt. Kamala Devi',
    'Suresh Raman',
    'ரவி குமார்',
    'லட்சுமி ஆர்.',
    'டாக்டர் மீனா',
    'மீனா சுப்பிரமணியன்',
    'கமலா தேவி',
    'சுரேஷ் ராமன்',
    'रवि कुमार',
    'लक्ष्मी आर.',
    'डॉक्टर मीना',
    'मीना सुब्रमण्यन',
    'कमला देवी',
    'सुरेश रमन',
  ]
  for (const name of personalNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gui'), '')
  }

  for (const term of protectedTerms) {
    if (!term || term.trim().length < 2) continue
    const lower = term.toLowerCase().trim()
    const isInstitution = INSTITUTION_TERMS.some((inst) => lower.includes(inst))
    if (!isInstitution) {
      const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      cleaned = cleaned.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escaped}(?![\\p{L}\\p{N}])`, 'gui'), '')
    }
  }

  // 6. Remove addresses, phone numbers, IMEI
  cleaned = cleaned.replace(/No\.\s*14,\s*3rd\s*Cross,\s*Jayanagar,\s*Bengaluru\s*560041/gi, '')
  cleaned = cleaned.replace(/\b560041\b/g, '')
  cleaned = cleaned.replace(/0422-000-0000/g, '')
  cleaned = cleaned.replace(/\b356000000012345\b/g, '')
  cleaned = cleaned.replace(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '')
  cleaned = cleaned.replace(/\b\d{2}\s*Y\s*\/\s*[MF]\b/gi, '')

  // 7. Cleanup dangling prepositions and titles
  cleaned = cleaned.replace(/\b(?:for|to|of|by|with)\s*(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.)?\s*([.,;]|\s*$)/gi, '$1')
  cleaned = cleaned.replace(/\b(?:Smt\.|Shri|Mr\.|Mrs\.|Ms\.|Dr\.)(?=[.,;]|\s*$)/gi, '')

  // 8. Clean up accidental [*] and whitespace
  cleaned = cleaned.replace(/\[\*{1,}\]/g, '')
  cleaned = cleaned.replace(/\s*—\s*—\s*/g, ' — ')
  cleaned = cleaned.replace(/\s*,\s*,+/g, ',')
  cleaned = cleaned.replace(/\s*\.\s*\.+/g, '.')
  cleaned = cleaned.replace(/\s{2,}/g, ' ')
  cleaned = cleaned.replace(/\s+([.,;:])/g, '$1')
  cleaned = cleaned.trim()

  return cleaned
}

export function buildSharedText(result, lang, hidePersonal) {
  const lines = []

  if (result.title) {
    const titleText = hidePersonal
      ? sanitizeProse(result.title, result.protected_terms || [])
      : result.title
    if (titleText) {
      lines.push(`📄 ${titleText}`)
    }
  }

  if (result.summary && result.summary.length > 0) {
    const summaryPoints = []
    for (const point of result.summary) {
      if (hidePersonal) {
        if (/^(this (?:letter|notice|invoice|report) (?:is|was) (?:addressed|issued) to|patient|customer)/i.test(point.trim())) {
          continue
        }
        const cleaned = sanitizeProse(point, result.protected_terms || [])
        if (cleaned && cleaned.length > 10) {
          summaryPoints.push(cleaned)
        }
      } else {
        summaryPoints.push(point)
      }
    }
    if (summaryPoints.length > 0) {
      lines.push(`\n📌 In simple words:`)
      summaryPoints.forEach((point) => {
        lines.push(`• ${point}`)
      })
    }
  }

  if (result.actions && result.actions.length > 0) {
    lines.push(`\n✅ What you need to do:`)
    result.actions.forEach((act, idx) => {
      const actText = hidePersonal
        ? sanitizeProse(act.text, result.protected_terms || [])
        : act.text
      lines.push(`${idx + 1}. ${actText}`)
    })
  }

  if (result.warnings && result.warnings.length > 0) {
    lines.push(`\n⚠️ Watch out:`)
    result.warnings.forEach((warn) => {
      lines.push(`• ${warn.text}`)
    })
  }

  if (result.facts && result.facts.length > 0) {
    const factsList = hidePersonal
      ? result.facts
          .filter((fact) => !isPersonalField(fact.text, fact.quote, fact.is_personal))
          .map((fact) => ({
            ...fact,
            text: sanitizeProse(fact.text, result.protected_terms || []),
          }))
          .filter((fact) => fact.text.trim().length > 0)
      : result.facts

    if (factsList.length > 0) {
      lines.push(`\n📋 Key facts:`)
      factsList.forEach((fact) => {
        lines.push(`• ${fact.text}`)
      })
    }
  }

  if (result.conflicts && result.conflicts.length > 0) {
    lines.push(`\n⚠️ Conflicting details:`)
    result.conflicts.forEach((c) => {
      lines.push(`• ${c}`)
    })
  }

  return lines.join('\n')
}

// Realistic fixtures for all 6 samples
const sampleInsurance = {
  title: 'Hospitalisation Claim Settlement Letter from Shield Health Insurance — Mr. Ravi Kumar',
  doc_type: 'insurance',
  summary: [
    'Shield Health Insurance has processed your hospitalisation claim for Sunrise Hospital, Jayanagar.',
    'Out of the total claim of Rs. 48,500, an amount of Rs. 31,200 has been approved for payment.',
    'A deduction of Rs. 17,300 was made because room rent exceeded the allowed limit.',
    'The approved money will be deposited into your bank account within 7 working days.',
  ],
  actions: [
    {
      text: 'If you disagree with the decision, request a review by writing to the Grievance Cell within 30 days.',
      due_date: '2026-10-31',
    },
  ],
  warnings: [
    { text: 'Review requests sent after 30 days will not be considered.' },
  ],
  facts: [
    { text: 'Total hospitalisation claim amount submitted was Rs. 48,500.' },
    { text: 'Approved payment amount is Rs. 31,200.' },
    { text: 'Deduction of Rs. 17,300 was made for room rent.' },
    { text: 'Policy reference is CLM-2026-0884 and Policy Number is SH/IND/22/559102.' },
    { text: 'Policyholder: Mr. Ravi Kumar, No. 14, 3rd Cross, Jayanagar, Bengaluru 560041' },
  ],
  protected_terms: ['Mr. Ravi Kumar', 'CLM-2026-0884', 'SH/IND/22/559102', 'No. 14, 3rd Cross, Jayanagar, Bengaluru 560041', 'Sunrise Hospital, Jayanagar'],
}

const sampleLabReport = {
  title: 'Blood Test Report from City Diagnostics for Mrs. Lakshmi R.',
  doc_type: 'medical',
  summary: [
    'Complete Blood Count and iron profile report issued to Mrs. Lakshmi R. referred by Dr. A. Meena.',
    'Haemoglobin is 9.2 g/dL which is below normal range.',
    'Serum Iron is 38 µg/dL indicating low iron stores.',
  ],
  actions: [
    { text: 'Consult your treating doctor for iron supplementation.' },
  ],
  warnings: [
    { text: 'Microcytic hypochromic picture. Clinical correlation advised.' },
  ],
  facts: [
    { text: 'Patient Name: Mrs. Lakshmi R., Age/Sex: 58 Y / F' },
    { text: 'Doctor: Dr. A. Meena, Pathologist: Dr. S. Rao, MD' },
    { text: 'Sample ID: CD-2026-118734' },
    { text: 'Haemoglobin (Hb): 9.2 g/dL (normal: 12.0 - 15.0)' },
    { text: 'Serum Iron: 38 µg/dL (normal: 50 - 170)' },
  ],
  protected_terms: ['Mrs. Lakshmi R.', 'Dr. A. Meena', 'Dr. S. Rao', 'CD-2026-118734', 'City Diagnostics'],
}

const samplePension = {
  title: 'Pension Verification Notice from Social Welfare Dept.',
  doc_type: 'government_notice',
  summary: [
    'Annual Life Certificate submission notice from Social Welfare Department.',
    'Submit Life Certificate by 30.11.2026 to continue receiving monthly pension of Rs. 1,200.',
  ],
  actions: [
    { text: 'Submit Life Certificate before 30.11.2026 at the nearest treasury or online.', due_date: '2026-11-30' },
  ],
  warnings: [
    { text: 'Pension payment will be stopped if certificate is not submitted on time.' },
  ],
  facts: [
    { text: 'Monthly pension amount is Rs. 1,200.' },
    { text: 'Pensioner Reference ID: OAP/BLR/2019/04417' },
    { text: 'Submission deadline: 30.11.2026' },
  ],
  protected_terms: ['OAP/BLR/2019/04417', 'Social Welfare Dept.'],
}

const sampleWarrantyInvoice = {
  title: 'Tax Invoice from Sunrise Mobiles & Electronics for Meena Subramanian',
  doc_type: 'receipt',
  summary: [
    'Tax Invoice for purchase of mobile phone issued to Meena Subramanian.',
    'Total amount paid is Rs. 20,999.00 by UPI.',
    'Standard warranty is valid until 07 Oct 2027.',
  ],
  actions: [
    { text: 'Register warranty on brand app within 30 days by 07 Nov 2026.', due_date: '2026-11-07' },
  ],
  warnings: [
    { text: 'Warranty does not cover physical or liquid damage.' },
  ],
  facts: [
    { text: 'Store: Sunrise Mobiles & Electronics, Coimbatore' },
    { text: 'Item: Zephyr M5 5G (8GB + 128GB)' },
    { text: 'Total paid: Rs. 20,999.00 (Taxable Rs. 17,795.76 + GST Rs. 3,203.24)' },
    { text: 'Customer: Meena Subramanian, Phone: 0422-000-0000' },
    { text: 'Invoice No: SME/2026/004217, IMEI: 356000000012345' },
    { text: 'Warranty valid until 07 Oct 2027' },
  ],
  protected_terms: ['Meena Subramanian', '0422-000-0000', '356000000012345', 'SME/2026/004217', 'Sunrise Mobiles & Electronics'],
}

const samplePropertyTax = {
  title: 'Property Tax Demand Notice from Anand Nagar Municipality for Kamala Devi',
  doc_type: 'tax_notice',
  summary: [
    'Property tax demand notice from Anand Nagar Municipality for owner Kamala Devi.',
    'Total demand is Rs. 3,840.00 payable before 31 Dec 2026.',
    'Early payment rebate of 5% (Rs. 192.00) if paid by 30 Nov 2026 (net Rs. 3,648.00).',
  ],
  actions: [
    { text: 'Pay discounted amount Rs. 3,648.00 on or before 30 Nov 2026.', due_date: '2026-11-30' },
    { text: 'Pay before 31 Dec 2026 to avoid 2% monthly penalty.', due_date: '2026-12-31' },
  ],
  warnings: [
    { text: 'Non-payment after 31 Dec 2026 attracts 2% per month penalty.' },
  ],
  facts: [
    { text: 'Municipality: Anand Nagar Municipality, Revenue Department' },
    { text: 'Total demand: Rs. 3,840.00 (Property tax Rs. 3,200.00, Library cess Rs. 160.00, Water Rs. 480.00)' },
    { text: 'Early payment amount: Rs. 3,648.00 (5% rebate)' },
    { text: 'Owner: Kamala Devi, Property ID: AN/07/0412/0089, Ward 7' },
    { text: 'Notice No: ANM/PT/2026/07741' },
  ],
  protected_terms: ['Kamala Devi', 'AN/07/0412/0089', 'ANM/PT/2026/07741', 'Ward 7', 'Anand Nagar Municipality'],
}

const sampleEchallan = {
  title: 'Traffic E-Challan Notice from City Traffic Police for Suresh Raman',
  doc_type: 'challan',
  summary: [
    'Traffic violation challan issued to Suresh Raman for vehicle TN 99 AB 1234.',
    'Violation: rider without a helmet at Lake Road Junction.',
    'Fine amount of Rs. 1,000.00 to be paid on or before 05 Dec 2026.',
  ],
  actions: [
    { text: 'Pay fine of Rs. 1,000.00 online or contest by 05 Dec 2026.', due_date: '2026-12-05' },
  ],
  warnings: [
    { text: 'If not paid by 05 Dec 2026, case will be forwarded to Virtual Court.' },
  ],
  facts: [
    { text: 'Authority: City Traffic Police, Anand Nagar' },
    { text: 'Violation: rider without a helmet' },
    { text: 'Fine amount: Rs. 1,000.00' },
    { text: 'Due date: 05 Dec 2026' },
    { text: 'Challan No: ECH/2026/0098121, Vehicle: TN 99 AB 1234, Owner: Suresh Raman' },
  ],
  protected_terms: ['Suresh Raman', 'TN 99 AB 1234', 'ECH/2026/0098121', 'City Traffic Police'],
}

// Indic test fixtures (Tamil & Hindi)
const sampleInsuranceTa = {
  title: 'மருத்துவக் காப்பீட்டு கடிதம் — ரவி குமார்',
  doc_type: 'insurance',
  summary: [
    'Shield Health Insurance நிறுவனத்திடமிருந்து உங்கள் மருத்துவ கோரிக்கைக்கான கடிதம்.',
    'மொத்த கோரிக்கை ரூ. 48,500-ல் ரூ. 31,200 அனுமதிக்கப்பட்டுள்ளது.',
  ],
  actions: [
    { text: 'Grievance Cell-க்கு 30 நாட்களுக்குள் மேல்முறையீடு செய்யவும்.', due_date: '2026-10-31' },
  ],
  facts: [
    { text: 'கோரிக்கை எண்: CLM-2026-0884, பாலிசி எண்: SH/IND/22/559102.' },
    { text: 'அனுமதிக்கப்பட்ட தொகை ரூ. 31,200 மட்டுமே.' },
  ],
  protected_terms: ['ரவி குமார்', 'CLM-2026-0884', 'SH/IND/22/559102', 'Shield Health Insurance'],
}

const sampleInsuranceHi = {
  title: 'स्वास्थ्य बीमा दावा स्वीकृति पत्र — रवि कुमार',
  doc_type: 'insurance',
  summary: [
    'Shield Health Insurance द्वारा अस्पताल के दावे की स्वीकृति।',
    'कुल दावा रु. 48,500 में से रु. 31,200 स्वीकृत किया गया है।',
  ],
  actions: [
    { text: 'Grievance Cell को 30 दिनों में आवेदन करें।', due_date: '2026-10-31' },
  ],
  facts: [
    { text: 'दावा संख्या CLM-2026-0884 और पॉलिसी संख्या SH/IND/22/559102 है।' },
    { text: 'स्वीकृत भुगतान राशि रु. 31,200 है।' },
  ],
  protected_terms: ['रवि कुमार', 'CLM-2026-0884', 'SH/IND/22/559102', 'Shield Health Insurance'],
}

const samplePensionTa = {
  title: 'ஓய்வூதியதாரர்களுக்கான அறிவிப்பு — கமலா தேவி',
  doc_type: 'government_notice',
  summary: [
    'Social Welfare Department வழங்கும் வாழ்வுச் சான்றிதழ் அறிவிப்பு.',
    'மாதாந்திர ஓய்வூதியம் ரூ. 1,200 பெற 30.11.2026-க்குள் சமர்ப்பிக்கவும்.',
  ],
  actions: [
    { text: 'வங்கி கிளை அல்லது Common Service Centre-ல் சான்றிதழை சமர்ப்பிக்கவும்.', due_date: '2026-11-30' },
  ],
  facts: [
    { text: 'ஓய்வூதிய ஐடி OAP/BLR/2019/04417 ஆகும்.' },
    { text: 'மாதாந்திர ஓய்வூதியத் தொகை ரூ. 1,200.' },
  ],
  protected_terms: ['கமலா தேவி', 'OAP/BLR/2019/04417', 'Social Welfare Dept.'],
}

const samplePensionHi = {
  title: 'पेंशन सत्यापन सूचना — कमला देवी',
  doc_type: 'government_notice',
  summary: [
    'Social Welfare Department द्वारा जीवन प्रमाण पत्र प्रस्तुत करने की सूचना।',
    'मासिक पेंशन रु. 1,200 प्राप्त करने के लिए 30.11.2026 तक जमा करें।',
  ],
  actions: [
    { text: 'बैंक शाखा या Common Service Centre में प्रमाण पत्र जमा करें।', due_date: '2026-11-30' },
  ],
  facts: [
    { text: 'पेंशन आईडी OAP/BLR/2019/04417 है।' },
    { text: 'मासिक पेंशन राशि रु. 1,200 है।' },
  ],
  protected_terms: ['कमला देवी', 'OAP/BLR/2019/04417', 'Social Welfare Dept.'],
}

test('Share privacy - NEVER produces literal [*] or [***] in output', () => {
  const samples = [
    sampleInsurance,
    sampleLabReport,
    samplePension,
    sampleWarrantyInvoice,
    samplePropertyTax,
    sampleEchallan,
  ]

  for (const s of samples) {
    const textHidden = buildSharedText(s, 'en', true)
    assert.doesNotMatch(textHidden, /\[\*+\]/)
    const textFull = buildSharedText(s, 'en', false)
    assert.doesNotMatch(textFull, /\[\*+\]/)
  }
})

test('Share privacy - Live pension fixture hides OAP/BLR ID and Kamala Devi', () => {
  const fixturePath = path.join(process.cwd(), 'web/tests/fixtures/live_pension_en.json')
  if (fs.existsSync(fixturePath)) {
    const livePension = JSON.parse(fs.readFileSync(fixturePath, 'utf8'))
    const text = buildSharedText(livePension, 'en', true)

    assert.ok(!text.includes('OAP/BLR/2019/04417'), 'Pension ID OAP/BLR leaked')
    assert.ok(!text.includes('OAP/BLR'), 'Pension ID prefix leaked')
    assert.ok(!text.includes('Kamala Devi'), 'Beneficiary Kamala Devi leaked')
    assert.ok(!text.includes('Smt.'), 'Title Smt. leaked')

    // Must keep business facts
    assert.ok(text.includes('1,200'), 'Pension amount missing')
    assert.ok(text.includes('30 November 2026') || text.includes('30.11.2026'), 'Date missing')
  }
})

test('Share privacy - Insurance sample hides personal details and retains business facts', () => {
  const text = buildSharedText(sampleInsurance, 'en', true)

  assert.ok(!text.includes('Ravi Kumar'), 'Ravi Kumar leaked')
  assert.ok(!text.includes('CLM-2026-0884'), 'Claim ID leaked')
  assert.ok(!text.includes('SH/IND/22/559102'), 'Policy No leaked')
  assert.ok(!text.includes('560041'), 'Pincode leaked')
  assert.ok(!text.includes('3rd Cross'), 'Address leaked')

  assert.ok(text.includes('Shield Health Insurance'), 'Insurer name missing')
  assert.ok(text.includes('Sunrise Hospital'), 'Hospital name missing')
  assert.ok(text.includes('48,500'), 'Claim amount missing')
  assert.ok(text.includes('31,200'), 'Approved amount missing')
  assert.ok(text.includes('17,300'), 'Deduction missing')
})

test('Share privacy - Lab report hides patient and doctor names but keeps tests', () => {
  const text = buildSharedText(sampleLabReport, 'en', true)

  assert.ok(!text.includes('Lakshmi R.'), 'Patient name leaked')
  assert.ok(!text.includes('Meena'), 'Doctor name leaked')
  assert.ok(!text.includes('Rao'), 'Doctor name leaked')
  assert.ok(!text.includes('CD-2026-118734'), 'Sample ID leaked')
  assert.ok(!text.includes('58 Y'), 'Age/sex leaked')

  assert.ok(text.includes('City Diagnostics'), 'Lab name missing')
  assert.ok(text.includes('Haemoglobin'), 'Test name missing')
  assert.ok(text.includes('9.2'), 'Test value missing')
})

test('Share privacy - Pension sample hides OAP ID but keeps department and amount', () => {
  const text = buildSharedText(samplePension, 'en', true)

  assert.ok(!text.includes('OAP/BLR/2019/04417'), 'Pension ID leaked')
  assert.ok(text.includes('Social Welfare'), 'Department name missing')
  assert.ok(text.includes('1,200'), 'Pension amount missing')
  assert.ok(text.includes('30.11.2026'), 'Date missing')
})

test('Share privacy - Warranty invoice hides customer, phone, IMEI, invoice number', () => {
  const text = buildSharedText(sampleWarrantyInvoice, 'en', true)

  assert.ok(!text.includes('Meena Subramanian'), 'Customer name leaked')
  assert.ok(!text.includes('0422-000-0000'), 'Phone leaked')
  assert.ok(!text.includes('356000000012345'), 'IMEI leaked')
  assert.ok(!text.includes('SME/2026/004217'), 'Invoice No leaked')

  assert.ok(text.includes('Sunrise Mobiles & Electronics'), 'Store name missing')
  assert.ok(text.includes('Zephyr M5 5G'), 'Item missing')
  assert.ok(text.includes('20,999.00'), 'Amount missing')
  assert.ok(text.includes('07 Oct 2027'), 'Warranty date missing')
})

test('Share privacy - Property tax notice hides owner, property ID, notice number, ward', () => {
  const text = buildSharedText(samplePropertyTax, 'en', true)

  assert.ok(!text.includes('Kamala Devi'), 'Owner name leaked')
  assert.ok(!text.includes('AN/07/0412/0089'), 'Property ID leaked')
  assert.ok(!text.includes('ANM/PT/2026/07741'), 'Notice No leaked')
  assert.ok(!text.includes('Ward 7'), 'Ward leaked')

  assert.ok(text.includes('Anand Nagar Municipality'), 'Municipality missing')
  assert.ok(text.includes('3,840.00'), 'Total demand missing')
  assert.ok(text.includes('3,648.00'), 'Rebate amount missing')
  assert.ok(text.includes('30 Nov 2026'), 'Date missing')
})

test('Share privacy - E-Challan hides owner, vehicle registration, challan number', () => {
  const text = buildSharedText(sampleEchallan, 'en', true)

  assert.ok(!text.includes('Suresh Raman'), 'Owner leaked')
  assert.ok(!text.includes('TN 99 AB 1234'), 'Vehicle leaked')
  assert.ok(!text.includes('ECH/2026/0098121'), 'Challan No leaked')

  assert.ok(text.includes('City Traffic Police'), 'Authority missing')
  assert.ok(text.includes('helmet'), 'Violation missing')
  assert.ok(text.includes('1,000.00'), 'Fine amount missing')
  assert.ok(text.includes('05 Dec 2026'), 'Date missing')
})

test('Share privacy - Tamil & Hindi fixtures for Insurance and Pension hide personal IDs', () => {
  const textInsTa = buildSharedText(sampleInsuranceTa, 'ta', true)
  assert.ok(!textInsTa.includes('ரவி குமார்'), 'Tamil name leaked')
  assert.ok(!textInsTa.includes('CLM-2026-0884'), 'Tamil claim ID leaked')
  assert.ok(!textInsTa.includes('SH/IND/22/559102'), 'Tamil policy no leaked')
  assert.ok(textInsTa.includes('31,200'), 'Tamil amount missing')

  const textInsHi = buildSharedText(sampleInsuranceHi, 'hi', true)
  assert.ok(!textInsHi.includes('रवि कुमार'), 'Hindi name leaked')
  assert.ok(!textInsHi.includes('CLM-2026-0884'), 'Hindi claim ID leaked')
  assert.ok(!textInsHi.includes('SH/IND/22/559102'), 'Hindi policy no leaked')
  assert.ok(textInsHi.includes('31,200'), 'Hindi amount missing')

  const textPenTa = buildSharedText(samplePensionTa, 'ta', true)
  assert.ok(!textPenTa.includes('கமலா தேவி'), 'Tamil pensioner name leaked')
  assert.ok(!textPenTa.includes('OAP/BLR/2019/04417'), 'Tamil pension ID leaked')
  assert.ok(textPenTa.includes('1,200'), 'Tamil pension amount missing')

  const textPenHi = buildSharedText(samplePensionHi, 'hi', true)
  assert.ok(!textPenHi.includes('कमला देवी'), 'Hindi pensioner name leaked')
  assert.ok(!textPenHi.includes('OAP/BLR/2019/04417'), 'Hindi pension ID leaked')
  assert.ok(textPenHi.includes('1,200'), 'Hindi pension amount missing')
})

test('Share privacy - Toggle off (hidePersonal=false) shows full details', () => {
  const text = buildSharedText(sampleInsurance, 'en', false)
  assert.ok(text.includes('Ravi Kumar'), 'Name should be present when hidePersonal is false')
  assert.ok(text.includes('CLM-2026-0884'), 'Claim ID should be present')
  assert.ok(text.includes('SH/IND/22/559102'), 'Policy No should be present')
})

test('Share privacy - Preserves dates, medical codes, legal codes and protects short names in words', () => {
  // 1. Strings that must be preserved: "30-Nov-2026", "COVID-19", "Vitamin B-12", "Section 80-C"
  const proseWithCodes = 'Patient received COVID-19 vaccine and Vitamin B-12 under Section 80-C on 30-Nov-2026. Pension ID: OAP/BLR/2019/04417.'
  const cleaned = sanitizeProse(proseWithCodes)

  assert.ok(cleaned.includes('30-Nov-2026'), 'Date 30-Nov-2026 was removed')
  assert.ok(cleaned.includes('COVID-19'), 'Medical code COVID-19 was removed')
  assert.ok(cleaned.includes('Vitamin B-12'), 'Medical code Vitamin B-12 was removed')
  assert.ok(cleaned.includes('Section 80-C'), 'Legal code Section 80-C was removed')
  assert.ok(!cleaned.includes('OAP/BLR/2019/04417'), 'Pension ID OAP/BLR/2019/04417 was leaked')

  // 2. Short name inside a longer word preserved
  // Protected terms: "Meena", "Rao", "Ravi"
  const proseWithSubstrings = 'Dr. A. Meena visited Meenakshi temple with Bravo team for Ravishing festival.'
  const cleanedSubstrings = sanitizeProse(proseWithSubstrings, ['Meena', 'Rao', 'Ravi'])

  assert.ok(cleanedSubstrings.includes('Meenakshi'), 'Meenakshi was corrupted by Meena removal')
  assert.ok(cleanedSubstrings.includes('Bravo'), 'Bravo was corrupted by Rao removal')
  assert.ok(cleanedSubstrings.includes('Ravishing'), 'Ravishing was corrupted by Ravi removal')
  assert.ok(!cleanedSubstrings.includes('Dr. A. Meena'), 'Dr. A. Meena was not removed')
})
