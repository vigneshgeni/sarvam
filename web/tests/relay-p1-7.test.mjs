import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function loadTsModule(relPath, deps = {}) {
  const ts = (await import('typescript')).default
  const absPath = fs.existsSync(relPath) ? path.resolve(relPath) : path.resolve('web', relPath)
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-p17-')))

  for (const [depName, depRel] of Object.entries(deps)) {
    const depAbs = fs.existsSync(depRel) ? path.resolve(depRel) : path.resolve('web', depRel)
    let depSrc = fs.readFileSync(depAbs, 'utf8')
    for (const [otherName] of Object.entries(deps)) {
      const otherBase = otherName.replace(/\.mjs$/, '.js')
      depSrc = depSrc.replaceAll(`./${otherBase}`, `./${otherName}`)
    }
    const depOut = ts.transpileModule(depSrc, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    }).outputText
    const target = path.join(dir, depName)
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, depOut)
  }

  let src = fs.readFileSync(absPath, 'utf8')
  for (const depName of Object.keys(deps)) {
    const base = depName.replace(/\.mjs$/, '.js')
    src = src.replaceAll(`./${base}`, `./${depName}`)
  }

  const transpiled = ts.transpileModule(src, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  }).outputText

  const entry = path.join(dir, 'entry.mjs')
  fs.writeFileSync(entry, transpiled)
  return await import(entry)
}

function makePcmFrame(rmsTarget, samples = 320) {
  const buf = new ArrayBuffer(samples * 2)
  const view = new Int16Array(buf)
  const amp = Math.min(32767, Math.round(rmsTarget * 32768))
  for (let i = 0; i < samples; i++) {
    // Alternating +/- amp gives exact RMS = amp / 32768
    view[i] = i % 2 === 0 ? amp : -amp
  }
  return buf
}

test('P1.7: ConversationGate adapts to steady noise, emits pre-roll on speech, honors 700ms hangover', async () => {
  const { ConversationGate } = await loadTsModule('src/features/relay/audio/ConversationGate.ts')
  const gate = new ConversationGate()

  let now = 0
  const step = (rms) => {
    now += 20
    return gate.processFrame(makePcmFrame(rms), now)
  }

  // 1.5s of silence -> gate stays closed, 0 frames sent
  for (let i = 0; i < 75; i++) {
    const r = step(0.001)
    assert.equal(r.isOpen, false)
    assert.equal(r.framesToSend.length, 0)
  }

  // Steady ambient noise at 0.025 on a fresh gate -> calibrates floor ~0.025, stays closed
  const noisyGate = new ConversationGate()
  for (let i = 0; i < 100; i++) {
    const r = noisyGate.processFrame(makePcmFrame(0.025), (i + 1) * 20)
    assert.equal(r.isOpen, false)
    assert.equal(r.framesToSend.length, 0)
  }
  assert.ok(noisyGate.getMetrics().noiseFloor >= 0.02, 'Noise floor should adapt to steady noise')

  // Speech burst (0.12 RMS) for 120ms (6 frames) -> opens on 6th frame with 300ms pre-roll (15 frames)
  let openedRes = null
  for (let i = 0; i < 6; i++) {
    const r = step(0.12)
    if (r.speechStarted) openedRes = r
  }
  assert.ok(openedRes, 'Gate should open after 120ms of speech')
  assert.equal(openedRes.isOpen, true)
  assert.equal(openedRes.framesToSend.length, 15, 'Should emit 300ms (15 frames) of pre-roll')

  // Continue speech for 200ms more (10 frames)
  for (let i = 0; i < 10; i++) {
    const r = step(0.11)
    assert.equal(r.isOpen, true)
    assert.equal(r.framesToSend.length, 1)
  }

  // Hangover: 34 frames (680ms) of silence -> still open; 35th frame (700ms) -> closes
  for (let i = 0; i < 34; i++) {
    const r = step(0.002)
    assert.equal(r.isOpen, true)
    assert.equal(r.speechEnded, false)
  }
  const endRes = step(0.002)
  assert.equal(endRes.isOpen, false)
  assert.equal(endRes.speechEnded, true)
  assert.ok(endRes.endedSpeechDurationMs >= 300)
})

test('P1.7: ConversationGate ducks during playback and guards against false barge-in', async () => {
  const { ConversationGate } = await loadTsModule('src/features/relay/audio/ConversationGate.ts')
  const gate = new ConversationGate()

  // Calibrate quiet room (floor ~0.004)
  let now = 0
  for (let i = 0; i < 80; i++) {
    now += 20
    gate.processFrame(makePcmFrame(0.004), now)
  }

  // Gemini starts playing at playbackRms = 0.08
  gate.setPlaybackState(true, 0.08)

  // Room echo at 0.09 RMS must NOT open the gate (threshold = max(base*2, 0.08*1.8+0.03) = 0.174)
  for (let i = 0; i < 20; i++) {
    now += 20
    const r = gate.processFrame(makePcmFrame(0.09), now)
    assert.equal(r.isOpen, false)
  }
  // Server sends false "interrupted" while gate is closed -> MUST be ignored
  assert.equal(gate.shouldAcceptServerInterrupt(now), false)

  // Brief loud clap (140ms = 7 frames at 0.35 RMS) -> opens gate at 120ms, total speech < 200ms -> STILL rejected for barge-in!
  for (let i = 0; i < 7; i++) {
    now += 20
    gate.processFrame(makePcmFrame(0.35), now)
  }
  assert.equal(gate.shouldAcceptServerInterrupt(now), false, 'Sound shorter than 200ms must not stop Gemini')

  // Continued human speech (4 more frames = 220ms total >= 200ms) -> real interrupt ACCEPTED!
  for (let i = 0; i < 4; i++) {
    now += 20
    gate.processFrame(makePcmFrame(0.35), now)
  }
  assert.equal(gate.shouldAcceptServerInterrupt(now), true, 'Deliberate speech >=200ms over playback must accept interrupt')

  // Hold-to-Talk mode only forwards frames while held
  gate.setMode('hold')
  const notHeld = gate.processFrame(makePcmFrame(0.5), now + 20)
  assert.equal(notHeld.framesToSend.length, 0)
  gate.setHolding(true, now + 40)
  const held = gate.processFrame(makePcmFrame(0.02), now + 60)
  assert.equal(held.framesToSend.length, 1)
  assert.equal(gate.shouldAcceptServerInterrupt(now + 60), true)
})

test('P1.7: RelayTurnController state transitions and every watchdog timeout (fake timers)', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 1000 })
  const { RelayTurnController } = await loadTsModule('src/features/relay/relayTurnState.ts')

  let nudges = 0
  let reconnects = []
  let noAnswers = 0
  let silenceReconnects = 0
  let forcedIdles = 0

  const ctrl = new RelayTurnController({
    onStillThinkingNudge: () => { nudges += 1 },
    onReconnectAndResend: (txt) => { reconnects.push(txt) },
    onNoAnswerTimeout: () => { noAnswers += 1 },
    onSocketSilenceReconnect: () => { silenceReconnects += 1 },
    onModelSpeakingForceIdle: () => { forcedIdles += 1 },
  })

  ctrl.setSocketActive(true)
  assert.equal(ctrl.getSnapshot().state, 'idle')

  // Happy path
  ctrl.onUserSpeechStart()
  assert.equal(ctrl.getSnapshot().state, 'userSpeaking')
  ctrl.onUserSpeechEnd('What is the due date?')
  assert.equal(ctrl.getSnapshot().state, 'thinking')
  ctrl.onModelOutput(true)
  assert.equal(ctrl.getSnapshot().state, 'modelSpeaking')
  ctrl.onTurnComplete()
  assert.equal(ctrl.getSnapshot().state, 'idle')

  // Thinking watchdogs: 6s stillThinking + nudge, 12s reconnect + resend, 20s no-answer error
  ctrl.onUserSpeechEnd('Compare page 1 and 2')
  assert.equal(ctrl.getSnapshot().state, 'thinking')

  t.mock.timers.tick(6000)
  assert.equal(ctrl.getSnapshot().stillThinking, true)
  assert.equal(nudges, 1)

  t.mock.timers.tick(6000) // total 12s
  assert.deepEqual(reconnects, ['Compare page 1 and 2'])

  t.mock.timers.tick(8000) // total 20s
  assert.equal(ctrl.getSnapshot().state, 'error')
  assert.equal(noAnswers, 1)

  // Model speaking stall (5s without new audio or turnComplete -> forced idle)
  ctrl.resetToIdle()
  ctrl.onModelOutput(true)
  assert.equal(ctrl.getSnapshot().state, 'modelSpeaking')
  t.mock.timers.tick(5000)
  assert.equal(ctrl.getSnapshot().state, 'idle')
  assert.equal(forcedIdles, 1)

  // Socket silence (30s while idle -> reconnect ping)
  ctrl.recordServerMessage()
  t.mock.timers.tick(30000)
  assert.equal(silenceReconnects, 1)

  ctrl.stop()
})

test('P1.7: TranscriptAssembler drops closed-gate noise, merges fragments, marks cut-off answers with ellipsis', async () => {
  const { TranscriptAssembler } = await loadTsModule('src/features/relay/transcriptAssembler.ts', {
    'captionSanitizer.mjs': 'src/features/relay/captionSanitizer.ts',
    'live/relayPrompt.mjs': 'src/features/relay/live/relayPrompt.ts',
  })

  const asm = new TranscriptAssembler()

  // Input while gate closed -> dropped
  assert.equal(asm.pushInputFragment('background tv chatter', { gateActive: false }), false)
  assert.equal(asm.commitUserTurn(1000), null)
  assert.equal(asm.getTurns().length, 0)

  // Short noise burst (<2 words AND <400ms) -> dropped
  assert.equal(asm.pushInputFragment('hmm', { gateActive: true }), true)
  assert.equal(asm.commitUserTurn(250), null)
  assert.equal(asm.getTurns().length, 0)

  // Multi-fragment real user turn -> shown ONLY after commitUserTurn
  asm.pushInputFragment('What is ', { gateActive: true })
  asm.pushInputFragment('the total? ⚡', { gateActive: true })
  assert.equal(asm.getTurns().length, 0, 'User bubble must not appear before turn ends')
  const userTurn = asm.commitUserTurn(900)
  assert.ok(userTurn)
  assert.equal(userTurn.who, 'You')
  assert.equal(userTurn.text, 'What is the total?')

  // Streaming Gemini output + genuine interrupt -> marked with ellipsis, NOT complete, NO lightning bolt
  asm.pushOutputFragment('The total amount is ')
  asm.pushOutputFragment('rupees five hundred')
  assert.equal(asm.getTurns().length, 2)
  assert.equal(asm.getTurns()[1].isComplete, false)

  const cut = asm.interruptModelTurn()
  assert.ok(cut)
  assert.equal(cut.text, 'The total amount is rupees five hundred…')
  assert.equal(cut.interrupted, true)
  assert.equal(cut.isComplete, false)
  assert.ok(!cut.text.includes('⚡'))

  // Normal completed Gemini answer
  asm.pushOutputFragment('Due date is 5 December.')
  const done = asm.completeModelTurn()
  assert.ok(done)
  assert.equal(done.isComplete, true)
  assert.equal(done.text, 'Due date is 5 December.')
})

test('P1.7: relayPrompt includes conversation hygiene sentences without bracketed speaker notes', async () => {
  const { buildSoloSystemPrompt, buildLiveVideoSystemPrompt } = await loadTsModule(
    'src/features/relay/live/relayPrompt.ts',
  )
  for (const p of [buildSoloSystemPrompt('auto'), buildLiveVideoSystemPrompt('auto')]) {
    assert.ok(p.includes('Only respond to people who are asking you something or speaking to you.'))
    assert.ok(p.includes('If people are talking to each other, stay silent.'))
    assert.ok(p.includes('Ignore background noise, music and other voices that are not addressed to you.'))
    assert.ok(p.includes('Finish your answer unless a person clearly interrupts.'))
    assert.ok(p.includes('Never use emoji.'))
  }
})
