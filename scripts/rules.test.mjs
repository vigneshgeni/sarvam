import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { after, before, test } from 'node:test'
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from '@firebase/rules-unit-testing'
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from 'firebase/firestore'

const rules = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', 'firestore.rules'), 'utf8')

/** @type {import('@firebase/rules-unit-testing').RulesTestEnvironment} */
let testEnv

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: 'demo-sarvam-feedback',
    firestore: { rules },
  })
})

after(async () => {
  await testEnv.cleanup()
})

function db(uid = 'rater') {
  return testEnv.authenticatedContext(uid).firestore()
}

function upBody(overrides = {}) {
  return {
    rating: 'up',
    lang: 'en',
    docType: 'medical',
    sample: false,
    appVersion: '0.0.0',
    createdAt: serverTimestamp(),
    ...overrides,
  }
}

function downBody(overrides = {}) {
  return {
    rating: 'down',
    lang: 'ta',
    docType: 'government_notice',
    reasons: ['wrong_date', 'other'],
    sample: true,
    appVersion: '0.0.0',
    createdAt: serverTimestamp(),
    ...overrides,
  }
}

test('signed-out create is denied', async () => {
  const unauth = testEnv.unauthenticatedContext().firestore()
  await assertFails(setDoc(doc(unauth, 'feedback/signed-out'), upBody()))
})

test('signed-in valid up is allowed', async () => {
  await assertSucceeds(setDoc(doc(db(), 'feedback/valid-up'), upBody()))
})

test('valid down with reasons is allowed', async () => {
  await assertSucceeds(setDoc(doc(db(), 'feedback/valid-down'), downBody()))
})

test('down with zero chips is allowed', async () => {
  // Same shape buildFeedbackPayload returns for a down rating with no chips: reasons is [].
  await assertSucceeds(
    setDoc(doc(db(), 'feedback/down-empty-reasons'), {
      rating: 'down',
      lang: 'en',
      docType: 'medical',
      reasons: [],
      sample: false,
      appVersion: '0.0.0',
      createdAt: serverTimestamp(),
    }),
  )
})

test('extra field is denied', async () => {
  await assertFails(setDoc(doc(db(), 'feedback/extra'), upBody({ extra: true })))
})

test('free-text field is denied', async () => {
  await assertFails(
    setDoc(
      doc(db(), 'feedback/free-text'),
      upBody({ note: 'Pensioner S. Murugesan PPO-7718290 due 30 November amount 28450' }),
    ),
  )
})

test('reasons on up are denied', async () => {
  await assertFails(
    setDoc(doc(db(), 'feedback/reasons-on-up'), upBody({ reasons: ['wrong_date'] })),
  )
})

test('bad enum is denied', async () => {
  await assertFails(setDoc(doc(db(), 'feedback/bad-enum'), upBody({ docType: 'lab_report' })))
})

test('reasons array over 5 is denied', async () => {
  await assertFails(
    setDoc(
      doc(db(), 'feedback/too-many-reasons'),
      downBody({
        reasons: [
          'wrong_date',
          'wrong_amount',
          'missed_action',
          'hard_to_understand',
          'other',
          'wrong_date',
        ],
      }),
    ),
  )
})

test('createdAt other than server time is denied', async () => {
  await assertFails(
    setDoc(
      doc(db(), 'feedback/client-time'),
      upBody({ createdAt: new Date('2020-01-01T00:00:00Z') }),
    ),
  )
})

test('read is denied even for the creator', async () => {
  const user = db('reader')
  await assertSucceeds(setDoc(doc(user, 'feedback/read-me'), upBody()))
  await assertFails(getDoc(doc(user, 'feedback/read-me')))
})

test('update is denied even for the creator', async () => {
  const user = db('updater')
  await assertSucceeds(setDoc(doc(user, 'feedback/update-me'), upBody()))
  await assertFails(updateDoc(doc(user, 'feedback/update-me'), { rating: 'down' }))
})

test('delete is denied even for the creator', async () => {
  const user = db('deleter')
  await assertSucceeds(setDoc(doc(user, 'feedback/delete-me'), upBody()))
  await assertFails(deleteDoc(doc(user, 'feedback/delete-me')))
})

test('any other collection is denied', async () => {
  await assertFails(setDoc(doc(db(), 'documents/letter'), { text: 'not stored' }))
})
