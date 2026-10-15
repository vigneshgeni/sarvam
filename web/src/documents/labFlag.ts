export interface LabAssessment {
  /** Words to show on the chip. Empty when the value sits inside a simple range. */
  label: string
  calculated: boolean
  outside: boolean
}

const PRINTED_HIGH = /^(?:high|h|↑|⬆)$/i
const PRINTED_LOW = /^(?:low|l|↓|⬇)$/i
const PRINTED_IN = /^in\s*range$/i

const BAND_NAME =
  /(?:very\s+high|borderline(?:\s+high)?|near(?:\s+to)?(?:\s+above)?\s*optimal|desirable|optimal|normal|sufficiency|sufficient|deficiency|deficient|insufficiency|toxicity|toxic|high|low)/i

interface Bound {
  min?: number
  max?: number
  minOpen?: boolean
  maxOpen?: boolean
}

function firstNumber(raw: string): number | null {
  const match = String(raw || '').replace(/,/g, '').match(/-?\d+(?:\.\d+)?/)
  if (!match) return null
  const value = Number(match[0])
  return Number.isFinite(value) ? value : null
}

function interpretive(text: string): boolean {
  return /impairment|indicative|suggestive/i.test(text) && !BAND_NAME.test(text)
}

function boundFrom(clause: string): Bound | null {
  const interval = clause.match(/(\d[\d,]*(?:\.\d+)?)\s*(?:–|-|to)\s*(\d[\d,]*(?:\.\d+)?)/i)
  if (interval) return { min: firstNumber(interval[1]) ?? undefined, max: firstNumber(interval[2]) ?? undefined }
  const upper = clause.match(/(?:<=|≤|<|below|less than)\s*(\d[\d,]*(?:\.\d+)?)/i)
  if (upper) {
    const max = firstNumber(upper[1])
    if (max == null) return null
    return { max, maxOpen: /<(?!=)/.test(upper[0]) || /below|less than/i.test(upper[0]) }
  }
  const lower = clause.match(/(?:>=|≥|>|above|more than)\s*(\d[\d,]*(?:\.\d+)?)/i)
  if (lower) {
    const min = firstNumber(lower[1])
    if (min == null) return null
    return { min, minOpen: />(?!=)/.test(lower[0]) || /above|more than/i.test(lower[0]) }
  }
  return null
}

function contains(value: number, bound: Bound): boolean {
  if (bound.min != null && (bound.minOpen ? value <= bound.min : value < bound.min)) return false
  if (bound.max != null && (bound.maxOpen ? value >= bound.max : value > bound.max)) return false
  return bound.min != null || bound.max != null
}

function width(bound: Bound): number {
  if (bound.min != null && bound.max != null) return Math.max(0, bound.max - bound.min)
  return 1_000_000
}

function outsideBand(name: string): boolean {
  return /high|low|deficien|insufficien|toxic|borderline/i.test(name) && !/near/i.test(name)
}

function titleBand(name: string): string {
  return name
    .trim()
    .toLowerCase()
    .replace(/\b[a-z]/g, (letter) => letter.toUpperCase())
}

function printedAssessment(flag: string): LabAssessment | null {
  const text = flag.trim()
  if (PRINTED_HIGH.test(text)) return { label: 'High', calculated: false, outside: true }
  if (PRINTED_LOW.test(text)) return { label: 'Low', calculated: false, outside: true }
  if (PRINTED_IN.test(text)) return { label: 'In range', calculated: false, outside: false }
  return null
}

function banded(value: number, range: string): LabAssessment | null {
  const pattern = new RegExp(`(${BAND_NAME.source})\\s*:?\\s*([^\\n;]+)`, 'gi')
  const hits: { name: string; bound: Bound }[] = []
  let match: RegExpExecArray | null
  while ((match = pattern.exec(range)) !== null) {
    const clause = match[2] || ''
    if (interpretive(clause)) continue
    const bound = boundFrom(clause)
    if (bound) hits.push({ name: titleBand(match[1]), bound })
  }
  if (hits.length < 2) return null
  const fitting = hits.filter((hit) => contains(value, hit.bound))
  if (!fitting.length) return null
  fitting.sort((a, b) => width(a.bound) - width(b.bound))
  const chosen = fitting[0]
  return { label: chosen.name, calculated: true, outside: outsideBand(chosen.name) }
}

function simple(value: number, range: string): LabAssessment | null {
  if (interpretive(range)) return null
  const bound = boundFrom(range)
  if (!bound) return null
  if (!contains(value, bound)) {
    if (bound.max != null && (bound.maxOpen ? value >= bound.max : value > bound.max)) {
      return { label: 'Above range', calculated: true, outside: true }
    }
    if (bound.min != null && (bound.minOpen ? value <= bound.min : value < bound.min)) {
      return { label: 'Below range', calculated: true, outside: true }
    }
  }
  return { label: '', calculated: false, outside: false }
}

/** Printed H/L wins. Otherwise compare the number with the printed range. No range means no decision. */
export function assessLabValue(value: string, range?: string | null, printed?: string | null): LabAssessment | null {
  if (printed && printedAssessment(printed)) return printedAssessment(printed)
  const text = (range || '').trim()
  const number = firstNumber(value)
  if (!text || number == null) return null
  return banded(number, text) || simple(number, text)
}

export function countOutside(
  sections: { values?: { value?: string | null; ref_range?: string | null; range?: string | null; flag_printed?: string | null }[] }[],
): number {
  let outside = 0
  for (const section of sections) {
    for (const row of section.values || []) {
      const status = assessLabValue(row.value || '', row.ref_range || row.range, row.flag_printed)
      if (status?.outside) outside += 1
    }
  }
  return outside
}

export function titleCaseHeading(heading: string): string {
  const letters = heading.replace(/[^A-Za-z]/g, '')
  if (letters.length < 3) return heading
  const capitals = letters.replace(/[^A-Z]/g, '').length
  if (capitals / letters.length < 0.7) return heading
  return heading
    .toLowerCase()
    .replace(/(^|[^A-Za-z0-9])([a-z])/g, (_all, lead: string, letter: string) => lead + letter.toUpperCase())
}
