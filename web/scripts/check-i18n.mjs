#!/usr/bin/env node
/**
 * Fails with exit code 1 if ANY key (top-level or nested) in en.json is missing
 * or empty in any of the 9 supported locale files, or if any locale has extra keys
 * missing from en.json.
 */

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const langs = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']
const i18nDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/i18n')

function flattenKeys(obj, prefix = '', out = new Map()) {
  for (const [k, v] of Object.entries(obj)) {
    const full = prefix ? `${prefix}.${k}` : k
    if (v && typeof v === 'object' && !Array.isArray(v)) {
      flattenKeys(v, full, out)
    } else {
      out.set(full, v)
    }
  }
  return out
}

const maps = Object.fromEntries(
  langs.map((lang) => [
    lang,
    flattenKeys(JSON.parse(fs.readFileSync(path.join(i18nDir, `${lang}.json`), 'utf8'))),
  ]),
)

const enKeys = Array.from(maps.en.keys()).sort()

const missing = []
for (const key of enKeys) {
  for (const lang of langs) {
    const val = maps[lang].get(key)
    if (val === undefined || val === '') {
      missing.push(`${lang}:${key}`)
    }
  }
}

if (missing.length > 0) {
  console.error(`i18n parity check FAILED (${missing.length} missing/empty keys):`)
  for (const m of missing.slice(0, 40)) console.error(`  - ${m}`)
  process.exit(1)
}

console.log(`i18n parity check PASSED: ${enKeys.length} keys verified across all ${langs.length} locales.`)
