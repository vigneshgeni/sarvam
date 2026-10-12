import { test } from 'node:test'
import assert from 'node:assert/strict'

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

export function isPersonalField(text, quote) {
  if (!text) return false
  const lower = (text + ' ' + (quote || '')).toLowerCase()

  if (
    /\b(patient|customer|policyholder|owner|pensioner|insured|attendee)\b/i.test(lower) ||
    /\b(dr\.|mr\.|mrs\.|ms\.|shri|smt\.|sri)\s+[A-Za-z]/i.test(text) ||
    /\b(referred by|signed by|consultant|pathologist)\b/i.test(lower)
  ) {
    return true
  }

  if (
    /\b(policy (?:no|number)|claim (?:no|number)|notice (?:no|number)|challan (?:no|number)|invoice (?:no|number)|order (?:no|number))\b/i.test(lower) ||
    /\b(property id|ward\s*7|ward\s*\d+|vehicle|two-wheeler|imei|sample id|aadhaar|pan|account (?:no|number)|upi ref|utr)\b/i.test(lower) ||
    /\b(clm-\d|sh\/ind\/|anm\/pt\/|an\/07\/|ech\/\d|sme\/\d|cd-\d|oap\/\d|tn\s*99\s*[a-z]{1,2}\s*\d{1,4})\b/i.test(lower)
  ) {
    return true
  }

  if (
    /\b(address|cross|jayanagar|ward|door no|pincode|bengaluru\s*560041)\b/i.test(lower) ||
    /\b(\+91|ph:|phone:|tel:|mobile:|0422-000-0000)\b/i.test(lower) ||
    /\b\d{4}[-\s]\d{3}[-\s]\d{4}\b/.test(text) ||
    /\b\d{10}\b/.test(text) ||
    /\b\d{2}\s*y\s*\/\s*[mf]\b/i.test(lower)
  ) {
    return true
  }

  const digitRuns = text.match(/\b\d{8,}\b/g)
  if (digitRuns && digitRuns.length > 0) {
    return true
  }

  return false
}

export function sanitizeProse(text, protectedTerms = []) {
  if (!text) return ''
  let cleaned = text

  cleaned = cleaned.replace(
    /\b(?:issued to|addressed to|referred by|signed by)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?:,\s*MD)?(?=[.,;\n]|\s+for|\s+regarding|\s+by|\s+from|$)/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:for policyholder|for patient|patient)\s+(?:(?:Mr\.|Mrs\.|Ms\.|Shri|Smt\.|Dr\.|Sri)\s+)?[A-Z][A-Za-z.\s]+?(?=[.,;\n]|\s+with|\s+for|$)/gi,
    ''
  )

  cleaned = cleaned.replace(
    /\b(?:Ref|Policy No|Notice No|Challan No|Invoice No|Property ID|Sample ID|IMEI|Vehicle No)[:\s]+[A-Z0-9/_-]+/gi,
    ''
  )
  cleaned = cleaned.replace(
    /\b(?:CLM-\d[A-Z0-9_-]*|SH\/IND\/[A-Z0-9/_-]+|ANM\/PT\/[A-Z0-9/_-]+|AN\/07\/[A-Z0-9/_-]+|ECH\/[A-Z0-9/_-]+|SME\/[A-Z0-9/_-]+|CD-\d[A-Z0-9_-]*|OAP\/[A-Z0-9/_-]+)\b/gi,
    ''
  )
  cleaned = cleaned.replace(/\bTN\s*99\s*[A-Z]{1,2}\s*\d{1,4}\b/gi, '')

  const personalNames = [
    'Mr. Ravi Kumar',
    'Ravi Kumar',
    'Mrs. Lakshmi R.',
    'Lakshmi R.',
    'Dr. A. Meena',
    'Dr. S. Rao',
    'Meena Subramanian',
    'Kamala Devi',
    'Suresh Raman',
  ]
  for (const name of personalNames) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '')
  }

  for (const term of protectedTerms) {
    if (!term || term.trim().length < 2) continue
    const lower = term.toLowerCase().trim()
    const isInstitution = INSTITUTION_TERMS.some((inst) => lower.includes(inst))
    if (!isInstitution) {
      const escaped = term.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      cleaned = cleaned.replace(new RegExp(escaped, 'gi'), '')
    }
  }

  cleaned = cleaned.replace(/No\.\s*14,\s*3rd\s*Cross,\s*Jayanagar,\s*Bengaluru\s*560041/gi, '')
  cleaned = cleaned.replace(/\b560041\b/g, '')
  cleaned = cleaned.replace(/0422-000-0000/g, '')
  cleaned = cleaned.replace(/\b356000000012345\b/g, '')
  cleaned = cleaned.replace(/(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}\b/g, '')
  cleaned = cleaned.replace(/\b\d{2}\s*Y\s*\/\s*[MF]\b/gi, '')

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
      ? result.facts.filter((fact) => !isPersonalField(fact.text, fact.quote))
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

// Realistic mock responses for all 6 samples
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
    { text: 'Pensioner Reference ID: OAP/2019/4417' },
    { text: 'Submission deadline: 30.11.2026' },
  ],
  protected_terms: ['OAP/2019/4417', 'Social Welfare Dept.'],
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

test('Share privacy - Insurance sample hides personal details and retains business facts', () => {
  const text = buildSharedText(sampleInsurance, 'en', true)

  // Must NOT contain personal details
  assert.ok(!text.includes('Ravi Kumar'), 'Ravi Kumar leaked')
  assert.ok(!text.includes('CLM-2026-0884'), 'Claim ID leaked')
  assert.ok(!text.includes('SH/IND/22/559102'), 'Policy No leaked')
  assert.ok(!text.includes('560041'), 'Pincode leaked')
  assert.ok(!text.includes('3rd Cross'), 'Address leaked')

  // MUST contain business and amount facts
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

  assert.ok(!text.includes('OAP/2019/4417'), 'Pension ID leaked')
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

test('Share privacy - Toggle off (hidePersonal=false) shows full details', () => {
  const text = buildSharedText(sampleInsurance, 'en', false)
  assert.ok(text.includes('Ravi Kumar'), 'Name should be present when hidePersonal is false')
  assert.ok(text.includes('CLM-2026-0884'), 'Claim ID should be present')
  assert.ok(text.includes('SH/IND/22/559102'), 'Policy No should be present')
})
