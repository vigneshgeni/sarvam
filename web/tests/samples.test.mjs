import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const SAMPLES_DIR = path.resolve(process.cwd(), 'public/samples')

export const ALL_ELEVEN_SAMPLES = [
  'sample-lab-report.pdf',
  'sample-insurance-letter.pdf',
  'sample-pension-notice.jpg',
  'sample-invoice-warranty.pdf',
  'sample-property-tax-notice.pdf',
  'sample-echallan.pdf',
  'sample-prescription.jpg',
  'sample-mutual-fund-statement.pdf',
  'sample-court-summons.pdf',
  'sample-bank-deposit-slip.jpg',
  'sample-health-checkup.pdf',
]

test('All 11 samples exist on disk in public/samples and are readable', () => {
  for (const filename of ALL_ELEVEN_SAMPLES) {
    const fullPath = path.join(SAMPLES_DIR, filename)
    assert.ok(fs.existsSync(fullPath), `Sample file ${filename} must exist in public/samples`)
    const stats = fs.statSync(fullPath)
    assert.ok(stats.size > 1000, `Sample file ${filename} must not be empty (got ${stats.size} bytes)`)
  }
})
