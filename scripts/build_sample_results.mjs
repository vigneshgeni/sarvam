/**
 * Build offline sample results from the local design-v3 API.
 * English is read once. The other eight languages come from /api/translate.
 * Each English result is checked against the printed facts before it is saved.
 *
 *   node scripts/build_sample_results.mjs
 *   API_URL=http://127.0.0.1:8099 node scripts/build_sample_results.mjs
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const samplesDir = join(root, 'web/public/samples')
const outDir = join(samplesDir, 'results')
const api = (process.env.API_URL || 'http://127.0.0.1:8099').replace(/\/$/, '')
const langs = ['en', 'ta', 'hi', 'te', 'ml', 'kn', 'mr', 'bn', 'or']

const files = [
  'sample-bank-deposit-slip.jpg',
  'sample-court-summons.pdf',
  'sample-echallan.pdf',
  'sample-health-checkup.pdf',
  'sample-insurance-letter.pdf',
  'sample-invoice-warranty.pdf',
  'sample-lab-report.pdf',
  'sample-mutual-fund-statement.pdf',
  'sample-pension-notice.jpg',
  'sample-prescription.jpg',
  'sample-property-tax-notice.pdf',
]

function blob(text) {
  return JSON.stringify(text).toLowerCase()
}

function hasAmount(text, digits) {
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, ',')
  return text.includes(digits) || text.includes(grouped)
}

/** Printed facts from design/sarvam-v3/samples. A miss is reported; the file is still saved. */
const checks = {
  'sample-lab-report.pdf': (text) => text.includes('11.2') && text.includes('126'),
  'sample-prescription.jpg': (text) => text.includes('amoxicillin') && text.includes('500'),
  'sample-health-checkup.pdf': (text) => text.includes('118') && (text.includes('atorvastatin') || text.includes('3,499') || text.includes('3499')),
  'sample-mutual-fund-statement.pdf': (text) => hasAmount(text, '124300') || text.includes('1,24,300') || text.includes('124,300'),
  'sample-court-summons.pdf': (text) => text.includes('4417') || text.includes('nov'),
  'sample-bank-deposit-slip.jpg': (text) => text.includes('account') || text.includes('deposit'),
  'sample-echallan.pdf': (text) => hasAmount(text, '1000') && (text.includes('dec') || text.includes('helmet')),
  'sample-insurance-letter.pdf': (text) => hasAmount(text, '31200') || text.includes('31,200'),
  'sample-pension-notice.jpg': (text) => text.includes('nov') || text.includes('life'),
  'sample-property-tax-notice.pdf': (text) => hasAmount(text, '3840') || text.includes('3,840'),
  'sample-invoice-warranty.pdf': (text) => hasAmount(text, '20999') || text.includes('20,999') || text.includes('warranty'),
}

function mime(file) {
  if (file.endsWith('.pdf')) return 'application/pdf'
  if (file.endsWith('.png')) return 'image/png'
  return 'image/jpeg'
}

function pause() {
  return new Promise((resolve) => setTimeout(resolve, 5000))
}

async function postOnce(file, send) {
  const started = Date.now()
  const response = await send()
  const body = await response.text()
  const seconds = ((Date.now() - started) / 1000).toFixed(1)
  return { response, body, seconds }
}

async function explain(file) {
  const bytes = readFileSync(join(samplesDir, file))
  let last = ''
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { response, body, seconds } = await postOnce(file, () => {
      const form = new FormData()
      form.append('files', new Blob([bytes], { type: mime(file) }), file)
      form.append('lang', 'en')
      return fetch(`${api}/api/explain`, { method: 'POST', body: form })
    })
    if (response.ok) return { result: JSON.parse(body), seconds }
    last = `${file} explain ${response.status} after ${seconds}s: ${body.slice(0, 180)}`
    console.log(`retry ${attempt} ${last}`)
    await pause()
  }
  throw new Error(last)
}

async function translate(result, lang) {
  let last = ''
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    const { response, body, seconds } = await postOnce(lang, () => fetch(`${api}/api/translate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ result, lang }),
    }))
    if (response.ok) return { result: JSON.parse(body), seconds }
    last = `translate ${lang} ${response.status} after ${seconds}s: ${body.slice(0, 180)}`
    console.log(`retry ${attempt} ${last}`)
    await pause()
  }
  throw new Error(last)
}

mkdirSync(outDir, { recursive: true })
const report = []

for (const file of files) {
  try {
    const englishPath = join(outDir, `${file}.en.json`)
    let english
    if (existsSync(englishPath) && process.env.FORCE !== '1') {
      english = JSON.parse(readFileSync(englishPath, 'utf8'))
      console.log(`${file} en cached`)
    } else {
      const read = await explain(file)
      english = read.result
      const text = blob(english)
      const ok = checks[file](text)
      writeFileSync(englishPath, JSON.stringify(english, null, 2) + '\n')
      report.push({ file, lang: 'en', seconds: read.seconds, facts: ok ? 'match' : 'miss' })
      console.log(`${file} en ${read.seconds}s facts ${ok ? 'match' : 'MISS'}`)
      await pause()
    }

    for (const lang of langs) {
      if (lang === 'en') continue
      const path = join(outDir, `${file}.${lang}.json`)
      if (existsSync(path) && process.env.FORCE !== '1') {
        console.log(`${file} ${lang} cached`)
        continue
      }
      try {
        const translated = await translate(english, lang)
        writeFileSync(path, JSON.stringify(translated.result, null, 2) + '\n')
        report.push({ file, lang, seconds: translated.seconds })
        console.log(`${file} ${lang} ${translated.seconds}s`)
        await pause()
      } catch (error) {
        report.push({ file, lang, error: String(error).slice(0, 240) })
        console.log(`FAILED ${file} ${lang}: ${String(error).slice(0, 180)}`)
      }
    }
  } catch (error) {
    report.push({ file, error: String(error).slice(0, 240) })
    console.log(`FAILED ${file}: ${String(error).slice(0, 240)}`)
  }
}

writeFileSync(join(outDir, 'build-report.json'), JSON.stringify(report, null, 2) + '\n')
console.log('sample results written')
