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
const dir = mkdtempSync(join(tmpdir(), 'sarvam-onboard-'))
const js = ts.transpileModule(readFileSync(join(here, '../src/design/onboarding.ts'), 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
writeFileSync(join(dir, 'onboarding.mjs'), js)
const { shouldShowOnboarding, screenAfterReturn } = await import(pathToFileURL(join(dir, 'onboarding.mjs')).href)

test('a fresh session shows onboarding', () => {
  assert.equal(shouldShowOnboarding({
    seenThisSession: false,
    hasRestoredResult: false,
    hasOpenOverlay: false,
    fromSharedLink: false,
  }), true)
})

test('the same session does not show onboarding again', () => {
  assert.equal(shouldShowOnboarding({
    seenThisSession: true,
    hasRestoredResult: false,
    hasOpenOverlay: false,
    fromSharedLink: false,
  }), false)
})

test('an overlay restore skips onboarding', () => {
  assert.equal(shouldShowOnboarding({
    seenThisSession: false,
    hasRestoredResult: true,
    hasOpenOverlay: true,
    fromSharedLink: false,
  }), false)
  assert.equal(shouldShowOnboarding({
    seenThisSession: false,
    hasRestoredResult: false,
    hasOpenOverlay: true,
    fromSharedLink: false,
  }), false)
})

test('a shared link or an open result is not blocked', () => {
  assert.equal(shouldShowOnboarding({
    seenThisSession: false,
    hasRestoredResult: false,
    hasOpenOverlay: false,
    fromSharedLink: true,
  }), false)
  assert.equal(screenAfterReturn({ screen: 'home', hasResult: false }, { result: { title: 'Letter' }, screen: 'result' }).screen, 'result')
  assert.equal(screenAfterReturn({ screen: 'result', hasResult: false }, null).screen, 'home')
})
