import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { PDFDocument } from 'pdf-lib'

import {
  boxToPdfRect,
  buildFilledPdfFilename,
  buildMissingFieldsPrompt,
  clampBox,
  fillFieldsFromProfile,
  formatDateForForm,
  getMissingFields,
  isIdNumberField,
  maskIdValue,
  sanitizeProfileForStorage,
  splitCharGrid,
} from '../src/features/formfill/formMath.js'
import {
  buildFilledImagePdf,
  fillAcroFormPdf,
} from '../src/features/formfill/pdfBuilder.js'
import {
  deleteFormDraft,
  getFormDraft,
  getFormDrafts,
  getUserProfile,
  saveFormDraft,
  saveUserProfile,
} from '../src/features/formfill/profileStorage.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const FIXTURES_DIR = path.join(__dirname, 'fixtures')

// ---- Mock IndexedDB for profile & draft storage tests ----
function createMockRequest(result) {
  const req = { result, onsuccess: null, onerror: null }
  return new Proxy(req, {
    set(target, prop, value) {
      target[prop] = value
      if (prop === 'onsuccess' && typeof value === 'function') {
        setTimeout(() => value({ target }), 0)
      }
      return true
    },
  })
}

class MockStore {
  constructor(keyPath) {
    this.keyPath = keyPath
    this.map = new Map()
  }
  put(item) {
    this.map.set(item[this.keyPath], item)
    return createMockRequest(item[this.keyPath])
  }
  get(key) {
    return createMockRequest(this.map.get(key))
  }
  getAll() {
    return createMockRequest(Array.from(this.map.values()))
  }
  delete(key) {
    this.map.delete(key)
    return createMockRequest(undefined)
  }
  createIndex() {}
}

function installMockIndexedDB() {
  const stores = new Map()
  const db = {
    objectStoreNames: { contains: (n) => stores.has(n) },
    createObjectStore(name, opts) {
      const s = new MockStore(opts?.keyPath || 'id')
      stores.set(name, s)
      return s
    },
    transaction(names) {
      const tx = {
        objectStore: (n) => stores.get(n),
        _oncomplete: null,
        set oncomplete(fn) {
          this._oncomplete = fn
          if (fn) setTimeout(() => fn(), 4)
        },
        get oncomplete() {
          return this._oncomplete
        },
        onerror: null,
      }
      return tx
    },
  }

  let upgraded = false
  globalThis.indexedDB = {
    open() {
      const req = { result: db, onupgradeneeded: null, onsuccess: null, onerror: null }
      setTimeout(() => {
        if (!upgraded && typeof req.onupgradeneeded === 'function') {
          upgraded = true
          req.onupgradeneeded({ target: req })
        }
        if (typeof req.onsuccess === 'function') {
          req.onsuccess({ target: req })
        }
      }, 0)
      return req
    },
  }
}

test('clampBox and boxToPdfRect convert 0..1000 top-left coordinates to bottom-left PDF points', () => {
  assert.deepEqual(clampBox([-50, 1100, 300, 200]), [0, 200, 300, 1000])

  const rect = boxToPdfRect([200, 100, 800, 150], 600, 800)
  assert.equal(rect.x, 120)
  assert.equal(rect.width, 360)
  assert.equal(rect.height, 40)
  // y2 = 150 => PDF y = 800 * (1 - 0.15) = 680
  assert.equal(rect.y, 680)
  assert.ok(rect.baselineY > rect.y && rect.baselineY < rect.y + rect.height)
  assert.ok(rect.fontSize >= 7 && rect.fontSize <= 16)
})

test('splitCharGrid splits characters into exact cells and strips spaces when compacting', () => {
  assert.deepEqual(splitCharGrid('ABCDE1234F', 10), ['A', 'B', 'C', 'D', 'E', '1', '2', '3', '4', 'F'])
  assert.deepEqual(splitCharGrid('01-01-1990', 8), ['0', '1', '0', '1', '1', '9', '9', '0'])
  assert.deepEqual(splitCharGrid('560100', 6), ['5', '6', '0', '1', '0', '0'])
  assert.deepEqual(splitCharGrid('AB', 4), ['A', 'B', '', ''])
})

test('formatDateForForm follows the form date format', () => {
  assert.equal(formatDateForForm('1990-01-05', 'DD-MM-YYYY'), '05-01-1990')
  assert.equal(formatDateForForm('1990-01-05', 'DD/MM/YYYY'), '05/01/1990')
  assert.equal(formatDateForForm('05/01/1990', 'YYYY-MM-DD'), '1990-01-05')
  assert.equal(formatDateForForm('05-01-1990', 'DDMMYYYY'), '05011990')
  assert.equal(formatDateForForm('5 Jan 1990', 'DD MMM YYYY'), '05 Jan 1990')
})

test('ID number detection and masking hide PAN and Aadhaar until tapped', () => {
  assert.equal(isIdNumberField({ id: 'pan', label: 'PAN', profileKey: 'pan' }), true)
  assert.equal(isIdNumberField({ id: 'uid', label: 'Aadhaar Number', profileKey: null }), true)
  assert.equal(isIdNumberField({ id: 'name', label: 'Full Name', profileKey: 'fullName' }), false)

  assert.equal(maskIdValue('ABCDE1234F', 'pan'), '•••••••34F')
  assert.equal(maskIdValue('1234 5678 9012', 'aadhaar'), '•••• •••• 9012')
  assert.equal(maskIdValue('1234', 'pan'), '••••')
})

test('fillFieldsFromProfile fills 6 fields, respects saveIds, and never fills signature or photo', () => {
  const fields = [
    { id: 'full_name', label: 'Full Name', type: 'text', box: [300, 100, 900, 140], page: 0, profileKey: 'fullName' },
    { id: 'dob', label: 'DOB', type: 'date', box: [300, 160, 900, 200], page: 0, profileKey: 'dob', dateFormat: 'DD/MM/YYYY' },
    { id: 'mobile', label: 'Mobile', type: 'text', box: [300, 220, 900, 260], page: 0, profileKey: 'mobile' },
    { id: 'address', label: 'Address', type: 'text', box: [300, 280, 900, 340], page: 0, profileKey: 'addressLine' },
    { id: 'pan', label: 'PAN', type: 'charGrid', box: [300, 360, 900, 400], page: 0, profileKey: 'pan', cells: 10 },
    { id: 'occupation', label: 'Occupation', type: 'text', box: [300, 420, 900, 460], page: 0, profileKey: 'occupation' },
    { id: 'nominee', label: 'Nominee Name', type: 'text', box: [300, 480, 900, 520], page: 0, profileKey: 'nomineeName' },
    { id: 'signature', label: 'Signature', type: 'signature', box: [300, 820, 700, 900], page: 0, profileKey: 'fullName' },
  ]

  const profileWithoutIds = sanitizeProfileForStorage({
    fullName: 'Asha R',
    dob: '1990-01-05',
    mobile: '9876500001',
    addressLine: '12 Main Rd',
    city: 'Bengaluru',
    pin: '560100',
    occupation: 'Salaried',
    saveIds: false,
    pan: 'ABCDE1234F',
  })
  assert.equal(profileWithoutIds.pan, '', 'PAN must be stripped when saveIds is false')

  const profileWithIds = sanitizeProfileForStorage({
    ...profileWithoutIds,
    saveIds: true,
    pan: 'ABCDE1234F',
  })

  const { values, fromProfileIds } = fillFieldsFromProfile(fields, profileWithIds)
  assert.equal(fromProfileIds.length, 6)
  assert.equal(values.full_name, 'Asha R')
  assert.equal(values.dob, '05/01/1990')
  assert.equal(values.address, '12 Main Rd, Bengaluru, 560100')
  assert.equal(values.pan, 'ABCDE1234F')
  assert.equal(values.signature, undefined, 'Signature must never be filled')

  const missing = getMissingFields(fields, values)
  assert.deepEqual(missing.map((f) => f.id), ['nominee'])
  assert.match(buildMissingFieldsPrompt(missing), /Nominee Name/)
  assert.match(buildMissingFieldsPrompt(missing), /Never read out ID numbers aloud/)
})

test('buildFilledPdfFilename follows "<Form title> - filled - <date>.pdf"', () => {
  const name = buildFilledPdfFilename('KYC update form', new Date(2026, 10, 20))
  assert.equal(name, 'KYC update form - filled - 2026-11-20.pdf')
})

test('profile and draft save/load/delete work in IndexedDB without losing data', async () => {
  installMockIndexedDB()

  const savedProfile = await saveUserProfile({
    fullName: 'Asha R',
    dob: '05-01-1990',
    mobile: '9876500001',
    saveIds: true,
    pan: 'ABCDE1234F',
  })
  assert.equal(savedProfile.id, 'me')
  const loaded = await getUserProfile('me')
  assert.equal(loaded.fullName, 'Asha R')
  assert.equal(loaded.pan, 'ABCDE1234F')

  // Turning saveIds off clears ID numbers on save
  await saveUserProfile({ ...loaded, saveIds: false })
  const cleared = await getUserProfile('me')
  assert.equal(cleared.pan, '')

  // Draft roundtrip
  const draft = await saveFormDraft({
    title: 'KYC update form',
    pageImages: ['data:image/jpeg;base64,/9j/'],
    fields: [],
    values: { full_name: 'Asha R' },
    status: 'draft',
  })
  const fetched = await getFormDraft(draft.id)
  assert.equal(fetched.title, 'KYC update form')
  assert.equal(fetched.values.full_name, 'Asha R')
  assert.equal((await getFormDrafts()).length, 1)

  await deleteFormDraft(draft.id)
  assert.equal((await getFormDrafts()).length, 0)
})

test('buildFilledImagePdf and fillAcroFormPdf produce valid PDFs with signature blank', async () => {
  const imgBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-kyc-form.jpg'))
  const fields = [
    { id: 'full_name', label: 'Full Name', type: 'text', box: [320, 120, 920, 165], page: 0 },
    { id: 'dob', label: 'DOB', type: 'date', box: [320, 190, 920, 235], page: 0, dateFormat: 'DD-MM-YYYY' },
    { id: 'pan', label: 'PAN', type: 'charGrid', box: [320, 410, 920, 455], page: 0, cells: 10 },
    { id: 'sms_alerts', label: 'SMS Alerts', type: 'checkbox', box: [320, 500, 355, 535], page: 0 },
    { id: 'signature', label: 'Signature', type: 'signature', box: [320, 820, 720, 900], page: 0 },
  ]
  const values = {
    full_name: 'Asha R',
    dob: '1990-01-05',
    pan: 'ABCDE1234F',
    sms_alerts: 'true',
    signature: 'SHOULD_NOT_DRAW',
  }

  const outBytes = await buildFilledImagePdf({
    pageImages: [new Uint8Array(imgBytes)],
    fields,
    values,
    formTitle: 'KYC update form',
  })
  const loaded = await PDFDocument.load(outBytes)
  assert.equal(loaded.getPageCount(), 1)
  assert.equal(loaded.getTitle(), 'KYC update form')

  // Fillable AcroForm PDF fixture
  const fillableBytes = fs.readFileSync(path.join(FIXTURES_DIR, 'sample-kyc-fillable.pdf'))
  const acroResult = await fillAcroFormPdf({
    pdfBytes: new Uint8Array(fillableBytes),
    fields,
    values,
  })
  assert.equal(acroResult.isAcroForm, true)
  assert.equal(acroResult.filledCount, 4)

  const filledDoc = await PDFDocument.load(acroResult.bytes)
  const form = filledDoc.getForm()
  assert.equal(form.getTextField('full_name').getText(), 'Asha R')
  assert.equal(form.getTextField('dob').getText(), '05-01-1990')
  assert.equal(form.getTextField('pan').getText(), 'ABCDE1234F')
  assert.equal(form.getCheckBox('sms_alerts').isChecked(), true)
  assert.equal(form.getTextField('signature').getText() || '', '', 'Signature AcroForm field must remain blank')
})

test('formFill i18n keys exist and are non-empty in all 9 languages', () => {
  const i18nDir = path.join(__dirname, '../src/i18n')
  const langs = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']
  const en = JSON.parse(fs.readFileSync(path.join(i18nDir, 'en.json'), 'utf8'))
  assert.ok(en.formFill && typeof en.formFill === 'object', 'en.json must have formFill object')
  const enKeys = Object.keys(en.formFill)
  assert.ok(enKeys.length >= 40)

  for (const lang of langs) {
    const dict = JSON.parse(fs.readFileSync(path.join(i18nDir, `${lang}.json`), 'utf8'))
    assert.ok(dict.formFill && typeof dict.formFill === 'object', `${lang}.json missing formFill`)
    for (const k of enKeys) {
      assert.ok(typeof dict.formFill[k] === 'string' && dict.formFill[k].length > 0, `${lang}.formFill.${k} missing`)
    }
  }
})
