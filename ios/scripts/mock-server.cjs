const http = require('http')
const url = require('url')

const PORT = process.env.MOCK_PORT ? parseInt(process.env.MOCK_PORT, 10) : 8080

// Small 1-second valid MP3 frame (silence)
const SILENT_MP3 = Buffer.from([
  0xff, 0xfb, 0x90, 0x64, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
  0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00
])

const server = http.createServer((req, res) => {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', '*')

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const parsedUrl = url.parse(req.url, true)
  const pathname = parsedUrl.pathname

  // Configurable mock delay (seconds)
  const delaySec = parseFloat(
    req.headers['x-mock-delay'] || parsedUrl.query.delay || process.env.MOCK_DELAY || '2'
  )
  // Configurable status code
  const mockStatus = parseInt(
    req.headers['x-mock-status'] || parsedUrl.query.status || process.env.MOCK_STATUS || '200',
    10
  )

  let body = []
  req.on('data', chunk => body.push(chunk))
  req.on('end', () => {
    setTimeout(() => {
      if (pathname === '/api/explain') {
        if (mockStatus === 429) {
          res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '10' })
          res.end(JSON.stringify({ error: 'Rate limit exceeded', messageLocal: 'Too many requests. Please wait.' }))
          return
        }
        if (mockStatus === 503) {
          res.writeHead(503, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Service Unavailable', messageLocal: 'Service is busy. Please try again soon.' }))
          return
        }
        if (mockStatus === 504) {
          res.writeHead(504, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'Gateway Timeout', messageLocal: 'Analysis timed out.' }))
          return
        }
        if (mockStatus === 999 || parsedUrl.query.malformed === 'true') {
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end('{ malformed: true, missing_bracket: ')
          return
        }

        // Default 200 Success
        res.writeHead(200, { 'Content-Type': 'application/json' })
        const responseData = {
          id: 'mock-doc-' + Date.now(),
          title: 'Blood Test Report.pdf',
          document_kind: 'lab_report',
          language: 'en',
          report_title: 'Complete Blood Count (CBC)',
          summary: [
            'All parameters are within normal reference ranges.',
            'Fasting blood sugar is 92 mg/dL, indicating healthy glucose control.',
            'Hemoglobin level is 14.2 g/dL with normal platelet counts.'
          ],
          key_points: [
            { label: 'Fasting Blood Sugar', value: '92 mg/dL', status: 'normal' },
            { label: 'Hemoglobin', value: '14.2 g/dL', status: 'normal' },
            { label: 'Platelet Count', value: '250,000 / mcL', status: 'normal' }
          ],
          actions: [
            { title: 'Annual Health Checkup', date: '2027-11-05', category: 'appointment' }
          ],
          suggested_questions: [
            'What is a normal fasting glucose level?',
            'When should I get my next checkup?'
          ]
        }
        res.end(JSON.stringify(responseData))
      } else if (pathname === '/api/tts' || pathname === '/api/speak') {
        res.writeHead(200, {
          'Content-Type': 'audio/mpeg',
          'Content-Length': SILENT_MP3.length
        })
        res.end(SILENT_MP3)
      } else if (pathname === '/api/ask') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({
          answer: 'Your fasting blood sugar of 92 mg/dL is within the normal healthy range (70-99 mg/dL).',
          follow_ups: ['How often should I test glucose?']
        }))
      } else {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'Not found' }))
      }
    }, delaySec * 1000)
  })
})

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[MockServer] Running at http://127.0.0.1:${PORT}`)
})
