const EMAIL = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi
const URL = /https?:\/\/\S+|www\.\S+/gi
const PHONE = /(?:\+91[\s-]?)?[6-9]\d{4}[\s-]?\d{5}|\b[6-9]\d{9}\b/g
const LONG = /\b\d{10,}\b/g

export function maskPii(text: string): string {
  return (text || '')
    .replace(URL, '[hidden]')
    .replace(EMAIL, '[hidden]')
    .replace(PHONE, '[hidden]')
    .replace(LONG, '[hidden]')
}

export function looksLikeCard(text: string): boolean {
  const compact = (text || '').replace(/[\s-]/g, '')
  const m = compact.match(/\d{13,19}/g) || []
  return m.some((d) => luhn(d))
}

export function luhn(digits: string): boolean {
  let sum = 0
  let alt = false
  for (let i = digits.length - 1; i >= 0; i--) {
    let n = digits.charCodeAt(i) - 48
    if (alt) {
      n *= 2
      if (n > 9) n -= 9
    }
    sum += n
    alt = !alt
  }
  return digits.length > 0 && sum % 10 === 0
}
