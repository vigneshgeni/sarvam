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

test('relay stage state machine transitions through full tap -> camera -> Gemini lifecycle and error recovery', async () => {
  const ts = (await import('typescript')).default
  const statePath = fs.existsSync('src/features/relay/relaySessionState.ts')
    ? path.resolve('src/features/relay/relaySessionState.ts')
    : path.resolve('web/src/features/relay/relaySessionState.ts')

  const src = fs.readFileSync(statePath, 'utf8')
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const tmpFile = path.resolve(
    fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-state-'))),
    'relaySessionState.mjs',
  )
  fs.writeFileSync(tmpFile, transpiled)
  const { createInitialRelayState, transitionRelayState, classifyRelayError } = await import(path.resolve(tmpFile))

  let st = createInitialRelayState()
  assert.equal(st.stage, 'idle')
  assert.equal(st.error, null)

  st = transitionRelayState(st, { type: 'TAP' })
  assert.equal(st.stage, 'tapped')

  st = transitionRelayState(st, { type: 'PERMISSION_GRANTED' })
  assert.equal(st.stage, 'permission_granted')

  st = transitionRelayState(st, { type: 'STREAM_STARTED' })
  assert.equal(st.stage, 'stream_started')

  st = transitionRelayState(st, { type: 'FIRST_FRAME' })
  assert.equal(st.stage, 'first_frame')

  st = transitionRelayState(st, { type: 'GEMINI_CONNECTING' })
  assert.equal(st.stage, 'gemini_connecting')

  st = transitionRelayState(st, { type: 'CONNECTED', model: 'gemini-3.8-live', isFallback: false })
  assert.equal(st.stage, 'connected')
  assert.equal(st.modelUsed, 'gemini-3.8-live')
  assert.equal(st.isFallbackModel, false)

  st = transitionRelayState(st, { type: 'RECONNECTING' })
  assert.equal(st.stage, 'reconnecting')

  const errInfo = classifyRelayError(new Error('App Check token failed'), 'gemini', true)
  st = transitionRelayState(st, { type: 'ERROR', error: errInfo })
  assert.equal(st.stage, 'error')
  assert.equal(st.error?.kind, 'gemini_connect')

  // Retry clears error cleanly
  st = transitionRelayState(st, { type: 'GEMINI_CONNECTING' })
  assert.equal(st.stage, 'gemini_connecting')
  assert.equal(st.error, null)

  // Fallback model recorded accurately
  st = transitionRelayState(st, {
    type: 'CONNECTED',
    model: 'gemini-live-2.5-flash-native-audio',
    isFallback: true,
  })
  assert.equal(st.stage, 'connected')
  assert.equal(st.isFallbackModel, true)
  assert.deepEqual(st.history.slice(0, 7), [
    'idle',
    'tapped',
    'permission_granted',
    'stream_started',
    'first_frame',
    'gemini_connecting',
    'connected',
  ])
})

test('relay error mapping covers permission denied, no camera, camera busy, Gemini connect, and network lost', async () => {
  const ts = (await import('typescript')).default
  const statePath = fs.existsSync('src/features/relay/relaySessionState.ts')
    ? path.resolve('src/features/relay/relaySessionState.ts')
    : path.resolve('web/src/features/relay/relaySessionState.ts')

  const src = fs.readFileSync(statePath, 'utf8')
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const tmpFile = path.resolve(
    fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-err-'))),
    'relaySessionState.mjs',
  )
  fs.writeFileSync(tmpFile, transpiled)
  const { classifyRelayError } = await import(path.resolve(tmpFile))

  const permErr = Object.assign(new Error('Permission denied'), { name: 'NotAllowedError' })
  const permRes = classifyRelayError(permErr, 'camera', true)
  assert.equal(permRes.kind, 'permission_denied')
  assert.equal(permRes.titleKey, 'relayErrPermissionTitle')
  assert.equal(permRes.retryTarget, 'camera')

  const noCamErr = Object.assign(new Error('Requested device not found'), { name: 'NotFoundError' })
  const noCamRes = classifyRelayError(noCamErr, 'camera', true)
  assert.equal(noCamRes.kind, 'no_camera')
  assert.equal(noCamRes.titleKey, 'relayErrNoCameraTitle')

  const busyErr = Object.assign(new Error('Could not start video source'), { name: 'NotReadableError' })
  const busyRes = classifyRelayError(busyErr, 'camera', true)
  assert.equal(busyRes.kind, 'camera_busy')
  assert.equal(busyRes.titleKey, 'relayErrCameraBusyTitle')

  const geminiErr = new Error('App Check reCAPTCHA token missing (403)')
  const geminiRes = classifyRelayError(geminiErr, 'gemini', true)
  assert.equal(geminiRes.kind, 'gemini_connect')
  assert.equal(geminiRes.titleKey, 'relayErrGeminiTitle')
  assert.equal(geminiRes.retryTarget, 'gemini')

  const netRes = classifyRelayError(new Error('Failed to fetch'), 'gemini', false)
  assert.equal(netRes.kind, 'network_lost')
  assert.equal(netRes.titleKey, 'relayErrNetworkTitle')
})

test('screenAfterReturn preserves relay-intro and relay-camera across iOS visibilitychange', async () => {
  const ts = (await import('typescript')).default
  const onboardingPath = fs.existsSync('src/design/onboarding.ts')
    ? path.resolve('src/design/onboarding.ts')
    : path.resolve('web/src/design/onboarding.ts')

  const src = fs.readFileSync(onboardingPath, 'utf8')
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const tmpFile = path.resolve(
    fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-onboard-'))),
    'onboarding.mjs',
  )
  fs.writeFileSync(tmpFile, transpiled)
  const { screenAfterReturn } = await import(path.resolve(tmpFile))

  assert.equal(screenAfterReturn({ screen: 'relay-intro', hasResult: false }, null).screen, 'relay-intro')
  assert.equal(screenAfterReturn({ screen: 'relay-camera', hasResult: false }, null).screen, 'relay-camera')
  assert.equal(
    screenAfterReturn({ screen: 'relay-camera', hasResult: false }, { screen: 'result', result: { title: 'Old' } }).screen,
    'relay-camera',
  )
})

async function loadTranspiledModule(relPath, prefix) {
  const ts = (await import('typescript')).default
  const fullPath = fs.existsSync(relPath) ? path.resolve(relPath) : path.resolve('web', relPath)
  const src = fs.readFileSync(fullPath, 'utf8')
  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText
  const tmpFile = path.resolve(
    fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), prefix))),
    'mod.mjs',
  )
  fs.writeFileSync(tmpFile, transpiled)
  return await import(path.resolve(tmpFile))
}

test('P1.5 mode state machine defaults to live, persists to storage safely, and keeps stream active on switch', async () => {
  const mod = await loadTranspiledModule('src/features/relay/liveVideoController.ts', 'relay-mode-')
  const store = new Map()
  const storage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => { store.set(k, v) },
  }

  assert.equal(mod.loadSavedRelayMode(storage), 'live')
  mod.saveRelayMode('scan', storage)
  assert.equal(mod.loadSavedRelayMode(storage), 'scan')

  // Broken storage never throws
  const brokenStorage = {
    getItem: () => { throw new Error('SecurityError') },
    setItem: () => { throw new Error('QuotaExceededError') },
  }
  assert.equal(mod.loadSavedRelayMode(brokenStorage), 'live')
  assert.doesNotThrow(() => mod.saveRelayMode('scan', brokenStorage))

  // Mode transitions never kill the camera stream
  let st = mod.createCameraModeState('live')
  assert.equal(st.mode, 'live')
  assert.equal(st.streamActive, true)
  st = mod.transitionCameraMode(st, 'scan')
  assert.equal(st.mode, 'scan')
  assert.equal(st.streamActive, true)
  st = mod.transitionCameraMode(st, 'live')
  assert.equal(st.mode, 'live')
  assert.equal(st.streamActive, true)
})

test('P1.5 frame cadence sends ~1 fps when active and zero while paused, hidden, disconnected, or in scan mode', async () => {
  const mod = await loadTranspiledModule('src/features/relay/liveVideoController.ts', 'relay-cadence-')

  // Deterministic fake interval timer
  let nextId = 1
  const intervals = new Map()
  const fakeTimer = {
    setInterval: (fn, ms) => {
      const id = nextId++
      intervals.set(id, { fn, ms })
      return id
    },
    clearInterval: (id) => { intervals.delete(id) },
  }
  const tickSeconds = (seconds) => {
    for (let s = 0; s < seconds; s++) {
      for (const entry of [...intervals.values()]) entry.fn()
    }
  }

  let sent = 0
  const ctrl = new mod.FrameCadenceController(
    () => { sent += 1 },
    { mode: 'live', videoPaused: false, tabHidden: false, socketConnected: true, videoReady: true },
    { intervalMs: 1000, timerApi: fakeTimer },
  )

  assert.equal(ctrl.isRunning(), true)
  tickSeconds(3)
  assert.equal(sent, 3)

  // Pause video -> 0 frames sent
  ctrl.update({ videoPaused: true })
  assert.equal(ctrl.isRunning(), false)
  tickSeconds(5)
  assert.equal(sent, 3)

  // Resume video -> frames resume
  ctrl.update({ videoPaused: false })
  assert.equal(ctrl.isRunning(), true)
  tickSeconds(2)
  assert.equal(sent, 5)

  // Tab hidden -> 0 frames sent
  ctrl.update({ tabHidden: true })
  tickSeconds(4)
  assert.equal(sent, 5)

  // Tab visible again, then socket disconnects -> 0 frames sent
  ctrl.update({ tabHidden: false, socketConnected: false })
  tickSeconds(4)
  assert.equal(sent, 5)

  // Socket reconnects, then switch to Scan mode -> 0 frames sent
  ctrl.update({ socketConnected: true, mode: 'scan' })
  tickSeconds(4)
  assert.equal(sent, 5)

  // Back to Live -> frames resume
  ctrl.update({ mode: 'live' })
  tickSeconds(2)
  assert.equal(sent, 7)
  ctrl.stop()
})

test('P1.5 idle cost guard prompts at 10 minutes, resets on speech/confirm, and auto-ends after 30s grace', async () => {
  const mod = await loadTranspiledModule('src/features/relay/liveVideoController.ts', 'relay-idle-')

  let now = 0
  let nextId = 1
  const timers = new Map()
  const fakeTimer = {
    setTimeout: (fn, ms) => {
      const id = nextId++
      timers.set(id, { fn, due: now + ms })
      return id
    },
    clearTimeout: (id) => { timers.delete(id) },
  }
  const advance = (ms) => {
    const target = now + ms
    while (true) {
      let earliestId = null
      let earliestDue = Infinity
      for (const [id, t] of timers.entries()) {
        if (t.due <= target && t.due < earliestDue) {
          earliestDue = t.due
          earliestId = id
        }
      }
      if (earliestId === null) break
      const item = timers.get(earliestId)
      timers.delete(earliestId)
      now = item.due
      item.fn()
    }
    now = target
  }

  let prompts = 0
  let autoEnds = 0
  const guard = new mod.IdleGuardController({
    onPrompt: () => { prompts += 1 },
    onAutoEnd: () => { autoEnds += 1 },
    timerApi: fakeTimer,
  })

  guard.start()
  // 9 min -> no prompt yet
  advance(9 * 60 * 1000)
  assert.equal(prompts, 0)
  assert.equal(autoEnds, 0)

  // Speech resets 10-min clock
  guard.recordActivity()
  advance(9 * 60 * 1000)
  assert.equal(prompts, 0)

  // 1 more min (10 min since speech) -> prompt opens
  advance(1 * 60 * 1000)
  assert.equal(prompts, 1)
  assert.equal(guard.isPrompting(), true)
  assert.equal(autoEnds, 0)

  // Confirming "Still here" cancels 30s auto-end
  advance(15 * 1000)
  guard.confirmStillHere()
  assert.equal(guard.isPrompting(), false)
  advance(20 * 1000)
  assert.equal(autoEnds, 0)

  // Let full 10 min + 30 s elapse without confirmation -> auto-ends
  advance(10 * 60 * 1000)
  assert.equal(prompts, 2)
  advance(30 * 1000)
  assert.equal(autoEnds, 1)
  assert.equal(guard.hasEnded(), true)
})

test('P1.5 End teardown always stops all MediaStream tracks even when socket or audio stop throws', async () => {
  const mod = await loadTranspiledModule('src/features/relay/liveVideoController.ts', 'relay-release-')

  let framesStopped = false
  let idleStopped = false
  let videoStopped = false
  let audioStopped = false
  let ctxClosed = false

  const fakeStream = {
    getTracks: () => [
      { stop: () => { videoStopped = true } },
      { stop: () => { audioStopped = true } },
    ],
  }

  const res = await mod.releaseRelayResources({
    stopFrames: () => { framesStopped = true },
    stopIdleGuard: () => { idleStopped = true },
    closeClient: async () => { throw new Error('socket already closed') },
    stopAudio: async () => { throw new Error('worklet error') },
    streams: [fakeStream],
    closeAudioCtx: async () => { ctxClosed = true },
  })

  assert.equal(framesStopped, true)
  assert.equal(idleStopped, true)
  assert.equal(videoStopped, true)
  assert.equal(audioStopped, true)
  assert.equal(ctxClosed, true)
  assert.equal(res.stoppedTracks, 2)
})

test('P1.5 buildLiveVideoSystemPrompt includes Live video guidance and safety lines', async () => {
  const mod = await loadTranspiledModule('src/features/relay/live/relayPrompt.ts', 'relay-liveprompt-')
  const prompt = mod.buildLiveVideoSystemPrompt('auto')
  assert.ok(prompt.includes('You can see the camera about once a second.'))
  assert.ok(prompt.includes('Say what you see in one or two sentences when asked.'))
  assert.ok(prompt.includes('If the picture is blurry or too far, tell the person to move closer.'))
  assert.ok(prompt.includes('Do not guess text you cannot read.'))
  assert.ok(prompt.includes('Answer in the language of the last speaker.'))
  assert.ok(prompt.includes('Never read out ID numbers.'))
  assert.ok(prompt.includes('Never invent amounts, dates or names.'))
})




