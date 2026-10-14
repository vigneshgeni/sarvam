import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const here = dirname(fileURLToPath(import.meta.url))
const root = join(here, '..')
const dir = mkdtempSync(join(tmpdir(), 'sarvam-docs-'))

function emit(rel, name) {
  const source = readFileSync(join(root, rel), 'utf8')
  let js = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  js = js.replaceAll("from '../design/catalog'", "from './catalog.mjs'")
  js = js.replaceAll("from './kinds'", "from './kinds.mjs'")
  writeFileSync(join(dir, name), js)
}

emit('src/design/catalog.ts', 'catalog.mjs')
emit('src/documents/kinds.ts', 'kinds.mjs')
emit('src/documents/profiles.ts', 'profiles.mjs')
emit('src/documents/reminders.ts', 'reminders.mjs')

const { inferKind } = await import(pathToFileURL(join(dir, 'kinds.mjs')).href)
const { resolveProfile } = await import(pathToFileURL(join(dir, 'profiles.mjs')).href)
const { amountDue } = await import(pathToFileURL(join(dir, 'catalog.mjs')).href)
const { noticeByDate } = await import(pathToFileURL(join(dir, 'reminders.mjs')).href)

const base = {
  language: 'en',
  doc_type: 'other',
  document_type: 'other',
  summary: ['A short explanation.'],
  actions: [],
  warnings: [],
  facts: [],
  glance: { headline: 'Document', key_values: [] },
  evidence_summary: { matched: 0, check_original: 0, calculated: 0 },
}

function doc(over) {
  return { ...base, ...over, glance: { ...base.glance, ...(over.glance || {}) } }
}

function value(name, flag) {
  return { name, value: '1', unit: 'g/dL', flag_printed: flag || null }
}

const labValues = Array.from({ length: 18 }, (_, i) => value(`Reading ${i + 1}`, i < 4 ? 'High' : null))
const lab = doc({
  title: 'City lab report',
  document_type: 'medical',
  sections: [
    { heading: 'Blood', values: labValues.slice(0, 4) },
    { heading: 'Liver', values: labValues.slice(4, 8) },
    { heading: 'Kidney', values: labValues.slice(8, 12) },
    { heading: 'Thyroid', values: labValues.slice(12, 15) },
    { heading: 'Sugar', values: labValues.slice(15) },
  ],
})

const rx = doc({
  title: 'Clinic prescription',
  medicines: [
    { name: 'Tablet A', frequency_code: 'BD', decoded: true },
    { name: 'Tablet B', frequency_code: 'TDS', decoded: true },
    { name: 'Tablet C', frequency_code: 'HS', decoded: true },
    { name: 'Tablet D', frequency_code: 'SOS', decoded: true, as_needed: true },
    { name: 'Tablet E', frequency_code: 'WEEKLY', decoded: false },
  ],
})

const discharge = doc({
  title: 'Discharge summary',
  summary: ['Advice on discharge is printed below.'],
  medicines: [{ name: 'Tablet A' }, { name: 'Tablet B' }, { name: 'Tablet C' }],
  profile: {
    diagnosis_as_written: 'As printed',
    advice_lines: ['Rest'],
    follow_up: '2026-11-02',
  },
  actions: [{ text: 'Follow up', due_date: '2026-11-02', date_status: 'upcoming' }],
})

const loan = doc({
  title: 'Home loan sanction letter',
  document_type: 'bank',
  profile: { tenure: '20 years', emi_amount: '₹ 18,400', emi_day_of_month: 5, next_emi_date: '2026-11-05', interest_rate: '8.5% p.a.' },
  glance: { key_values: [
    { label: 'Loan', value: '₹ 25,00,000', kind: 'amount' },
    { label: 'EMI', value: '₹ 18,400', kind: 'amount' },
    { label: 'Rate', value: '8.5% p.a.', kind: 'text' },
  ] },
})

const agreement = doc({
  title: 'Rental agreement',
  document_type: 'agreement',
  profile: {
    rent_or_price: '₹ 22,000',
    deposit: '₹ 1,00,000',
    lock_in: '3 months',
    notice_period: '2 months',
    term: '11 months',
    start_date: '2026-10-01',
    end_date: '2027-09-01',
  },
})

const invoice = doc({
  title: 'Tax invoice',
  document_type: 'receipt',
  profile: {
    line_items: [
      { description: 'Handset' },
      { description: 'Cover' },
      { description: 'Charger' },
      { description: 'Cable' },
    ],
    warranty_until: '2027-10-14',
  },
  glance: { key_values: [
    { label: 'Taxable', value: '₹ 10,000', kind: 'amount' },
    { label: 'Tax', value: '₹ 1,800', kind: 'amount' },
    { label: 'Total', value: '₹ 11,800', kind: 'amount' },
  ] },
})

const billRebate = doc({
  title: 'Electricity bill',
  document_type: 'utility_bill',
  doc_type: 'utility_bill',
  summary: ['Units consumed and a rebate are printed.'],
  glance: { key_values: [
    { label: 'Total', value: '₹ 1,100', kind: 'amount' },
    { label: 'Charges', value: '₹ 1,000', kind: 'amount' },
    { label: 'Rebate', value: '₹ 100', kind: 'amount' },
  ] },
})

const billPlain = doc({
  title: 'Electricity bill',
  document_type: 'utility_bill',
  doc_type: 'utility_bill',
  summary: ['Units consumed are printed. A premium service is not a loan.'],
  glance: { key_values: [{ label: 'Amount due', value: '₹ 840', kind: 'amount' }] },
})

const pension = doc({
  title: 'Pension life certificate',
  document_type: 'government_notice',
  actions: [{ text: 'Submit the certificate', due_date: '2026-11-30', date_status: 'upcoming' }],
})

const instructions = doc({
  title: 'You are hereby informed',
  document_type: 'government_notice',
  profile: { directions: ['Carry the original letter.'] },
})

const fund = doc({
  title: 'Mutual fund statement',
  document_type: 'bank',
  glance: { key_values: [
    { label: 'Invested', value: '₹ 50,000', kind: 'amount' },
    { label: 'Value', value: '₹ 54,200', kind: 'amount' },
  ] },
})

const salary = doc({
  title: 'Salary slip',
  summary: ['Net pay after deductions.'],
  document_type: 'bank',
  glance: { key_values: [
    { label: 'Gross', value: '₹ 40,000', kind: 'amount' },
    { label: 'Deductions', value: '₹ 4,000', kind: 'amount' },
    { label: 'Net pay', value: '₹ 36,000', kind: 'amount' },
  ] },
})

const form = doc({
  title: 'Account opening form',
  summary: ['Fill in block letters.'],
  profile: { form_fields: [{ name: 'Date' }, { name: 'Name' }] },
})

const bundle = doc({
  title: 'Three documents',
  parts: [
    { title: 'Lab report', document_kind: 'lab_report', sections: lab.sections },
    { title: 'Prescription', document_kind: 'prescription', medicines: rx.medicines },
    { title: 'Hospital bill', document_kind: 'hospital_bill' },
  ],
})

const rows = [
  ['lab 18 values', lab, 'lab_report', 'Dplus', ['sections', 'notADiagnosis']],
  ['prescription', rx, 'prescription', 'E', ['medicines']],
  ['discharge', discharge, 'discharge_summary', 'C', ['diagnosis', 'medicines', 'advice']],
  ['loan', loan, 'loan', 'B', ['nextEmi', 'loanTerms']],
  ['agreement', agreement, 'agreement', 'E', ['keyTerms', 'timeline']],
  ['invoice', invoice, 'invoice', 'F', ['items', 'warranty']],
  ['bill with rebate', billRebate, 'utility_bill', 'A', []],
  ['bill without rebate', billPlain, 'utility_bill', 'B', []],
  ['pension deadline', pension, 'pension_notice', 'C', []],
  ['notice instructions', instructions, 'government_notice', 'E', ['directions']],
  ['mutual fund', fund, 'investment', 'F', []],
  ['salary slip', salary, 'salary_slip', 'F', []],
  ['account form', form, 'form', 'E', ['formSteps']],
  ['three documents', bundle, 'other', 'multi', []],
]

test('a payable document uses the amount due and the due date', () => {
  const challan = doc({
    title: 'Traffic challan',
    document_kind: 'challan',
    document_type: 'challan',
    profile: { amounts: [{ label: 'Amount due', value: '₹ 1,000' }], due_date: '2026-12-05' },
    glance: { key_values: [{ label: 'Fine', value: '₹ 1,000', kind: 'amount' }] },
  })
  const tax = doc({
    title: 'Property tax',
    document_kind: 'tax_notice',
    document_type: 'tax_receipt',
    profile: { amounts: [{ label: 'Total payable', value: '₹ 2,450' }], due_date: '2026-11-30' },
  })
  const premium = doc({
    title: 'Policy',
    document_kind: 'insurance',
    document_type: 'insurance',
    profile: { premium: '₹ 8,200', due_date: '2026-12-01' },
  })
  const balance = doc({
    title: 'Invoice',
    document_kind: 'invoice',
    document_type: 'receipt',
    profile: { paid_or_due: '₹ 500', amounts: [{ label: 'Amount due', value: '₹ 500' }], due_date: '2026-11-01' },
  })
  assert.equal(resolveProfile(challan).glanceLayout, 'B')
  assert.equal(resolveProfile(tax).glanceLayout, 'B')
  assert.equal(resolveProfile(billPlain).glanceLayout, 'B')
  assert.equal(resolveProfile(premium).glanceLayout, 'B')
  assert.equal(resolveProfile(balance).glanceLayout, 'B')
  assert.equal(amountDue(loan).value, '₹ 18,400')
  assert.equal(amountDue(tax).due, '2026-11-30')
  assert.equal(amountDue(challan).value, '₹ 1,000')
})

test('new fictional documents get their kind and layout', () => {
  const mismatches = []
  for (const [name, result, kind, layout, blocks] of rows) {
    const view = resolveProfile(result)
    const missing = blocks.filter((id) => !view.blocks.includes(id))
    if (view.kind !== kind || view.glanceLayout !== layout || missing.length) {
      mismatches.push(`${name}: got ${view.kind}/${view.glanceLayout} missing ${missing.join(',') || '-'}`)
    }
  }
  assert.deepEqual(mismatches, [])
})

test('a file name does not choose the kind', () => {
  assert.equal(inferKind({ title: 'sample-lab-report.pdf', document_type: 'other' }), 'other')
  assert.equal(inferKind(billPlain), 'utility_bill')
})

test('a rental agreement counts the notice-by date', () => {
  assert.equal(noticeByDate(agreement.profile.end_date, agreement.profile.notice_period), '2027-07-01')
})

test('each part of a bundle keeps its own kind', () => {
  assert.deepEqual(
    bundle.parts.map((part) => inferKind(part)),
    ['lab_report', 'prescription', 'hospital_bill']
  )
})
