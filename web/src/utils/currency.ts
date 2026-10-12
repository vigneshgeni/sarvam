/**
 * Currency & Indian Digit Grouping Utilities (Tier A Item 8)
 *
 * Formats rupee amounts using the Indian numbering system:
 * - ₹ prefix (replacing Rs., INR, or missing symbol for amount kinds)
 * - Indian digit grouping: 3 digits for hundreds, then groups of 2 digits for thousands, lakhs, crores
 * - Retains decimals if present (.00, .50)
 * - E.g.: 48500 -> ₹48,500, 1234567.89 -> ₹12,34,567.89
 */

/**
 * Formats a raw number or numeric string into Indian digit grouping format.
 * E.g. "1234567" -> "12,34,567", "48500.50" -> "48,500.50"
 */
export function formatIndianGrouping(numStr: string): string {
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

/**
 * Formats a standalone amount string (e.g. from GlanceKeyValue or facts) to use ₹ and Indian grouping.
 * E.g. "Rs. 48,500" -> "₹48,500", "Rs. 1234567.89" -> "₹12,34,567.89"
 */
export function formatAmountValue(value: string): string {
  if (!value) return ''

  // Match currency prefix (if any) and numeric part
  const match = value.match(/^(?:Rs\.?|₹|INR|\s)*([\d,]+(?:\.\d+)?)\s*$/i)
  if (match) {
    const formatted = formatIndianGrouping(match[1])
    return `₹${formatted}`
  }

  // If text contains multiple amounts or surrounding text, format inline occurrences
  return formatAmountsInText(value)
}

/**
 * Replaces Rs. / ₹ / INR amounts inside prose sentences with ₹ and Indian digit grouping.
 * Never touches dates, telephone numbers, reference IDs or non-currency numbers.
 */
export function formatAmountsInText(text: string): string {
  if (!text) return ''

  return text.replace(/(?:Rs\.?|₹|INR)\s*([\d,]+(?:\.\d+)?)/gi, (_match, digits) => {
    return `₹${formatIndianGrouping(digits)}`
  })
}
