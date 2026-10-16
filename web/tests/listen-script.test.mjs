import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const here = dirname(fileURLToPath(import.meta.url))
const dir = mkdtempSync(join(tmpdir(), 'sarvam-listen-'))

function compile(name) {
  let js = ts.transpileModule(readFileSync(join(here, '../src/utils', name), 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  js = js.replaceAll("from '../types'", "from './types-stub.mjs'")
  js = js.replaceAll("from './languageMatch'", "from './languageMatch.mjs'")
  return js
}

writeFileSync(join(dir, 'types-stub.mjs'), 'export {}\n')
writeFileSync(join(dir, 'languageMatch.mjs'), compile('languageMatch.ts'))
writeFileSync(join(dir, 'speech.mjs'), compile('speech.ts'))
const { buildQuickSummaryScript } = await import(pathToFileURL(join(dir, 'speech.mjs')).href)

const hindiPage = {
  title: 'चिकित्सा रिकॉर्ड: लैब रिपोर्ट, पर्ची और बिल',
  spoken_summary:
    'This is an official document regarding Medical Records: Lab Report, Prescription, and Bill. Please review the key details.',
  summary: [
    'इस दस्तावेज़ में लैब रिपोर्ट, पर्ची और रसीद शामिल है।',
    'डॉक्टर ने 30 दिनों के लिए एटोरवास्टेटिन लेने की सलाह दी है।',
  ],
}

test('quick listen reads the translated summary when the stored script is English', () => {
  const script = buildQuickSummaryScript(hindiPage, 'hi')
  assert.match(script, /लैब रिपोर्ट/)
  assert.doesNotMatch(script, /This is an official document/)
})

test('quick listen keeps a spoken summary that is already in the selected language', () => {
  const script = buildQuickSummaryScript(
    {
      spoken_summary: 'இது மருத்துவ ஆவணம். முக்கிய விவரங்களை கவனியுங்கள்.',
      summary: ['வேறு சுருக்கம்'],
    },
    'ta',
  )
  assert.match(script, /மருத்துவ ஆவணம்/)
})

test('English listen still reads the English spoken summary', () => {
  const script = buildQuickSummaryScript(
    {
      spoken_summary: 'This is an official document regarding a lab report.',
      summary: ['A longer English summary that should not replace it.'],
    },
    'en',
  )
  assert.equal(script, 'This is an official document regarding a lab report.')
})
