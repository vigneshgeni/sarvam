import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

async function loadTsModule(relPath, deps = {}) {
  const ts = (await import('typescript')).default
  const absPath = fs.existsSync(relPath) ? path.resolve(relPath) : path.resolve('web', relPath)
  const dir = fs.realpathSync(fs.mkdtempSync(path.join(fs.realpathSync('/tmp'), 'relay-p16-')))

  for (const [depName, depRel] of Object.entries(deps)) {
    const depAbs = fs.existsSync(depRel) ? path.resolve(depRel) : path.resolve('web', depRel)
    const depOut = ts.transpileModule(fs.readFileSync(depAbs, 'utf8'), {
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

test('P1.6: sheetDetents tap cycle, drag thresholds, momentum snap, and keyboard actions', async () => {
  const mod = await loadTsModule('src/features/relay/sheetDetents.ts')
  const { cycleSheetDetent, resolveSheetDragEnd, handleSheetKeyAction, getDetentHeights } = mod

  assert.equal(cycleSheetDetent('collapsed'), 'half')
  assert.equal(cycleSheetDetent('half'), 'full')
  assert.equal(cycleSheetDetent('full'), 'collapsed')

  const h = getDetentHeights(844)
  assert.equal(h.collapsed, 72)
  assert.ok(h.half >= 300 && h.half <= 400)
  assert.ok(h.full > h.half + 150)

  // Fast swipe down from half -> collapsed
  assert.equal(
    resolveSheetDragEnd({
      startDetent: 'half',
      startHeight: h.half,
      currentHeight: h.half - 40,
      velocityY: 0.9,
      viewportHeight: 844,
    }),
    'collapsed',
  )

  // Fast swipe up from collapsed -> half
  assert.equal(
    resolveSheetDragEnd({
      startDetent: 'collapsed',
      startHeight: h.collapsed,
      currentHeight: h.collapsed + 40,
      velocityY: -0.8,
      viewportHeight: 844,
    }),
    'half',
  )

  // Deliberate slow drag down (>55px) from half -> collapsed
  assert.equal(
    resolveSheetDragEnd({
      startDetent: 'half',
      startHeight: h.half,
      currentHeight: h.half - 90,
      velocityY: 0.05,
      viewportHeight: 844,
    }),
    'collapsed',
  )

  // Deliberate slow drag up (>55px) from half -> full
  assert.equal(
    resolveSheetDragEnd({
      startDetent: 'half',
      startHeight: h.half,
      currentHeight: h.half + 90,
      velocityY: -0.05,
      viewportHeight: 844,
    }),
    'full',
  )

  // Keyboard actions
  assert.equal(handleSheetKeyAction('collapsed', 'Enter'), 'half')
  assert.equal(handleSheetKeyAction('half', ' '), 'full')
  assert.equal(handleSheetKeyAction('full', 'Escape'), 'collapsed')
  assert.equal(handleSheetKeyAction('half', 'Tab'), null)
})

test('P1.6: pageStack add, delete, and reorder operations', async () => {
  const mod = await loadTsModule('src/features/relay/pageStack.ts')
  const { addPageToStack, removePageFromStack, reorderPageInStack } = mod

  const p1 = { id: 'p1', blob: null, dataUrl: 'a', width: 100, height: 100, timestamp: 1 }
  const p2 = { id: 'p2', blob: null, dataUrl: 'b', width: 100, height: 100, timestamp: 2 }
  const p3 = { id: 'p3', blob: null, dataUrl: 'c', width: 100, height: 100, timestamp: 3 }

  let pages = addPageToStack([], p1).pages
  pages = addPageToStack(pages, p2).pages
  pages = addPageToStack(pages, p3).pages
  assert.deepEqual(pages.map((p) => p.id), ['p1', 'p2', 'p3'])

  const reordered = reorderPageInStack(pages, 2, 0)
  assert.deepEqual(reordered.map((p) => p.id), ['p3', 'p1', 'p2'])

  const removed = removePageFromStack(reordered, 'p1')
  assert.deepEqual(removed.map((p) => p.id), ['p3', 'p2'])
})

test('P1.6: captionSanitizer strips emoji, empty brackets, noise tags and short junk', async () => {
  const mod = await loadTsModule('src/features/relay/captionSanitizer.ts', {
    'live/relayPrompt.mjs': 'src/features/relay/live/relayPrompt.ts',
  })
  const { sanitizeCaption, shouldDropInputDuringPlayback } = mod

  // Documented choice: "{} esto hora 500 {}" strips "{}" leaving "esto hora 500" (8 letters >= 2 -> kept)
  assert.equal(sanitizeCaption('{} esto hora 500 {}', 'input'), 'esto hora 500')
  assert.equal(sanitizeCaption('⚡', 'output'), '')
  assert.equal(sanitizeCaption('Hello ⚡ world', 'output'), 'Hello world')
  assert.equal(sanitizeCaption('வணக்கம் ⚡ நண்பா', 'output'), 'வணக்கம் நண்பா')
  assert.equal(sanitizeCaption('{}', 'input'), '')
  assert.equal(sanitizeCaption('[] <noise> ()', 'input'), '')
  assert.equal(sanitizeCaption('500 123', 'input'), '')
  assert.equal(sanitizeCaption('a', 'input'), '')
  assert.equal(sanitizeCaption('(Arun is speaking, Tamil) இது எவ்வளவு?', 'input'), 'இது எவ்வளவு?')

  // Input during Gemini audio playback
  assert.equal(shouldDropInputDuringPlayback('hi', true), true)
  assert.equal(shouldDropInputDuringPlayback('{} ⚡', true), true)
  assert.equal(shouldDropInputDuringPlayback('Wait stop please', true), false)
  assert.equal(shouldDropInputDuringPlayback('hi', false), false)
})

test('P1.6: PlaybackChunkQueue holds early chunks until worklet ready and only drops on flush', async () => {
  const mod = await loadTsModule('src/features/relay/audio/playbackQueue.ts')
  const { PlaybackChunkQueue } = mod

  const forwarded = []
  const queue = new PlaybackChunkQueue((chunk) => forwarded.push(new Uint8Array(chunk)[0]))

  const c1 = new Uint8Array([1]).buffer
  const c2 = new Uint8Array([2]).buffer
  const c3 = new Uint8Array([3]).buffer

  queue.enqueue(c1)
  queue.enqueue(c2)
  assert.equal(queue.isReady(), false)
  assert.equal(queue.pendingCount(), 2)
  assert.deepEqual(forwarded, [])

  // Worklet reports ready -> queued chunks drain in FIFO order
  const drained = queue.markReady()
  assert.equal(drained, 2)
  assert.deepEqual(forwarded, [1, 2])
  assert.equal(queue.pendingCount(), 0)

  // Subsequent chunks forward immediately
  queue.enqueue(c3)
  assert.deepEqual(forwarded, [1, 2, 3])

  // Flush clears pending chunks before ready (barge-in)
  const q2 = new PlaybackChunkQueue(() => {})
  q2.enqueue(new Uint8Array([9]).buffer)
  assert.equal(q2.flush(), 1)
  assert.equal(q2.pendingCount(), 0)
})

test('P1.6: relayPrompt includes no-emoji and answer-in-last-language instructions', async () => {
  const mod = await loadTsModule('src/features/relay/live/relayPrompt.ts')
  for (const prompt of [mod.buildSoloSystemPrompt('auto'), mod.buildLiveVideoSystemPrompt('auto')]) {
    assert.ok(prompt.includes('Never use emoji.'))
    assert.ok(prompt.includes("Answer in the language of the person's last message."))
  }
})
