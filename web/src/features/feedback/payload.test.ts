import {
  APP_VERSION,
  buildFeedbackPayload,
  isBuiltInSample,
  localResultId,
  sampleFromFiles,
} from './payload.js'

function assertEqual(actual: unknown, expected: unknown, label: string): void {
  if (actual !== expected) {
    throw new Error(`${label}: ${String(actual)} !== ${String(expected)}`)
  }
}

function assertThrows(fn: () => void, pattern: RegExp, label: string): void {
  try {
    fn()
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!pattern.test(message)) {
      throw new Error(`${label}: ${message}`)
    }
    return
  }
  throw new Error(`${label}: expected an error matching ${pattern}`)
}

export function runPayloadTests(): void {
  const base = {
    rating: 'up' as const,
    lang: 'en',
    docType: 'insurance',
    sample: false,
  }

  const up = buildFeedbackPayload(base)
  assertEqual(up.rating, 'up', 'up rating')
  assertEqual(up.lang, 'en', 'up lang')
  assertEqual(up.docType, 'insurance', 'up docType')
  assertEqual(up.sample, false, 'up sample')
  assertEqual(up.appVersion, APP_VERSION, 'up version')
  assertEqual(Object.keys(up).join(','), 'rating,lang,docType,sample,appVersion', 'up keys')
  assertEqual('reasons' in up, false, 'up has no reasons')

  const down = buildFeedbackPayload({
    ...base,
    rating: 'down',
    reasons: ['wrong_amount', 'other'],
  })
  assertEqual(down.rating, 'down', 'down rating')
  if (down.rating === 'down') {
    assertEqual(down.reasons.join(','), 'wrong_amount,other', 'down reasons')
  }

  assertThrows(
    () =>
      buildFeedbackPayload({
        ...base,
        note: 'Ravi, account 123, due 2 March, amount 500',
      }),
    /Unexpected field: note/,
    'extra field',
  )
  assertThrows(
    () =>
      buildFeedbackPayload({
        ...base,
        rating: 'down',
        reasons: ['The date on page 2 is wrong'],
      }),
    /free text/,
    'free text reason',
  )
  assertThrows(() => buildFeedbackPayload({ ...base, rating: 'yes' }), /rating/, 'bad rating')
  assertThrows(() => buildFeedbackPayload({ ...base, lang: 'fr' }), /lang/, 'bad lang')
  assertThrows(() => buildFeedbackPayload({ ...base, sample: 'false' }), /sample/, 'bad sample')
  assertThrows(
    () => buildFeedbackPayload({ ...base, rating: 'down', reasons: ['wrongDate'] }),
    /free text/,
    'bad reason code',
  )
  assertThrows(
    () => buildFeedbackPayload({ ...base, reasons: [] }),
    /reasons are only allowed/,
    'empty reasons on up',
  )
  assertThrows(
    () => buildFeedbackPayload({ ...base, reasons: ['wrong_date'] }),
    /reasons are only allowed/,
    'reasons on up',
  )

  const unknownDoc = buildFeedbackPayload({
    ...base,
    rating: 'down',
    docType: 'lab_report',
  })
  assertEqual(unknownDoc.docType, 'unknown', 'unlisted doc type')
  if (unknownDoc.rating === 'down') {
    assertEqual(unknownDoc.reasons.length, 0, 'empty down reasons')
  }

  for (const docType of ['pension', 'lab', 'insurance', 'other', 'unknown']) {
    assertEqual(buildFeedbackPayload({ ...base, docType }).docType, docType, docType)
  }

  assertThrows(
    () => buildFeedbackPayload({ ...base, appVersion: 'built from the pension letter' }),
    /appVersion/,
    'free text version',
  )

  assertEqual(isBuiltInSample(['sample-lab-report.pdf']), true, 'sample file')
  assertEqual(isBuiltInSample(['sample-pension-notice.jpg', 'notes.pdf']), false, 'mixed files')
  assertEqual(isBuiltInSample([]), false, 'no files')

  const fileName = 'sample-pension-notice.jpg'
  const fileSize = 482113
  const fileType = 'image/jpeg'
  const fileContent = 'Pensioner S. Murugesan PPO-7718290 due 30 November'
  const sample = sampleFromFiles([
    { name: fileName, size: fileSize, type: fileType, content: fileContent },
  ])
  assertEqual(sample, true, 'sample flag from files')
  assertEqual(typeof sample, 'boolean', 'sample flag type')
  const fromFiles = buildFeedbackPayload({ ...base, sample })
  const encoded = JSON.stringify(fromFiles)
  assertEqual(encoded.includes(fileName), false, 'payload hides file name')
  assertEqual(encoded.includes(String(fileSize)), false, 'payload hides file size')
  assertEqual(encoded.includes(fileType), false, 'payload hides file type')
  assertEqual(encoded.includes('Murugesan'), false, 'payload hides file content')
  assertEqual(encoded.includes('7718290'), false, 'payload hides file content id')
  assertEqual(fromFiles.sample, true, 'stored sample is the boolean')
  for (const leaked of ['name', 'size', 'type', 'content', 'fileName'] as const) {
    assertThrows(
      () => buildFeedbackPayload({ ...base, [leaked]: fileContent }),
      /Unexpected field/,
      `reject ${leaked}`,
    )
  }

  const id = localResultId({
    title: 'Annual Life Certificate Notice',
    language: 'en',
    docType: 'unknown',
    lang: 'ta',
    summary: ['Submit the certificate by 30 November 2026.'],
  })
  assertEqual(
    id,
    localResultId({
      title: 'Annual Life Certificate Notice',
      language: 'en',
      docType: 'unknown',
      lang: 'ta',
      summary: ['Submit the certificate by 30 November 2026.'],
    }),
    'stable id',
  )
  assertEqual(id.includes('Certificate'), false, 'id hides title')
  assertEqual(id.includes('November'), false, 'id hides summary')
}

runPayloadTests()
