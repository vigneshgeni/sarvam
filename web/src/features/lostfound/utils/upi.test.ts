import assert from 'node:assert/strict'
import test from 'node:test'
import { buildUpiLink } from './upi.ts'

test('buildUpiLink encodes VPA, name, amount and note', () => {
  const url = buildUpiLink({
    vpa: 'demo.finder@upi',
    name: 'Demo finder',
    amount: 200,
    note: 'Thanks from Sarvam',
  })
  assert.ok(url.startsWith('upi://pay?'))
  assert.ok(url.includes('pa=demo.finder%40upi'))
  assert.ok(url.includes('pn=Demo+finder') || url.includes('pn=Demo%20finder'))
  assert.ok(url.includes('am=200'))
  assert.ok(url.includes('cu=INR'))
  assert.ok(url.includes('tn=Thanks+from+Sarvam') || url.includes('tn=Thanks%20from%20Sarvam'))
  assert.equal(url.includes('upi://pay?pa=demo.finder@upi'), false)
})

test('buildUpiLink encodes spaces and punctuation in the note', () => {
  const url = buildUpiLink({
    vpa: 'asha@okaxis',
    name: 'Asha Verma',
    amount: 100,
    note: 'Thanks, Asha & family',
  })
  assert.ok(url.includes('pa=asha%40okaxis'))
  assert.ok(!url.includes('asha@okaxis'))
  assert.ok(url.includes('am=100'))
  assert.ok(url.includes('%26') || url.includes('&family') === false)
})
