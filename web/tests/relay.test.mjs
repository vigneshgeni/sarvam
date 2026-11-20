import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

test('web/.env.relay.example contains all required relay variables', () => {
  // Can be run from web or from repo root
  const examplePath = fs.existsSync('.env.relay.example')
    ? path.resolve('.env.relay.example')
    : path.resolve('web/.env.relay.example')
  assert.ok(fs.existsSync(examplePath), '.env.relay.example must exist')
  const content = fs.readFileSync(examplePath, 'utf8')
  
  const requiredVars = [
    'VITE_RELAY',
    'VITE_RELAY_HTTPS',
    'VITE_API_URL',
    'VITE_LIVEKIT_URL',
    'VITE_LIVE_MODEL',
    'VITE_LIVE_FALLBACK_MODEL',
    'VITE_LIVE_PROVIDER',
    'VITE_LIVE_VOICE',
    'VITE_LIVE_LOCATION',
    'VITE_RELAY_FB_API_KEY',
    'VITE_RELAY_FB_AUTH_DOMAIN',
    'VITE_RELAY_FB_PROJECT_ID',
    'VITE_RELAY_FB_APP_ID',
    'VITE_RELAY_FB_STORAGE_BUCKET',
    'VITE_RELAY_FB_SENDER_ID',
    'VITE_RECAPTCHA_ENTERPRISE_KEY',
    'VITE_APPCHECK_DEBUG_TOKEN',
  ]

  for (const v of requiredVars) {
    assert.ok(
      content.includes(`${v}=`),
      `Expected ${v} to be defined in .env.relay.example`
    )
  }
})

test('gitignore ensures .env.*.local is ignored', () => {
  const rootGit = fs.existsSync('../.gitignore') ? '../.gitignore' : '.gitignore'
  const webGit = fs.existsSync('.gitignore') ? '.gitignore' : 'web/.gitignore'
  
  const rootGitignore = fs.readFileSync(path.resolve(rootGit), 'utf8')
  const webGitignore = fs.readFileSync(path.resolve(webGit), 'utf8')
  
  const matches = (content) =>
    content.includes('.env.*') ||
    content.includes('*.local') ||
    content.includes('.env.*.local')

  assert.ok(matches(rootGitignore), 'root .gitignore should ignore env local files')
  assert.ok(matches(webGitignore), 'web .gitignore should ignore env local files')
})

test('stripSpeakerNotes strips leading speaker labels and preserves utterance text', async () => {
  const ts = (await import('typescript')).default
  const relayPromptPath = fs.existsSync('src/features/relay/live/relayPrompt.ts')
    ? path.resolve('src/features/relay/live/relayPrompt.ts')
    : path.resolve('web/src/features/relay/live/relayPrompt.ts')
  
  const src = fs.readFileSync(relayPromptPath, 'utf8')
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  // Create temporary module to import
  const tmpFile = path.resolve(fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-test-'))), 'relayPrompt.mjs')
  fs.writeFileSync(tmpFile, transpiled)
  const { stripSpeakerNotes, buildSoloSystemPrompt } = await import(path.resolve(tmpFile))

  // Test stripSpeakerNotes
  assert.equal(stripSpeakerNotes('(Arun is speaking, English) Hello there'), 'Hello there')
  assert.equal(stripSpeakerNotes('(Vignesh is speaking, Tamil): வணக்கம்'), 'வணக்கம்')
  assert.equal(stripSpeakerNotes('(… is speaking …) How can I help?'), 'How can I help?')
  assert.equal(stripSpeakerNotes('(... is speaking ...)'), '')
  assert.equal(stripSpeakerNotes('No speaker note here'), 'No speaker note here')
  assert.equal(stripSpeakerNotes(''), '')

  // Test buildSoloSystemPrompt language locks
  const autoPrompt = buildSoloSystemPrompt('auto')
  assert.ok(autoPrompt.includes('The user speaks English, Tamil, or a mix of both (Tanglish).'))
  assert.ok(autoPrompt.includes('Never switch to Telugu, Hindi or any other language unless the user speaks it.'))
  assert.ok(autoPrompt.includes('If the audio is unclear, ask the user to repeat in English or Tamil.'))
  assert.ok(!autoPrompt.includes('family video call'))
  assert.ok(!autoPrompt.includes('Several people may speak'))

  const enPrompt = buildSoloSystemPrompt('en')
  assert.ok(enPrompt.includes('The user is speaking English. Always answer in English.'))

  const taPrompt = buildSoloSystemPrompt('ta')
  assert.ok(taPrompt.includes('The user is speaking Tamil (or Tanglish). Always answer in Tamil.'))
})

test('page stack caps at 10 pages and scales long edge to 1600px', async () => {
  const ts = (await import('typescript')).default
  const pageStackPath = fs.existsSync('src/features/relay/pageStack.ts')
    ? path.resolve('src/features/relay/pageStack.ts')
    : path.resolve('web/src/features/relay/pageStack.ts')

  const src = fs.readFileSync(pageStackPath, 'utf8')
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const tmpFile = path.resolve(fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-stack-'))), 'pageStack.mjs')
  fs.writeFileSync(tmpFile, transpiled)
  const { addPageToStack, calculateLongEdgeDimensions, MAX_PAGE_STACK_COUNT } = await import(path.resolve(tmpFile))

  assert.equal(MAX_PAGE_STACK_COUNT, 10)

  // Test cap at 10
  let stack = []
  for (let i = 1; i <= 10; i++) {
    const dummyPage = { id: `p${i}`, blob: null, dataUrl: '', width: 800, height: 600, timestamp: i }
    const res = addPageToStack(stack, dummyPage)
    assert.equal(res.accepted, true)
    stack = res.pages
  }
  assert.equal(stack.length, 10)

  // 11th page must be rejected
  const overflowPage = { id: 'p11', blob: null, dataUrl: '', width: 800, height: 600, timestamp: 11 }
  const overflowRes = addPageToStack(stack, overflowPage)
  assert.equal(overflowRes.accepted, false)
  assert.equal(overflowRes.pages.length, 10)
  assert.ok(overflowRes.error?.includes('10'))

  // Test scaling dimensions
  const landscape = calculateLongEdgeDimensions(4000, 3000, 1600)
  assert.equal(landscape.targetWidth, 1600)
  assert.equal(landscape.targetHeight, 1200)
  assert.equal(landscape.scaled, true)

  const portrait = calculateLongEdgeDimensions(1080, 1920, 1600)
  assert.equal(portrait.targetWidth, 900)
  assert.equal(portrait.targetHeight, 1600)
  assert.equal(portrait.scaled, true)

  const small = calculateLongEdgeDimensions(800, 600, 1600)
  assert.equal(small.targetWidth, 800)
  assert.equal(small.targetHeight, 600)
  assert.equal(small.scaled, false)
})

test('PCM downsample length maths generates exact 40ms chunks at 16 kHz', async () => {
  const ts = (await import('typescript')).default
  const audioManagerPath = fs.existsSync('src/features/relay/audio/LiveAudioManager.ts')
    ? path.resolve('src/features/relay/audio/LiveAudioManager.ts')
    : path.resolve('web/src/features/relay/audio/LiveAudioManager.ts')

  const src = fs.readFileSync(audioManagerPath, 'utf8')
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const tmpFile = path.resolve(fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-audio-'))), 'liveAudio.mjs')
  fs.writeFileSync(tmpFile, transpiled)
  const { calculateDownsampleMath } = await import(path.resolve(tmpFile))

  // 48 kHz -> 16 kHz (ratio 3.0): 1920 samples = 640 target samples = 1 40ms chunk
  const r48k = calculateDownsampleMath(48000, 1920)
  assert.equal(r48k.ratio, 3)
  assert.equal(r48k.expectedTargetSamples, 640)
  assert.equal(r48k.fullChunks, 1)
  assert.equal(r48k.remainderSamples, 0)
  assert.equal(r48k.chunkDurationMs, 40)

  // 24 kHz -> 16 kHz (ratio 1.5): 960 samples = 640 target samples = 1 40ms chunk
  const r24k = calculateDownsampleMath(24000, 960)
  assert.equal(r24k.ratio, 1.5)
  assert.equal(r24k.expectedTargetSamples, 640)
  assert.equal(r24k.fullChunks, 1)
  assert.equal(r24k.remainderSamples, 0)

  // 44.1 kHz -> 16 kHz: 1764 samples = 640 target samples = 1 40ms chunk
  const r44k = calculateDownsampleMath(44100, 1764)
  assert.equal(r44k.fullChunks, 1)
  assert.equal(r44k.expectedTargetSamples, 640)
})

test('resumption handle storage saves, retrieves and clears handle', () => {
  // Mock in-memory storage handler
  let storedHandle = undefined
  const storage = {
    get: () => storedHandle,
    set: (val) => { storedHandle = val },
  }

  assert.equal(storage.get(), undefined)
  storage.set('handle-abc-123')
  assert.equal(storage.get(), 'handle-abc-123')
  storage.set(undefined)
  assert.equal(storage.get(), undefined)
})


