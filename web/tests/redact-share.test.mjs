import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  buildShare,
  emailShareUrl,
  privacyRemovedNote,
  redactResult,
  shareFromRedact,
  sharedAskText,
  whatsAppShareUrl,
} from '../src/utils/shareCore.js'
import { SAMPLE_NAME_RENDERINGS } from '../src/utils/sampleNames.js'

const here = dirname(fileURLToPath(import.meta.url))
const TENANT = 'கவிதா மணி'

function rentResult(extra = {}) {
  return {
    language: 'ta',
    doc_type: 'agreement',
    title: 'வாடகை நினைவூட்டல்',
    summary: [`வாடகைதாரர் ${TENANT} இந்த மாத வாடகையை நவம்பர் 5 அன்று செலுத்த வேண்டும்.`],
    actions: [{ text: 'நவம்பர் 5 அன்று வாடகையை செலுத்தவும்', due_date: '2026-11-05', quote: 'flat 12' }],
    facts: [`${TENANT} என்ற வாடகைதாரருக்கு இந்த நினைவூட்டல்.`],
    protected_terms: ['Kavitha Mani'],
    protected_terms_rendered: { 'Kavitha Mani': ['Kavitha Mani'] },
    ...extra,
  }
}

function leaks(text) {
  return String(text).includes(TENANT)
}

function channels(text, title) {
  return [text, decodeURIComponent(whatsAppShareUrl(text)), decodeURIComponent(emailShareUrl(title, text))]
}

test('a Tamil rent reminder hides the tenant name after the redact check', () => {
  const result = rentResult()
  const before = buildShare(result, { hidePersonal: true, lang: 'ta' }).text
  assert.equal(leaks(before), true)

  const response = { ok: true, spans: [{ text: TENANT, type: 'person' }] }
  const shared = shareFromRedact(result, 'ta', response, [`${TENANT} செலுத்த வேண்டும் என்று கேட்டார்கள்.`])
  for (const channel of channels(shared.text, shared.title)) assert.equal(leaks(channel), false)
  assert.equal(leaks(shared.askText), false)
  assert.equal(shared.text.includes('நவம்பர் 5'), true)

  const exported = redactResult(result, { hidePersonal: true, lang: 'ta' })
  const walked = JSON.stringify(exported)
  const maskedExport = shareFromRedact(
    { ...result, summary: [walked] },
    'ta',
    response,
  )
  assert.equal(leaks(maskedExport.text), false)
})

test('a missing redact call shares only the safe lines', () => {
  const result = rentResult()
  const shared = shareFromRedact(result, 'ta', { ok: false, status: 500 }, [`${TENANT} should pay.`])
  assert.equal(shared.closed, true)
  for (const channel of channels(shared.text, shared.title)) {
    assert.equal(leaks(channel), false)
    assert.equal(channel.includes(result.summary[0]), false)
  }
  assert.equal(shared.text.includes(privacyRemovedNote('ta')), true)
  assert.equal(shared.text.includes('நவம்பர் 5'), true)
  assert.equal(shared.askText, privacyRemovedNote('ta'))
  assert.equal(leaks(sharedAskText(`${TENANT} should pay.`, 'ta', { ok: false })), false)
})

test('main fallback shape also hides the Tamil tenant name', () => {
  const shared = buildShare(rentResult({ mask_fallback: true }), { hidePersonal: true, lang: 'ta' })
  for (const channel of channels(shared.text, shared.title)) assert.equal(leaks(channel), false)
  assert.equal(shared.text.includes(privacyRemovedNote('ta')), true)
  assert.equal(shared.text.includes('நவம்பர் 5'), true)
})

function sampleShare(file, lang) {
  const path = join(here, '../public/samples/results', `${file}.${lang}.json`)
  const result = JSON.parse(readFileSync(path, 'utf8'))
  const stem = file.replace(/\.(pdf|jpg)$/, '')
  const secrets = SAMPLE_NAME_RENDERINGS[file] || SAMPLE_NAME_RENDERINGS[stem] || []
  const built = buildShare(result, { hidePersonal: true, lang })
  const still = secrets.filter((secret) => secret && built.text.includes(secret))
  const shared = shareFromRedact(result, lang, {
    ok: true,
    spans: still.map((text) => ({ text, type: 'person' })),
  })
  return { secrets, shared, built }
}

test('Hindi court summons, Marathi e-challan, and an English letter stay clean', () => {
  const hindi = sampleShare('sample-court-summons.pdf', 'hi')
  const marathi = sampleShare('sample-echallan.pdf', 'mr')
  for (const item of [hindi, marathi]) {
    for (const secret of item.secrets) {
      assert.equal(item.shared.text.includes(secret), false, secret)
      assert.equal(decodeURIComponent(whatsAppShareUrl(item.shared.text)).includes(secret), false, secret)
    }
  }
  assert.equal(marathi.shared.text.includes('ANAND NAGAR') || marathi.built.text.includes('ANAND NAGAR'), true)

  const letter = {
    language: 'en',
    doc_type: 'other',
    title: 'A short letter',
    summary: ['Please reply to Leela Subramanian about the rent.'],
    actions: [{ text: 'Reply by 5 November 2026', due_date: '2026-11-05' }],
    protected_terms: [],
  }
  const open = buildShare(letter, { hidePersonal: true, lang: 'en' }).text
  assert.equal(open.includes('Leela Subramanian'), true)
  const closed = shareFromRedact(letter, 'en', {
    ok: true,
    spans: [{ text: 'Leela Subramanian', type: 'person' }],
  })
  assert.equal(closed.text.includes('Leela Subramanian'), false)
  assert.equal(emailShareUrl(closed.title, closed.text).includes('Leela'), false)
})
