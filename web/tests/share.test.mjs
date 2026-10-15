import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  INSTITUTION_TERMS,
  ID_TOKEN_REGEX,
  maskNameWord,
  maskPersonName,
  maskPhone,
  maskEmail,
  maskIdToken,
  isPersonalField,
  maskStringWithSegments,
  sanitizeProse,
  buildShare,
  buildSharedText,
  redactResult,
  getHiddenLabel,
} from '../src/utils/shareCore.js'

// --- Unit tests for exact mask formats (1A §3) ---

test('1A Mask format - Person names (single, multiple, titles, initials, Indic)', () => {
  // English titles and names
  assert.equal(maskPersonName('Ravi Kumar'), 'R*** K****')
  assert.equal(maskPersonName('Mr. Ravi Kumar'), 'Mr. R*** K****')
  assert.equal(maskPersonName('Mrs. Lakshmi R.'), 'Mrs. L****** R.')
  assert.equal(maskPersonName('Dr. A. Meena'), 'Dr. A. M****')
  assert.equal(maskPersonName('Dr. S. Rao'), 'Dr. S. R**')
  assert.equal(maskPersonName('Mr. Suresh Babu'), 'Mr. S***** B***')
  assert.equal(maskPersonName('Mr. Prakash N.'), 'Mr. P****** N.')
  assert.equal(maskPersonName('Ms. Meera Iyer'), 'Ms. M**** I***')
  assert.equal(maskPersonName('Shri Anand Rao'), 'Shri A**** R**')
  assert.equal(maskPersonName('Shri Karthik S.'), 'Shri K****** S.')
  assert.equal(maskPersonName('Ravi'), 'R***') // first name alone

  // Indic names
  assert.equal(maskPersonName('ரவி குமார்'), 'ர** கு****')
  assert.equal(maskPersonName('ரவி'), 'ர**')
  assert.equal(maskPersonName('रवि कुमार'), 'र** कु***')
  assert.equal(maskPersonName('रवि'), 'र**')
})

test('1A Mask format - Phone numbers in any format and native digits -> **********', () => {
  assert.equal(maskPhone('+91 98765 43210'), '**********')
  assert.equal(maskPhone('080 0000 0000'), '**********')
  assert.equal(maskPhone('080 2222 3344'), '**********')
  assert.equal(maskPhone('080 1111 2222'), '**********')
  assert.equal(maskPhone('9876543210'), '**********')
  assert.equal(maskPhone('0422-000-0000'), '**********')
  assert.equal(maskPhone('९८७६५४३२१०'), '**********')
  assert.equal(maskPhone('௯௮௭௬௫௪௩௨௧௦'), '**********')

  const textWithPhones = 'Call 080 2222 3344 or mobile +91 98765 43210 for help.'
  const res = maskStringWithSegments(textWithPhones)
  assert.ok(res.text.includes('Call ********** or mobile ********** for help.'))
})

test('1A Mask format - IDs keep separators and last 3 characters', () => {
  assert.equal(maskIdToken('SH/IND/22/559102'), 'SH/***/**/**102')
  assert.equal(maskIdToken('CLM-2026-0884'), 'CLM-****-**884')
  assert.equal(maskIdToken('CD-2026-11873'), 'CD-****-**873')
  assert.equal(maskIdToken('GL-2026-55821'), 'GL-****-**821')
  assert.equal(maskIdToken('GLD/B/2026/3307'), 'GLD/***/**/**307')
  assert.equal(maskIdToken('OAP/BLR/2026/8841'), 'OAP/***/**/**841')
  assert.equal(maskIdToken('ECH-2026-33918'), 'ECH-****-**918')
  assert.equal(maskIdToken('INV-2026-9021'), 'INV-****-**021')
  assert.equal(maskIdToken('TAX/2026/7712'), 'TAX/***/**/**712')
  assert.equal(maskIdToken('PID-2026-4401'), 'PID-****-**401')
  assert.equal(maskIdToken('1234567/89'), '******7/89')
  assert.equal(maskIdToken('ABCDE1234F'), '*******34F')
  assert.equal(maskIdToken('356000000012345'), '************345')
  assert.equal(maskIdToken('KA 05 MN 4821'), 'KA ** ** *821')
})

test('1A Mask format - Emails -> r***@****.com', () => {
  assert.equal(maskEmail('meera.iyer@gmail.com'), 'm***@****.com')
  assert.equal(maskEmail('advocate.rao@courtmail.com'), 'a***@****.com')
  assert.equal(maskEmail('ravi@example.com'), 'r***@****.com')
})

test('1A Mask format - Home addresses and dates of birth -> [hidden] (localised)', () => {
  assert.equal(getHiddenLabel('en'), '[hidden]')
  assert.equal(getHiddenLabel('ta'), '[மறைக்கப்பட்டது]')
  assert.equal(getHiddenLabel('hi'), '[छिपाया गया]')

  const addrText = 'Resident at No. 14, 3rd Cross, Jayanagar, Bengaluru 560041, Age: 48 Y / M.'
  const resEn = maskStringWithSegments(addrText, [], 'en')
  assert.ok(resEn.text.includes('[hidden]'))
  assert.ok(!resEn.text.includes('No. 14, 3rd Cross'))
  assert.ok(!resEn.text.includes('48 Y / M'))

  const resTa = maskStringWithSegments(addrText, [], 'ta')
  assert.ok(resTa.text.includes('[மறைக்கப்பட்டது]'))
})

test('a date of birth in a sentence is hidden and an ordinary date stays', () => {
  const prose =
    'The date of birth is 15 June 1992. DOB: 15/06/1992. She was born on 15th June 1992. Submit the form by 30 November 2026.'
  const hidden = maskStringWithSegments(prose, [], 'en')
  assert.equal(hidden.text.includes('15 June 1992'), false)
  assert.equal(hidden.text.includes('15/06/1992'), false)
  assert.equal(hidden.text.includes('15th June 1992'), false)
  assert.ok(hidden.text.includes('[hidden]'))
  assert.ok(hidden.text.includes('30 November 2026'))

  const consumer = maskStringWithSegments('Date of birth of the consumer is 15 June 1992. Pay by 30 November 2026.', [], 'en')
  assert.equal(consumer.text.includes('15 June 1992'), false)
  assert.ok(consumer.text.includes('30 November 2026'))

  const missed = maskStringWithSegments('Date of birth is not printed. Pay by 12 March 2026.', [], 'en')
  assert.ok(missed.text.includes('12 March 2026'))

  const hindi = maskStringWithSegments('जन्म तिथि: 15/06/1992', [], 'hi')
  assert.equal(hindi.text.includes('15/06/1992'), false)
  assert.ok(hindi.text.includes('[छिपाया गया]'))

  const tamil = maskStringWithSegments('பிறந்த தேதி: 15/06/1992', [], 'ta')
  assert.equal(tamil.text.includes('15/06/1992'), false)
  assert.ok(tamil.text.includes('[மறைக்கப்பட்டது]'))

  const shared = buildShare(
    {
      title: 'KYC form',
      doc_type: 'other',
      summary: ['The payment date is 15 June 1992. The appointment is on 12 March 2026.'],
      facts: [{ text: 'Date of birth of the consumer is 15/06/1992.' }],
      source_text: 'Date of Birth: 15/06/1992',
    },
    { hidePersonal: true, lang: 'en' }
  )
  assert.equal(shared.text.includes('15 June 1992'), false)
  assert.equal(shared.text.includes('15/06/1992'), false)
  assert.ok(shared.text.includes('[hidden]'))
  assert.ok(shared.text.includes('12 March 2026'))
  assert.equal(shared.text.includes('Date of Birth: 15/06/1992'), false)

  const open = buildShare(
    { title: 'KYC form', doc_type: 'other', summary: ['Date of birth: 04-Aug-1990.'] },
    { hidePersonal: false, lang: 'en' }
  )
  assert.ok(open.text.includes('04-Aug-1990'))
})

test('birth labels in the other six languages hide the date', () => {
  const cases = [
    ['te', 'పుట్టిన తేదీ: 15/06/1992. చెల్లింపు 30 November 2026.'],
    ['ml', 'ജനനത്തീയതി: 15/06/1992. അവസാന തീയതി 30 November 2026.'],
    ['kn', 'ಹುಟ್ಟಿದ ದಿನಾಂಕ: 15/06/1992. ಪಾವತಿ 30 November 2026.'],
    ['mr', 'जन्मतारीख: 15/06/1992. भरणा 30 November 2026.'],
    ['bn', 'জন্ম তারিখ: 15/06/1992. পরিশোধ 30 November 2026.'],
    ['or', 'ଜନ୍ମ ତାରିଖ: 15/06/1992. ଦେୟ 30 November 2026.'],
  ]
  for (const [lang, prose] of cases) {
    const hidden = maskStringWithSegments(prose, [], lang)
    assert.equal(hidden.text.includes('15/06/1992'), false, lang)
    assert.ok(hidden.text.includes('30 November 2026'), lang)
  }

  const shared = buildShare(
    {
      title: 'Form',
      doc_type: 'other',
      language: 'te',
      summary: ['చెల్లింపు తేదీ 15 June 1992.'],
      facts: [{ text: 'పుట్టిన తేదీ: 15/06/1992.' }],
    },
    { hidePersonal: true, lang: 'te' }
  )
  assert.equal(shared.text.includes('15 June 1992'), false)
  assert.equal(shared.text.includes('15/06/1992'), false)
})

test('share hides a protected name, a dropped initial, and a rewritten name in every language', () => {
  const cases = [
    ['ta', 'பெயர்: ராவி. Dr. Menon வந்தார். தொகை 1,200.'],
    ['hi', 'नाम: रवि. Dr. Menon आया. राशि 1,200.'],
    ['te', 'పేరు: రవి గారు. Dr. Menon వచ్చారు. మొత్తం 1,200.'],
    ['ml', 'പേര്: രവി. Dr. Menon വന്നു. തുക 1,200.'],
    ['kn', 'ಹೆಸರು: ರವಿ ಅವರು. Dr. Menon ಬಂದರು. ಮೊತ್ತ 1,200.'],
    ['mr', 'नाव: रवि. Dr. Menon आला. रक्कम 1,200.'],
    ['bn', 'নাম: রবি. Dr. Menon এলেন. পরিমাণ 1,200.'],
    ['or', 'ନାମ: ରବି. Dr. Menon ଆସିଲେ. ରାଶି 1,200.'],
  ]
  for (const [lang, prose] of cases) {
    const hidden = maskStringWithSegments(prose, ['Mr. Ravi Kumar', 'Dr. K. Menon'], lang)
    assert.equal(hidden.text.includes('Menon'), false, lang)
    assert.equal(hidden.text.includes('1,200'), true, lang)
    assert.equal(/ராவி|रवि|రవి|രവി|ರವಿ|রবি|ରବି/.test(hidden.text), false, lang)
  }
})

test('tamil share hides a latin name in a tamil sentence and a transliterated name', () => {
  const prose =
    'பெயர் திரு. Ravi Kumar அவர்கள். Dr. Menon அவர்கள் பார்த்தார். ராவி குமார் அவர்கள் வந்தார். பணம் ரூ. 1,200.'
  const hidden = maskStringWithSegments(prose, ['Mr. Ravi Kumar', 'Dr. K. Menon'], 'ta')
  assert.equal(hidden.text.includes('Ravi Kumar'), false)
  assert.equal(hidden.text.includes('Menon'), false)
  assert.equal(hidden.text.includes('ராவி குமார்'), false)
  assert.ok(hidden.text.includes('1,200'))
  assert.ok(hidden.text.includes('R***'))
})

// --- All 11 sample fixtures (fictional) ---

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
  title: 'Blood Test Report from City Diagnostics for Mr. Suresh Babu',
  doc_type: 'medical',
  summary: [
    'Blood test from City Diagnostics: 2 values are marked outside the normal range.',
    'Haemoglobin is 11.2 g/dL (range 13.0 – 17.0) Low.',
    'Fasting blood sugar is 126 mg/dL (range 70 – 100) High.',
    'Total cholesterol is 182 mg/dL In range.',
  ],
  actions: [
    { text: 'Please consult your doctor for follow-up of the flagged values.' },
  ],
  warnings: [
    { text: 'Not a diagnosis. Clinical correlation with treating physician advised.' },
  ],
  facts: [
    { text: 'Patient Name: Mr. Suresh Babu, 48 Y / M' },
    { text: 'Referred by Dr. A. Rao, Lab No. CD-2026-11873' },
    { text: 'Sample collected 08 Oct 2026, report date 09 Oct 2026' },
    { text: 'Haemoglobin: 11.2 g/dL, Fasting blood sugar: 126 mg/dL, Total cholesterol: 182 mg/dL' },
  ],
  places: [
    { label: 'Lab address', address: 'City Diagnostics, 2nd Main, Indiranagar, Bengaluru 560038' },
  ],
  contacts: [
    { label: 'Lab phone', value: '080 0000 0000' },
  ],
  protected_terms: ['Mr. Suresh Babu', 'Dr. A. Rao', 'CD-2026-11873', 'City Diagnostics', '080 0000 0000'],
}

const samplePension = {
  title: 'Pension Verification Notice from Social Welfare Dept. for Smt. Kamala Devi',
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
    { text: 'Beneficiary: Smt. Kamala Devi, Door No. 12, 4th Cross, Malleshwaram, Bengaluru 560003' },
    { text: 'Monthly pension amount is Rs. 1,200.' },
    { text: 'Pensioner Reference ID: OAP/BLR/2026/8841' },
    { text: 'Submission deadline: 30.11.2026' },
  ],
  protected_terms: ['Smt. Kamala Devi', 'OAP/BLR/2026/8841', 'Social Welfare Dept.'],
}

const sampleWarrantyInvoice = {
  title: 'Tax Invoice from Sunrise Mobiles & Electronics for Suresh Raman',
  doc_type: 'receipt',
  summary: [
    'Tax Invoice for purchase of mobile phone issued to Suresh Raman.',
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
    { text: 'Customer: Suresh Raman, Phone: 98765 43210' },
    { text: 'Invoice No: INV-2026-9021, IMEI: 356000000012345' },
    { text: 'Item: Galaxy A15' },
  ],
  protected_terms: ['Suresh Raman', '98765 43210', '356000000012345', 'INV-2026-9021', 'Sunrise Mobiles & Electronics'],
}

const samplePropertyTax = {
  title: 'Property Tax Demand Notice from Anand Nagar Municipality for Mrs. Lakshmi R.',
  doc_type: 'tax_receipt',
  summary: [
    'Property tax demand notice from Anand Nagar Municipality for owner Mrs. Lakshmi R.',
    'Total demand is Rs. 3,840.00 payable before 31 Dec 2026.',
    'Early payment rebate of 5% (Rs. 192.00) if paid by 30 Nov 2026 (net Rs. 3,648.00).',
  ],
  actions: [
    { text: 'Pay discounted amount of Rs. 3,648.00 before 30 Nov 2026.', due_date: '2026-11-30' },
  ],
  warnings: [
    { text: 'Late fee of 2% per month will be charged after 31 Dec 2026.' },
  ],
  facts: [
    { text: 'Owner: Mrs. Lakshmi R., Door No. 8, 2nd Main, Jayanagar, Ward 152' },
    { text: 'Property ID: PID-2026-4401, Notice No: TAX/2026/7712' },
    { text: 'Full tax amount: Rs. 3,840.00, Net rebate amount: Rs. 3,648.00' },
  ],
  protected_terms: ['Mrs. Lakshmi R.', 'PID-2026-4401', 'TAX/2026/7712', 'Anand Nagar Municipality'],
}

const sampleEChallan = {
  title: 'Traffic Violation Notice from City Traffic Police — Ravi Kumar',
  doc_type: 'challan',
  summary: [
    'Traffic violation notice issued to vehicle owner Ravi Kumar for riding without helmet.',
    'Fine amount of Rs. 1,000 must be paid by 05 Dec 2026.',
  ],
  actions: [
    { text: 'Pay fine of Rs. 1,000 on traffic portal or contest in Virtual Court by 05 Dec 2026.', due_date: '2026-12-05' },
  ],
  warnings: [
    { text: 'Unpaid challans will be transferred to Virtual Court for proceedings.' },
  ],
  facts: [
    { text: 'Challan No: ECH-2026-33918' },
    { text: 'Vehicle Reg: KA 05 MN 4821' },
    { text: 'Owner Name: Ravi Kumar' },
    { text: 'Offence: Riding two-wheeler without helmet (Section 129)' },
    { text: 'Fine: Rs. 1,000, Due date: 05 Dec 2026' },
  ],
  protected_terms: ['Ravi Kumar', 'ECH-2026-33918', 'KA 05 MN 4821', 'City Traffic Police'],
}

const samplePrescription = {
  title: 'Medical Prescription from Shanthi Family Clinic for Lakshmi Narayan',
  doc_type: 'medical',
  summary: [
    '3 medicines prescribed, for 5 to 7 days.',
    'Follow up review on 20/10/2026.',
  ],
  actions: [
    { text: 'Review on 20/10/2026 at Shanthi Family Clinic.', due_date: '2026-10-20' },
  ],
  warnings: [
    { text: 'Not medical advice. Check against prescription before taking.' },
  ],
  facts: [
    { text: 'Patient: Lakshmi Narayan, 62 / F' },
    { text: 'Doctor: Dr. S. Rao, Clinic: Shanthi Family Clinic, Rayasandra, Bengaluru' },
    { text: 'Phone: 080 2222 3344, Date: 13/10/2026' },
  ],
  medicines: [
    { name: 'Amoxicillin', strength_text: '500 mg', frequency_raw: '1-1-1', slots: ['morning', 'afternoon', 'night'], food_timing: 'after_food', duration_days: 7, instruction_text: 'Take 1 tablet after food', decoded: true },
    { name: 'Paracetamol', strength_text: '650 mg', frequency_raw: '1-0-1', slots: ['morning', 'night'], food_timing: 'after_food', duration_days: 5, instruction_text: 'Take 1 tablet after food', decoded: true },
    { name: 'Cetirizine', strength_text: '10 mg', frequency_raw: '0-0-1', slots: ['bedtime'], food_timing: 'at_bedtime', duration_days: 5, instruction_text: 'Take 1 tablet at bedtime', decoded: true },
  ],
  protected_terms: ['Lakshmi Narayan', 'Dr. S. Rao', '080 2222 3344', 'Shanthi Family Clinic'],
}

const sampleMutualFund = {
  title: 'Account Statement from Suryodaya Mutual Fund for Ms. Meera Iyer',
  doc_type: 'investment',
  summary: [
    'Your mutual fund is now worth ₹1,24,300.',
    'Total invested ₹1,10,000 with a net gain of ₹14,300.',
  ],
  actions: [
    { text: 'Review portfolio performance regularly.' },
  ],
  warnings: [
    { text: 'Mutual fund investments are subject to market risks.' },
  ],
  facts: [
    { text: 'Investor: Ms. Meera Iyer, PAN: ABCDE1234F, Folio: 1234567/89' },
    { text: 'Email: meera.iyer@gmail.com, Mobile: 98765 43210' },
    { text: 'Address: Flat 302, Green Acres, Whitefield, Bengaluru' },
    { text: 'Units held: 2,200.00, NAV: ₹56.50 on 30 Sep 2026' },
  ],
  protected_terms: ['Ms. Meera Iyer', 'ABCDE1234F', '1234567/89', 'meera.iyer@gmail.com', '98765 43210', 'Suryodaya Mutual Fund'],
}

const sampleCourtSummons = {
  title: 'Court Summons from Court of the City Civil Judge for Shri Karthik S.',
  doc_type: 'court_legal',
  summary: [
    'Court summons from Court of the City Civil Judge. Hearing on 12 Nov 2026.',
    'Suit filed by Shri Anand Rao against defendant Shri Karthik S.',
  ],
  actions: [
    { text: 'Appear in Court Hall No. 4 on 12 Nov 2026 at 10:30 AM.', due_date: '2026-11-12' },
    { text: 'File written statement before the hearing date.' },
  ],
  warnings: [
    { text: 'If you fail to appear, the case may be decided in your absence.' },
  ],
  facts: [
    { text: 'Court: Court of the City Civil Judge, Court Hall No. 4' },
    { text: 'Case: O.S. No. 4417 / 2026' },
    { text: 'Plaintiff: Shri Anand Rao, Defendant: Shri Karthik S.' },
    { text: 'Advocate contact: 98765 00000, advocate.rao@courtmail.com' },
    { text: 'Venue: City Civil Court Complex, K.G. Road' },
  ],
  protected_terms: ['Shri Anand Rao', 'Shri Karthik S.', 'O.S. No. 4417 / 2026', '98765 00000', 'advocate.rao@courtmail.com', 'Court of the City Civil Judge'],
}

const sampleBankDepositSlip = {
  title: 'Cash Deposit Slip from Sample Bank Ltd',
  doc_type: 'form',
  summary: [
    'Cash deposit slip. Fill 6 boxes, then sign.',
  ],
  actions: [
    { text: 'Fill in date, account number, name, amount in words, and note denominations.' },
    { text: 'Sign at the bottom and hand over cash at counter.' },
  ],
  warnings: [],
  facts: [
    { text: 'Bank: Sample Bank Ltd' },
    { text: 'Boxes: 1 Date, 2 Account No., 3 Name, 4 Amount in words, 5 Denominations, 6 Signature' },
  ],
  protected_terms: ['Sample Bank Ltd'],
}

const sampleHealthCheckup = {
  title: 'Executive Health Checkup Package Report for Mr. Prakash N.',
  doc_type: 'medical',
  summary: [
    'Your health checkup: a lab report, a prescription and a bill.',
    '5 test values are outside the reference range.',
  ],
  actions: [
    { text: 'Show this report to your doctor for follow up on flagged values.' },
    { text: 'Review on 15 Jan 2027 with repeat lipid profile and HbA1c.', due_date: '2027-01-15', part_id: 'part-2' },
  ],
  warnings: [
    { text: 'Not a diagnosis. Please consult your physician.' },
  ],
  facts: [
    { text: 'Patient: Mr. Prakash N., 52 Y / M, Lab No. GL-2026-55821, Bill No. GLD/B/2026/3307' },
    { text: 'Doctor: Dr. K. Menon, Phone: 080 1111 2222' },
    { text: 'Clinic: Green Leaf Diagnostics, Green Leaf Clinic' },
  ],
  parts: [
    {
      part_id: 'part-1',
      title: 'Lab Report for Mr. Prakash N.',
      document_type: 'medical',
      issuer: 'Green Leaf Diagnostics',
      date_iso: '2026-10-10',
      pages: [1, 3],
      summary_lines: ['Fasting blood sugar 118 mg/dL High, HbA1c 6.1 % High'],
      sections: [
        {
          title: 'Blood sugar',
          values: [
            { name: 'Fasting blood sugar', value: '118', unit: 'mg/dL', range: '70 – 100', flag: 'High' },
            { name: 'HbA1c', value: '6.1', unit: '%', range: '4.0 – 5.6', flag: 'High' },
          ],
        },
        {
          title: 'Lipid profile',
          values: [
            { name: 'Total cholesterol', value: '212', unit: 'mg/dL', range: 'Below 200', flag: 'High' },
            { name: 'LDL', value: '138', unit: 'mg/dL', range: 'Below 130', flag: 'High' },
          ],
        },
        {
          title: 'Vitamins',
          values: [
            { name: 'Vitamin D (25-OH)', value: '18', unit: 'ng/mL', range: '30 – 100', flag: 'Low' },
          ],
        },
      ],
    },
    {
      part_id: 'part-2',
      title: 'Prescription by Dr. K. Menon',
      document_type: 'medical',
      issuer: 'Green Leaf Clinic',
      date_iso: '2026-10-12',
      pages: [4, 4],
    },
    {
      part_id: 'part-3',
      title: 'Bill GLD/B/2026/3307',
      document_type: 'receipt',
      issuer: 'Green Leaf Diagnostics',
      date_iso: '2026-10-10',
      pages: [5, 5],
    },
  ],
  medicines: [
    { name: 'Atorvastatin', strength_text: '10 mg', frequency_raw: '0-0-1', slots: ['night'], food_timing: 'after_food', duration_days: 30, instruction_text: 'Take at night after food', decoded: true },
    { name: 'Vitamin D3', strength_text: '60,000 IU', frequency_raw: 'Once a week', slots: [], food_timing: 'after_food', duration_days: 56, instruction_text: 'Take once a week after food', decoded: false },
  ],
  protected_terms: ['Mr. Prakash N.', 'Dr. K. Menon', 'GL-2026-55821', 'GLD/B/2026/3307', '080 1111 2222', 'Green Leaf Diagnostics'],
}

// All 11 samples map
const ALL_SAMPLES = [
  { id: 'insurance', fixture: sampleInsurance, personal: ['Ravi Kumar', 'SH/IND/22/559102', 'CLM-2026-0884', 'No. 14, 3rd Cross', '560041'], retained: ['Shield Health Insurance', 'Sunrise Hospital', '48,500', '31,200', '17,300'] },
  { id: 'lab', fixture: sampleLabReport, personal: ['Suresh Babu', 'CD-2026-11873', 'Dr. A. Rao', '080 0000 0000', '48 Y / M'], retained: ['City Diagnostics', '11.2', '126', '182', 'Low', 'High', 'In range'] },
  { id: 'pension', fixture: samplePension, personal: ['Kamala Devi', 'OAP/BLR/2026/8841', 'Door No. 12, 4th Cross'], retained: ['Social Welfare Department', '1,200', '30.11.2026'] },
  { id: 'invoice', fixture: sampleWarrantyInvoice, personal: ['Suresh Raman', 'INV-2026-9021', '98765 43210', '356000000012345'], retained: ['Sunrise Mobiles & Electronics', 'Galaxy A15', '20,999'] },
  { id: 'tax', fixture: samplePropertyTax, personal: ['Lakshmi R.', 'PID-2026-4401', 'TAX/2026/7712', 'Door No. 8, 2nd Main', 'Ward 152'], retained: ['Anand Nagar Municipality', '3,840', '3,648', '192'] },
  { id: 'challan', fixture: sampleEChallan, personal: ['Ravi Kumar', 'ECH-2026-33918', 'KA 05 MN 4821'], retained: ['City Traffic Police', '1,000', '05 Dec 2026', 'Virtual Court'] },
  { id: 'prescription', fixture: samplePrescription, personal: ['Lakshmi Narayan', 'Dr. S. Rao', '080 2222 3344', '62 / F'], retained: ['Shanthi Family Clinic', 'Amoxicillin', 'Paracetamol', 'Cetirizine', '20/10/2026'] },
  { id: 'mutual_fund', fixture: sampleMutualFund, personal: ['Meera Iyer', '1234567/89', 'ABCDE1234F', 'meera.iyer@gmail.com', '98765 43210', 'Flat 302, Green Acres'], retained: ['Suryodaya Mutual Fund', '1,10,000', '1,24,300', '14,300'] },
  { id: 'summons', fixture: sampleCourtSummons, personal: ['Anand Rao', 'Karthik S.', 'O.S. No. 4417 / 2026', '98765 00000', 'advocate.rao@courtmail.com'], retained: ['Court of the City Civil Judge', 'Court Hall No. 4', '12 Nov 2026', '10:30 AM'] },
  { id: 'deposit_slip', fixture: sampleBankDepositSlip, personal: [], retained: ['Sample Bank Ltd'] },
  { id: 'health_checkup', fixture: sampleHealthCheckup, personal: ['Prakash N.', 'Dr. K. Menon', 'GL-2026-55821', 'GLD/B/2026/3307', '080 1111 2222', '52 Y / M'], retained: ['Green Leaf Diagnostics', 'Green Leaf Clinic', '118', '6.1', '212', '138', '18', 'Atorvastatin', 'Vitamin D3'] },
]

test('1A All 11 samples - buildShare with hidePersonal=true hides every personal detail and keeps business facts', () => {
  for (const { id, fixture, personal, retained } of ALL_SAMPLES) {
    const res = buildShare(fixture, { hidePersonal: true })

    // segments contract
    assert.equal(res.text, res.segments.map((s) => s.text).join(''), `${id}: text must equal segments concatenated`)

    // Title must not contain personal name
    assert.ok(!res.title.includes('Ravi Kumar') && !res.title.includes('Lakshmi') && !res.title.includes('Kamala'), `${id}: title must have no personal name`)
    assert.ok(res.title.includes('· Sarvam'), `${id}: title must end with · Sarvam`)

    // Every personal detail must NOT appear in output text
    for (const val of personal) {
      assert.ok(!res.text.includes(val), `${id}: Output must NOT contain personal detail "${val}"\nGot text:\n${res.text}`)
    }

    // Every retained fact must appear
    for (const val of retained) {
      assert.ok(res.text.includes(val), `${id}: Output MUST retain business fact "${val}"`)
    }
  }
})

test('1A All 11 samples - Toggle OFF shows full details, Toggle ON again hides them', () => {
  for (const { id, fixture, personal } of ALL_SAMPLES) {
    // 1. Toggle ON -> Hidden
    const resOn1 = buildShare(fixture, { hidePersonal: true })
    for (const val of personal) {
      assert.ok(!resOn1.text.includes(val), `${id}: Toggle ON should hide "${val}"`)
    }

    // 2. Toggle OFF -> Visible
    const resOff = buildShare(fixture, { hidePersonal: false })
    for (const val of personal) {
      assert.ok(resOff.text.includes(val), `${id}: Toggle OFF should show "${val}"`)
    }

    // 3. Toggle ON again -> Hidden
    const resOn2 = buildShare(fixture, { hidePersonal: true })
    for (const val of personal) {
      assert.ok(!resOn2.text.includes(val), `${id}: Toggle ON again should hide "${val}"`)
    }
  }
})

test('1A All 11 samples - redactResult output serialized contains NONE of the personal values', () => {
  for (const { id, fixture, personal } of ALL_SAMPLES) {
    const redacted = redactResult(fixture, { hidePersonal: true })
    const serialized = JSON.stringify(redacted)

    for (const val of personal) {
      assert.ok(!serialized.includes(val), `${id}: Serialized redacted result must not contain "${val}"`)
    }

    // Medicines names are NOT personal and stay
    if (fixture.medicines) {
      for (const med of fixture.medicines) {
        assert.ok(serialized.includes(med.name), `${id}: Medicine "${med.name}" must be preserved`)
      }
    }
  }
})

test('1A Tamil and Hindi fixtures hide personal names without literal [*]', () => {
  const pensionTa = {
    ...samplePension,
    language: 'ta',
    title: 'ஓய்வூதிய சரிபார்ப்பு அறிவிப்பு — திருமதி கமலா தேவி',
    summary: ['சமூக நலத்துறையிலிருந்து வருடாந்திர வாழ்வுச் சான்றிதழ் சமர்ப்பிப்பு அறிவிப்பு கமலா தேவிக்காக.'],
    facts: [
      { text: 'பயனாளி: திருமதி கமலா தேவி, எண் 12, மல்லேஸ்வரம், பெங்களூரு' },
      { text: 'ஓய்வூதிய ஐடி: OAP/BLR/2026/8841' },
      { text: 'மாத ஓய்வூதியம்: ரூ. 1,200' },
    ],
    protected_terms: ['திருமதி கமலா தேவி', 'கமலா தேவி', 'OAP/BLR/2026/8841'],
  }

  const resTa = buildShare(pensionTa, { hidePersonal: true, lang: 'ta' })
  assert.ok(!resTa.text.includes('கமலா தேவி'))
  assert.ok(!resTa.text.includes('OAP/BLR/2026/8841'))
  assert.ok(!resTa.text.includes('[*]'))
  assert.ok(!resTa.text.includes('[***]'))
  assert.ok(resTa.text.includes('1,200'))

  const insuranceHi = {
    ...sampleInsurance,
    language: 'hi',
    title: 'शील्ड हेल्थ इंश्योरेंस से अस्पताल दावा निपटान पत्र — श्री रवि कुमार',
    summary: ['रवि कुमार के लिए सनराइज अस्पताल का दावा स्वीकृत किया गया है।'],
    facts: [
      { text: 'पॉलिसीधारक: श्री रवि कुमार, जयनगर' },
      { text: 'पॉलिसी संख्या: SH/IND/22/559102' },
      { text: 'स्वीकृत राशि: रु. 31,200' },
    ],
    protected_terms: ['श्री रवि कुमार', 'रवि कुमार', 'SH/IND/22/559102'],
  }

  const resHi = buildShare(insuranceHi, { hidePersonal: true, lang: 'hi' })
  assert.ok(!resHi.text.includes('रवि कुमार'))
  assert.ok(!resHi.text.includes('SH/IND/22/559102'))
  assert.ok(!resHi.text.includes('[*]'))
  assert.ok(resHi.text.includes('31,200'))
})
