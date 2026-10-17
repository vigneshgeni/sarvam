import test from 'node:test'
import assert from 'node:assert/strict'
import { readingCountCopy } from '../src/utils/readingCopy.js'

const t = {
  readingTitle: 'Reading your document',
  readingSubtitle: '{count} document · Processing securely',
  readingSubtitlePlural: '{count} documents · Processing securely',
  readingPhotos: '{count} photo · Processing securely',
  readingPhotosPlural: '{count} photos · Processing securely',
  readingPhotosHeading: '{count} photos',
  readingDocumentsHeading: '{count} documents',
}

test('a photo set says photos in the heading and the subtitle', () => {
  const files = [
    { name: 'a.jpg', type: 'image/jpeg' },
    { name: 'b.jpg', type: 'image/jpeg' },
    { name: 'c.png', type: 'image/png' },
  ]
  const copy = readingCountCopy(files, t)
  assert.equal(copy.photos, true)
  assert.equal(copy.heading, '3 photos')
  assert.equal(copy.subtitle, '3 photos · Processing securely')
  assert.equal(copy.subtitle.includes('document'), false)
  assert.equal(copy.progressKey, 'readingPhotosProgress')
})

test('a document set says documents in the heading and the subtitle', () => {
  const files = [
    { name: 'claim.pdf', type: 'application/pdf' },
    { name: 'notice.pdf', type: 'application/pdf' },
  ]
  const copy = readingCountCopy(files, t)
  assert.equal(copy.photos, false)
  assert.equal(copy.heading, '2 documents')
  assert.equal(copy.subtitle, '2 documents · Processing securely')
  assert.equal(copy.heading.includes('photo'), false)
  assert.equal(copy.progressKey, 'reportsProgress')
})

test('one file keeps its name and still uses the matching count word', () => {
  const photo = readingCountCopy([{ name: 'page.jpg', type: 'image/jpeg' }], t)
  const pdf = readingCountCopy([{ name: 'itr.pdf', type: 'application/pdf' }], t)
  assert.equal(photo.heading, 'page.jpg')
  assert.equal(photo.subtitle, '1 photo · Processing securely')
  assert.equal(pdf.heading, 'itr.pdf')
  assert.equal(pdf.subtitle, '1 document · Processing securely')
})
