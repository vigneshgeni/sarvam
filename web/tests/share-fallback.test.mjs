import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildShare, privacyRemovedNote, redactResult, sanitizeProse } from '../src/utils/shareCore.js'

test('a role label masks the next name in Hindi and English', () => {
  const hindi = sanitizeProse('वादी आनंद राव ने दावा किया', [], 'hi')
  assert.equal(hindi.includes('आनंद'), false)
  assert.match(hindi, /वादी/)
  const english = sanitizeProse('The accused Anand Rao appeared in court', [], 'en')
  assert.equal(/\bAnand Rao\b/.test(english), false)
  assert.match(english, /accused/)
  assert.equal(sanitizeProse('The patient should rest', [], 'en'), 'The patient should rest')
  assert.match(sanitizeProse('प्रतिवादी को 12 नवंबर को आना है', [], 'hi'), /12 नवंबर/)
})

test('mask fallback shares actions, dates and amounts only', () => {
  const result = {
    title: 'Court notice',
    doc_type: 'court_legal',
    language: 'hi',
    mask_fallback: true,
    summary: ['वादी आनंद राव ने किराया मांगा।'],
    actions: [{ text: '12 नवंबर 2026 को अदालत में पेश हों' }],
    facts: [{ text: 'राशि Rs. 48,000 बकाया है और नाम आनंद राव है' }],
    protected_terms: ['Shri Anand Rao'],
  }
  const share = buildShare(result, { hidePersonal: true, lang: 'hi' })
  assert.match(share.text, /हटा दिए गए/)
  assert.match(share.text, /पेश हों/)
  assert.equal(share.text.includes('आनंद राव'), false)
  assert.equal(share.text.includes('किराया मांगा'), false)
  assert.match(share.text, /Rs\. 48,000/)
  assert.match(share.text, /12 नवंबर 2026/)
  const image = JSON.stringify(redactResult(result, { hidePersonal: true, lang: 'hi' }))
  assert.equal(image.includes('आनंद राव'), false)
  assert.equal(image.includes('Shri Anand Rao'), false)
  assert.equal(image.includes('किराया मांगा'), false)
  assert.match(image, /पेश हों/)
  assert.equal(privacyRemovedNote('en'), 'Some details were removed to protect privacy.')
})
