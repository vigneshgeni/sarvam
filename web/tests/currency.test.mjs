import test from 'node:test'
import assert from 'node:assert/strict'

function formatIndianGrouping(numStr) {
  const clean = numStr.replace(/,/g, '').trim()
  if (!clean) return ''

  const parts = clean.split('.')
  const integerPart = parts[0]
  const decimalPart = parts.length > 1 ? `.${parts[1]}` : ''

  if (integerPart.length <= 3) {
    return `${integerPart}${decimalPart}`
  }

  const last3 = integerPart.slice(-3)
  const remaining = integerPart.slice(0, -3)
  const groupedRemaining = remaining.replace(/\B(?=(\d{2})+(?!\d))/g, ',')

  return `${groupedRemaining},${last3}${decimalPart}`
}

function formatAmountValue(value) {
  if (!value) return ''
  const match = value.match(/^(?:Rs\.?|₹|INR|\s)*([\d,]+(?:\.\d+)?)\s*$/i)
  if (match) {
    const formatted = formatIndianGrouping(match[1])
    return `₹${formatted}`
  }
  return formatAmountsInText(value)
}

function formatAmountsInText(text) {
  if (!text) return ''
  return text.replace(/(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d+)?)/gi, (_match, digits) => {
    return `₹${formatIndianGrouping(digits)}`
  })
}

test('formatIndianGrouping formats numbers according to Indian numbering system', () => {
  assert.equal(formatIndianGrouping('100'), '100')
  assert.equal(formatIndianGrouping('1000'), '1,000')
  assert.equal(formatIndianGrouping('10000'), '10,000')
  assert.equal(formatIndianGrouping('100000'), '1,00,000')
  assert.equal(formatIndianGrouping('1234567'), '12,34,567')
  assert.equal(formatIndianGrouping('10000000'), '1,00,00,000')
  assert.equal(formatIndianGrouping('48500'), '48,500')
  assert.equal(formatIndianGrouping('31200'), '31,200')
  assert.equal(formatIndianGrouping('17300'), '17,300')
})

test('formatIndianGrouping retains decimals correctly', () => {
  assert.equal(formatIndianGrouping('20999.00'), '20,999.00')
  assert.equal(formatIndianGrouping('1234567.89'), '12,34,567.89')
  assert.equal(formatIndianGrouping('48500.5'), '48,500.5')
})

test('formatAmountValue standardises prefix to ₹ and applies grouping', () => {
  assert.equal(formatAmountValue('Rs. 48,500'), '₹48,500')
  assert.equal(formatAmountValue('Rs 31200'), '₹31,200')
  assert.equal(formatAmountValue('INR 1200'), '₹1,200')
  assert.equal(formatAmountValue('₹17,300'), '₹17,300')
  assert.equal(formatAmountValue('Rs. 1234567.89'), '₹12,34,567.89')
  assert.equal(formatAmountValue('20,999.00'), '₹20,999.00')
})

test('formatAmountsInText updates prose amounts without altering non-currency numbers', () => {
  const sentence = 'Total claimed was Rs. 48500 and approved was Rs. 31,200.00. Ref: CLM-2026-0884 on 30.11.2026. Helpline 1800 000 0000.'
  const formatted = formatAmountsInText(sentence)

  assert.ok(formatted.includes('₹48,500'))
  assert.ok(formatted.includes('₹31,200.00'))
  assert.ok(formatted.includes('CLM-2026-0884'))
  assert.ok(formatted.includes('30.11.2026'))
  assert.ok(formatted.includes('1800 000 0000'))
  assert.ok(!formatted.includes('Rs.'))
})
