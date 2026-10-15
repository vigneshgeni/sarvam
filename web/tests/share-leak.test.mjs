import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildShare, emailShareUrl, redactResult, whatsAppShareUrl } from '../src/utils/shareCore.js'

const here = dirname(fileURLToPath(import.meta.url))
const resultsDir = join(here, '../public/samples/results')
const factsPath = join(here, '../../design/sarvam-v3/samples/SAMPLE_EXPECTED_FACTS_V3.md')
const facts = readFileSync(factsPath, 'utf8')
const LANGS = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']

const SECTIONS = [
  ['sample-lab-report.pdf', '## 1.', '## 2.'],
  ['sample-prescription.jpg', '## 2.', '## 3.'],
  ['sample-health-checkup.pdf', '## 3.', '## 4.'],
  ['sample-mutual-fund-statement.pdf', '## 4.', '## 5.'],
  ['sample-court-summons.pdf', '## 5.', '## 6.'],
  ['sample-bank-deposit-slip.jpg', '## 6.', '## 7.'],
]

function sectionText(start, end) {
  const from = facts.indexOf(start)
  const to = facts.indexOf(end)
  assert.ok(from >= 0 && to > from, start)
  return facts.slice(from, to)
}

function personalValues(text) {
  const found = new Set()
  const patterns = [
    /(?:Mr|Mrs|Ms|Dr|Shri|Smt)\.?\s+(?:[A-Z]\.\s+)?[A-Z][a-zA-Z]{2,}(?:\s+[A-Z][a-zA-Z]{2,})?/g,
    /\bLakshmi Narayan\b/g,
    /\b0\d{2,4}[\s-]?\d{3,4}[\s-]?\d{4}\b/g,
    /\b[A-Z]{2,}(?:[/-][A-Z0-9]+)+\b/g,
    /\b\d{2}\s*Y\s*\/\s*[MF]\b/g,
    /\b\d{2}\s*\/\s*[MF]\b/g,
    /\b[\w.+-]+@[\w.-]+\.\w+\b/g,
  ]
  for (const pattern of patterns) {
    for (const match of text.match(pattern) || []) found.add(match.trim())
  }
  return [...found]
}

const secretsByFile = new Map(SECTIONS.map(([file, start, end]) => [file, personalValues(sectionText(start, end))]))

function walkStrings(value, out) {
  if (!value) return
  if (typeof value === 'string') {
    out.push(value)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item) => walkStrings(item, out))
    return
  }
  if (typeof value === 'object') Object.values(value).forEach((item) => walkStrings(item, out))
}

function renderingsIn(result) {
  const found = new Set()
  const rendered = result.protected_terms_rendered || {}
  for (const forms of Object.values(rendered)) {
    const list = Array.isArray(forms) ? forms : [forms]
    for (const form of list) {
      if (typeof form === 'string' && form.trim().length >= 2) found.add(form.trim())
    }
  }
  const notAName = new Set(['prescription', 'report', 'bill', 'receipt', 'notice', 'letter', 'ప్రిస్క్రిప్షన్', 'నివేదిక', 'రసీదు', 'రిజిస్ట్రేషన్', 'సంఖ్య', 'மருந்துச்சீட்டு', 'அறிக்கை', 'पर्ची', 'रिपोर्ट'])
  const title = String.raw`(?:Mrs|Mr|Ms|Dr|Shri|Smt|श्रीमती|सुश्री|कुमारी|श्री|डॉ|திருமதி|திரு|செல்வி|டாக்டர்|శ్రీమతి|శ్రీ|కుమారి|డాక్టర్|ശ്രീമതి|ശ്രീ|കുമാരി|ഡോ|ಶ್ರೀಮതి|ಶ್ರೀ|ಕುಮಾರಿ|ಡಾ|শ্রীমতী|শ্রী|কুমারী|ডা|ଶ୍ରୀମତୀ|ଶ୍ରୀ|କୁମାରୀ|ଡା)\.?\s+([A-Z][A-Za-z.'’-]+(?:\s+[A-Z][A-Za-z.'’-]+)?|[\u0900-\u0D7F]{2,}(?:\s+[\u0900-\u0D7F]{2,})?)`
  const re = new RegExp(title, 'gu')
  const strings = []
  walkStrings(result, strings)
  for (const text of strings) {
    for (const match of text.matchAll(re)) {
      const span = (match[1] || '').trim()
      const first = span.split(/\s+/)[0] || ''
      if (/^(?:mr|mrs|ms|dr|shri|smt|sri)\.?$/i.test(first)) continue
      if (span.length >= 2 && !notAName.has(first) && !notAName.has(first.toLowerCase())) found.add(span)
    }
  }
  return [...found]
}

function visibleShare(result, lang) {
  const share = buildShare(result, { hidePersonal: true, lang })
  const unmasked = (share.segments || []).filter((segment) => !segment.masked).map((segment) => segment.text).join('\n')
  return { text: share.text, title: share.title, unmasked }
}

test('saved sample shares hide personal facts and the names written after a title', (t) => {
  let names
  try {
    names = readdirSync(resultsDir)
  } catch {
    t.skip('saved sample results are not in this checkout')
    return
  }
  const files = names.filter((name) => /\.[a-z]{2}\.json$/.test(name))
  const stems = new Set(files.map((name) => name.replace(/\.[a-z]{2}\.json$/, '')))
  assert.equal(stems.size, 11)
  const leaks = []
  let checked = 0
  for (const name of files) {
    const stem = name.replace(/\.[a-z]{2}\.json$/, '')
    const lang = name.match(/\.([a-z]{2})\.json$/)[1]
    assert.ok(LANGS.includes(lang), name)
    const result = JSON.parse(readFileSync(join(resultsDir, name), 'utf8'))
    const share = visibleShare(result, lang)
    const channels = {
      text: share.text,
      title: share.title,
      preview: share.unmasked,
      copy: share.text,
      whatsapp: decodeURIComponent(whatsAppShareUrl(share.text)),
      email: decodeURIComponent(emailShareUrl(share.title, share.text)),
      image: JSON.stringify(redactResult(result, { hidePersonal: true, lang })),
    }
    const secrets = new Set([...(secretsByFile.get(stem) || []), ...renderingsIn(result)])
    for (const secret of secrets) {
      for (const [channel, value] of Object.entries(channels)) {
        if (value.includes(secret)) leaks.push(`${name} ${channel}: ${secret}`)
      }
    }
    checked += 1
  }
  assert.equal(leaks.join('\n'), '')
  assert.ok(checked >= 11)
})
