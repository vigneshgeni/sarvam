import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function loadTsModule(relPath, deps = {}) {
  const ts = (await import('typescript')).default
  const absPath = fs.existsSync(relPath) ? path.resolve(relPath) : path.resolve('web', relPath)
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-p3-')))

  for (const [depName, depRel] of Object.entries(deps)) {
    const depAbs = fs.existsSync(depRel) ? path.resolve(depRel) : path.resolve('web', depRel)
    let depSrc = fs.readFileSync(depAbs, 'utf8')
    for (const [otherName] of Object.entries(deps)) {
      const otherBase = otherName.replace(/\.mjs$/, '.js')
      depSrc = depSrc.replaceAll(`./${otherBase}`, `./${otherName}`)
      depSrc = depSrc.replaceAll(`../${otherBase}`, `../${otherName}`)
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
    src = src.replaceAll(`../${base}`, `./${depName}`)
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
    view[i] = i % 2 === 0 ? amp : -amp
  }
  return buf
}

test('P3: RoomAudioMixerGraph never accepts gemini track and gates each source independently', async () => {
  const mod = await loadTsModule('src/features/relay/audio/RoomAudioMixer.ts', {
    'ConversationGate.mjs': 'src/features/relay/audio/ConversationGate.ts',
  })
  const { RoomAudioMixerGraph } = mod

  const mixer = new RoomAudioMixerGraph()
  mixer.setGeminiOutputTrackId('track-gemini-out-42')

  // Host and guest accepted
  assert.equal(mixer.addSource({ id: 'host', name: 'Vignesh', trackId: 'mic-host', isHost: true }), true)
  assert.equal(mixer.addSource({ id: 'guest-1', name: 'Amma', trackId: 'mic-amma' }), true)

  // Gemini track MUST be rejected by id, trackName, OR matching geminiOutputTrackId
  assert.equal(mixer.addSource({ id: 'gemini', name: 'Gemini', trackId: 'x' }), false)
  assert.equal(mixer.addSource({ id: 'remote-x', name: 'Bot', trackName: 'gemini' }), false)
  assert.equal(mixer.addSource({ id: 'remote-y', name: 'Echo', trackId: 'track-gemini-out-42' }), false)
  assert.equal(mixer.hasGeminiFeedback(), false)
  assert.deepEqual(mixer.getConnectedSourceIds().sort(), ['guest-1', 'host'])

  // Steady ambient noise on guest-1 does NOT open guest-1's gate or affect host's gate
  let now = 0
  for (let i = 0; i < 80; i++) {
    now += 20
    const gNoise = mixer.processSourceFrame('guest-1', makePcmFrame(0.03), now)
    assert.equal(gNoise.framesToSend.length, 0)
    const hQuiet = mixer.processSourceFrame('host', makePcmFrame(0.002), now)
    assert.equal(hQuiet.framesToSend.length, 0)
  }

  // Host speaks loudly for 140ms (7 frames) -> ONLY host opens and emits pre-roll
  let openedHost = false
  for (let i = 0; i < 7; i++) {
    now += 20
    const res = mixer.processSourceFrame('host', makePcmFrame(0.15), now)
    if (res.anySpeechStarted) openedHost = true
  }
  assert.equal(openedHost, true)
  assert.deepEqual(mixer.getSourceMetrics('guest-1').isOpen, false)
  assert.deepEqual(mixer.getSourceMetrics('host').isOpen, true)
})

test('P3: SpeakerNoteTracker debounces ActiveSpeakersChanged by 600ms and emits fixed note format', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  const mod = await loadTsModule('src/features/relay/room/speakerTracker.ts', {
    'captionSanitizer.mjs': 'src/features/relay/captionSanitizer.ts',
    'live/relayPrompt.mjs': 'src/features/relay/live/relayPrompt.ts',
  })
  const { SpeakerNoteTracker, buildCaptionBroadcast } = mod

  const emitted = []
  const tracker = new SpeakerNoteTracker((note, spk) => emitted.push({ note, spk }), 600)

  // Brief flicker to Arun then back to Amma within 600ms -> only Amma emits once
  tracker.updateActiveSpeakers([{ identity: 'g1', name: 'Arun', lang: 'en' }])
  t.mock.timers.tick(200)
  tracker.updateActiveSpeakers([{ identity: 'g2', name: 'Amma', lang: 'ta' }])
  t.mock.timers.tick(599)
  assert.equal(emitted.length, 0)
  t.mock.timers.tick(1)
  assert.equal(emitted.length, 1)
  assert.equal(emitted[0].note, '(Amma is speaking, Tamil)')

  // Repeated update for same active speaker does NOT re-emit
  tracker.updateActiveSpeakers([{ identity: 'g2', name: 'Amma', lang: 'ta' }])
  t.mock.timers.tick(1000)
  assert.equal(emitted.length, 1)

  // Caption broadcast schema sanitizes emoji and rejects empty junk
  const valid = buildCaptionBroadcast({
    id: 'c1',
    speaker: 'Amma',
    lang: 'ta',
    text: 'வணக்கம் ⚡ நண்பா',
    ts: 12345,
  })
  assert.deepEqual(valid, {
    type: 'caption',
    id: 'c1',
    speaker: 'Amma',
    lang: 'ta',
    text: 'வணக்கம் நண்பா',
    ts: 12345,
  })
  assert.equal(
    buildCaptionBroadcast({ id: 'c2', speaker: 'Amma', lang: 'ta', text: '{} ⚡' }),
    null,
  )
})

test('P3: cameraHandoff state machine enforces one active camera, auto-grant, take back, and guest leave', async () => {
  const mod = await loadTsModule('src/features/relay/room/cameraHandoff.ts')
  const { createInitialCameraHandoffState, transitionCameraHandoff } = mod

  let st = createInitialCameraHandoffState()
  assert.equal(st.kind, 'hostCamera')

  // Request blocked when allowGuestCamera is false
  let r = transitionCameraHandoff(
    st,
    { type: 'GUEST_REQUEST', guestId: 'g1', guestName: 'Arun' },
    { allowGuestCamera: false, hostCameraOff: false },
  )
  assert.equal(r.changed, false)
  assert.equal(r.state.kind, 'hostCamera')

  // Request when switch ON & host camera ON -> requested -> HOST_ALLOW -> guestCamera
  r = transitionCameraHandoff(
    st,
    { type: 'GUEST_REQUEST', guestId: 'g1', guestName: 'Arun' },
    { allowGuestCamera: true, hostCameraOff: false },
  )
  assert.equal(r.state.kind, 'requested')
  st = r.state

  r = transitionCameraHandoff(st, { type: 'HOST_ALLOW' }, { allowGuestCamera: true, hostCameraOff: false })
  assert.equal(r.state.kind, 'guestCamera')
  assert.equal(r.grantGuestId, 'g1')
  assert.equal(r.geminiNote, "(Now showing Arun's camera)")
  st = r.state

  // Take back revokes guest permission and returns to hostCamera
  r = transitionCameraHandoff(st, { type: 'HOST_TAKE_BACK' }, { allowGuestCamera: true, hostCameraOff: false })
  assert.equal(r.state.kind, 'hostCamera')
  assert.equal(r.revokeGuestId, 'g1')
  assert.equal(r.geminiNote, "(Now showing Host's camera)")
  st = r.state

  // Auto-grant when allowGuestCamera is ON AND host camera is OFF
  r = transitionCameraHandoff(
    st,
    { type: 'GUEST_REQUEST', guestId: 'g2', guestName: 'Amma' },
    { allowGuestCamera: true, hostCameraOff: true },
  )
  assert.equal(r.state.kind, 'guestCamera')
  assert.equal(r.autoGranted, true)
  assert.equal(r.grantGuestId, 'g2')
  st = r.state

  // Guest leaves -> automatically returns to hostCamera
  r = transitionCameraHandoff(
    st,
    { type: 'GUEST_LEFT', guestId: 'g2' },
    { allowGuestCamera: true, hostCameraOff: true },
  )
  assert.equal(r.state.kind, 'hostCamera')
  assert.equal(r.revokeGuestId, 'g2')
})

test('P3: buildRoomSystemPrompt includes multi-speaker instructions and never-read-notes rule', async () => {
  const mod = await loadTsModule('src/features/relay/live/relayPrompt.ts')
  const prompt = mod.buildRoomSystemPrompt('auto')
  assert.ok(prompt.includes('Several people may talk.'))
  assert.ok(prompt.includes('(Name is speaking, Tamil)'))
  assert.ok(prompt.includes('Never read the notes aloud.'))
})

test('P3: db.ts defines versioned upgrade with relaySessions store and CRUD exports', () => {
  const dbPath = fs.existsSync('src/utils/db.ts')
    ? path.resolve('src/utils/db.ts')
    : path.resolve('web/src/utils/db.ts')
  const src = fs.readFileSync(dbPath, 'utf8')
  assert.ok(src.includes("const RELAY_SESSIONS_STORE = 'relaySessions'"))
  assert.ok(src.includes('const DB_VERSION = 4'))
  assert.ok(src.includes('export async function saveRelaySession'))
  assert.ok(src.includes('export async function getRelaySession'))
  assert.ok(src.includes('export async function listRelaySessions'))
})
