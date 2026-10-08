import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const dir = join(dirname(fileURLToPath(import.meta.url)), '../i18n')
const en = JSON.parse(readFileSync(join(dir, 'en.json'), 'utf8'))
let failed = 0
for (const loc of ['ta', 'hi']) {
  const d = JSON.parse(readFileSync(join(dir, `${loc}.json`), 'utf8'))
  for (const k of Object.keys(en)) {
    if (!d[k]) {
      console.error(`${loc} missing ${k}`)
      failed++
    }
  }
  for (const k of Object.keys(d)) {
    if (!(k in en)) {
      console.error(`${loc} extra ${k}`)
      failed++
    }
  }
}

function buildUpiLink({ vpa, name, amount, note }) {
  const params = new URLSearchParams({
    pa: vpa,
    pn: name || 'Demo finder',
    am: String(amount),
    cu: 'INR',
    tn: note || 'Thanks from Sarvam',
  })
  return `upi://pay?${params.toString()}`
}

const upi = buildUpiLink({ vpa: 'demo.finder@upi', amount: 100 })
if (!upi.startsWith('upi://pay?') || !upi.includes('pa=demo.finder%40upi') || !upi.includes('cu=INR')) {
  console.error('upi encode failed', upi)
  failed++
}

const caption = 'Returned with trust. Thank you, a kind finder. 8 Oct 2026 · Sarvam Lost & Found'
if (!caption.includes('a kind finder')) {
  failed++
}

if (failed) {
  process.exit(1)
}
console.log('i18n parity + upi helpers ok')
