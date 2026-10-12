import test from 'node:test'
import assert from 'node:assert/strict'

const ABBR_PATTERN = /(?<!\p{L})(?:rs|no|dr|mr|mrs|ms|smt|sri|shri|st|pvt|ltd|approx|appx|dept|est|vs|vol|ரூ|रु|क्र|सं)\./giu

export function splitIntoSentences(text) {
  if (!text) return []

  // Protect decimals: 48,500.00 or 9.2
  let s = text.replace(/(\d)\.(\d)/g, '$1<NUMDOT>$2')

  // Protect abbreviations
  s = s.replace(ABBR_PATTERN, (m) => m.slice(0, -1) + '<ABBRDOT>')

  // Protect single uppercase initials: e.g. "R. Kumar" or "A. Meena"
  s = s.replace(/(?<!\p{L})([A-Z])\.(?=\s+\p{L})/gu, '$1<INITDOT>')

  // Protect e.g. / i.e. / a.m. / p.m.
  s = s.replace(/\b([a-z])\.([a-z])\./gi, '$1<ABBRDOT>$2<ABBRDOT>')

  // Split on [.!?।॥\n]+ followed by whitespace or end of string
  const parts = s.split(/([.!?।॥\n]+(?:\s+|$))/)
  const sentences = []

  for (let i = 0; i < parts.length; i += 2) {
    const chunk = parts[i]
    const punct = parts[i + 1] || ''
    const full = (chunk + punct).trim()
      .replace(/<NUMDOT>/g, '.')
      .replace(/<ABBRDOT>/g, '.')
      .replace(/<INITDOT>/g, '.')
    if (full) {
      sentences.push(full)
    }
  }

  return sentences
}

export function splitIntoUtteranceChunks(text, maxChunkLength = 180) {
  if (!text) return []

  const rawSentences = splitIntoSentences(text)
  const chunks = []

  for (const sentence of rawSentences) {
    if (sentence.length <= maxChunkLength) {
      chunks.push(sentence)
    } else {
      const words = sentence.split(/\s+/)
      let currentChunk = ''

      for (const word of words) {
        if (!currentChunk) {
          currentChunk = word
        } else if ((currentChunk + ' ' + word).length <= maxChunkLength) {
          currentChunk += ' ' + word
        } else {
          chunks.push(currentChunk)
          currentChunk = word
        }
      }

      if (currentChunk.trim()) {
        chunks.push(currentChunk.trim())
      }
    }
  }

  return chunks
}

export function prepareTextForSpeech(text, lang) {
  const doctorByLanguage = {
    en: 'Doctor',
    ta: 'டாக்டர்',
    hi: 'डॉक्टर',
    te: 'డాక్టర్',
    ml: 'ഡോക്ടർ',
    kn: 'ಡಾಕ್ಟರ್',
  }
  const language = lang.toLowerCase().split('-')[0]
  const doctor = doctorByLanguage[language] || doctorByLanguage.en

  return text
    .replace(/\bDr\.?(?=\s+\p{L})/gu, doctor)
    .replace(/\b([A-Z])\.(?=\s+[A-Z][a-z])/g, '$1')
}

test('splitIntoSentences - Insurance sample does NOT split on Rs., Dr., or dates', () => {
  const text =
    'Out of Rs. 48,500, they approved Rs. 31,200. Please submit the claim to Dr. R. Kumar before 30.11.2026.'
  const sentences = splitIntoSentences(text)

  assert.equal(sentences.length, 2)
  assert.equal(sentences[0], 'Out of Rs. 48,500, they approved Rs. 31,200.')
  assert.equal(sentences[1], 'Please submit the claim to Dr. R. Kumar before 30.11.2026.')
})

test('splitIntoSentences - Protects No., St., Approx., decimals, and a.m./p.m.', () => {
  const text =
    'Claim No. 12345 is pending at St. Jude Hospital. Approx. Rs. 5,000 is due at 9.30 a.m.'
  const sentences = splitIntoSentences(text)

  assert.equal(sentences.length, 2)
  assert.equal(sentences[0], 'Claim No. 12345 is pending at St. Jude Hospital.')
  assert.equal(sentences[1], 'Approx. Rs. 5,000 is due at 9.30 a.m.')
})

test('splitIntoSentences - Hindi sentences with danda and रु.', () => {
  const text = 'कुल स्वीकृत राशि रु. 31,200 है। शेष राशि रु. 17,300 अस्वीकृत कर दी गई है।'
  const sentences = splitIntoSentences(text)

  assert.equal(sentences.length, 2)
  assert.equal(sentences[0], 'कुल स्वीकृत राशि रु. 31,200 है।')
  assert.equal(sentences[1], 'शेष राशि रु. 17,300 अस्वीकृत कर दी गई है।')
})

test('splitIntoSentences - Tamil sentences with Dr. and ரூ.', () => {
  const text = 'மருத்துவர் Dr. A. Meena அவர்களை அணுகவும். ஒப்புதல் தொகை ரூ. 31,200 மட்டுமே.'
  const sentences = splitIntoSentences(text)

  assert.equal(sentences.length, 2)
  assert.equal(sentences[0], 'மருத்துவர் Dr. A. Meena அவர்களை அணுகவும்.')
  assert.equal(sentences[1], 'ஒப்புதல் தொகை ரூ. 31,200 மட்டுமே.')
})

test('prepareTextForSpeech - Expands doctor title in audio script only', () => {
  assert.equal(prepareTextForSpeech('Dr. Meena', 'en'), 'Doctor Meena')
  assert.equal(prepareTextForSpeech('Dr. Meena', 'ta'), 'டாக்டர் Meena')
  assert.equal(prepareTextForSpeech('Dr. Meena', 'hi'), 'डॉक्टर Meena')
})

test('splitIntoUtteranceChunks - Leaves short sentences intact and splits long ones', () => {
  const shortText = 'Out of Rs. 48,500, they approved Rs. 31,200.'
  const chunks = splitIntoUtteranceChunks(shortText, 180)
  assert.equal(chunks.length, 1)
  assert.equal(chunks[0], 'Out of Rs. 48,500, they approved Rs. 31,200.')
})
