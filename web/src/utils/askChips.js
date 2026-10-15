/** Starter questions for the open document. The words live in the language files. */

export function askFamily(kind) {
  const key = String(kind || '')
  if (key === 'lab_report' || key === 'discharge_summary') return 'lab'
  if (key === 'prescription') return 'rx'
  if (key === 'utility_bill' || key === 'telecom_bill' || key === 'receipt') return 'bill'
  if (key === 'government_notice' || key === 'pension_notice' || key === 'tax_notice') return 'gov'
  if (key === 'court_legal' || key === 'challan') return 'legal'
  if (key === 'bank_statement' || key === 'insurance' || key === 'investment' || key === 'loan' || key === 'salary_slip') return 'money'
  if (key === 'invoice') return 'invoice'
  if (key === 'form') return 'form'
  return 'generic'
}

const CHIP_KEYS = {
  lab: ['askLab1', 'askLab2', 'askLab3'],
  rx: ['askRx1', 'askRx2', 'askRx3'],
  bill: ['askBill1', 'askBill2', 'askBill3'],
  gov: ['askGov1', 'askGov2', 'askGov3'],
  legal: ['askLegal1', 'askLegal2', 'askLegal3'],
  money: ['askMoney1', 'askMoney2', 'askMoney3'],
  invoice: ['askInvoice1', 'askInvoice2', 'askInvoice3'],
  form: ['askForm1', 'askForm2', 'askForm3'],
  generic: ['askGeneric1', 'askGeneric2', 'askGeneric3'],
}

export function starterChipKeys(kind) {
  return CHIP_KEYS[askFamily(kind)]
}
