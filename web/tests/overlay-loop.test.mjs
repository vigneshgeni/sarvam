import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { pathToFileURL, fileURLToPath } from 'node:url'
import { createRequire } from 'node:module'
import { createElement, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { act } from 'react'

const require = createRequire(import.meta.url)
const ts = require('typescript')
const here = dirname(fileURLToPath(import.meta.url))
const source = readFileSync(join(here, '../src/hooks/useOverlayRestore.ts'), 'utf8')
let js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
}).outputText
const reactUrl = pathToFileURL(require.resolve('react')).href
js = js.replace("from 'react'", `from ${JSON.stringify(reactUrl)}`)
js = js.replace("from './overlayCore'", "from './overlayCore.js'")
const dir = mkdtempSync(join(tmpdir(), 'sarvam-overlay-'))
const hookFile = join(dir, 'useOverlayRestore.mjs')
writeFileSync(hookFile, js)
writeFileSync(join(dir, 'overlayCore.js'), readFileSync(join(here, '../src/hooks/overlayCore.js')))
const { useOverlayRestore } = await import(pathToFileURL(hookFile).href)

function listen(target) {
  const map = new Map()
  target.addEventListener = (type, fn) => {
    const list = map.get(type) || []
    list.push(fn)
    map.set(type, list)
  }
  target.removeEventListener = (type, fn) => {
    map.set(type, (map.get(type) || []).filter((item) => item !== fn))
  }
  target.dispatchEvent = (event) => {
    for (const fn of [...(map.get(event.type) || [])]) fn(event)
    return true
  }
}

function element(tag) {
  return {
    nodeType: 1,
    nodeName: String(tag).toUpperCase(),
    tagName: String(tag).toUpperCase(),
    childNodes: [],
    style: {},
    ownerDocument: null,
    parentNode: null,
    namespaceURI: 'http://www.w3.org/1999/xhtml',
    appendChild(child) {
      child.parentNode = this
      this.childNodes.push(child)
      return child
    },
    removeChild(child) {
      this.childNodes = this.childNodes.filter((item) => item !== child)
      return child
    },
    insertBefore(child) {
      return this.appendChild(child)
    },
    setAttribute() {},
    getAttribute() {
      return null
    },
    removeAttribute() {},
    addEventListener() {},
    removeEventListener() {},
  }
}

test('overlay restore does not re-render when there is no saved session', async () => {
  const document = {
    visibilityState: 'hidden',
    nodeType: 9,
    activeElement: null,
    body: null,
    documentElement: null,
  }
  const window = {
    history: { state: null, replaceState(state) { this.state = state } },
    dispatchEvent() { return true },
    HTMLIFrameElement: class HTMLIFrameElement {},
    HTMLElement: class HTMLElement {},
    Element: class Element {},
    Node: class Node {},
    document,
  }
  document.defaultView = window
  document.body = element('body')
  document.body.ownerDocument = document
  document.documentElement = element('html')
  document.documentElement.ownerDocument = document
  listen(document)
  listen(window)
  const container = element('div')
  container.ownerDocument = document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  globalThis.document = document
  globalThis.window = window
  globalThis.CustomEvent = class CustomEvent {
    constructor(type, init) {
      this.type = type
      this.detail = init?.detail
    }
  }
  globalThis.sessionStorage = { getItem() { return null } }

  let renders = 0
  let checks = 0
  function Harness() {
    renders += 1
    const [, setPassword] = useState({ isOpen: false })
    useOverlayRestore({
      onClose: () => {
        checks += 1
        setPassword((prev) => ({ ...prev, isOpen: false }))
      },
    })
    return null
  }

  const root = createRoot(container)
  await act(async () => {
    root.render(createElement(Harness))
  })
  const afterMount = checks
  await new Promise((resolve) => setTimeout(resolve, 1000))
  assert.ok(renders <= 3, `rendered ${renders} times`)
  assert.equal(afterMount, 1)

  await act(async () => {
    window.dispatchEvent({ type: 'pageshow' })
  })
  assert.equal(checks, afterMount + 1)
  await new Promise((resolve) => setTimeout(resolve, 50))
  assert.equal(checks, afterMount + 1)
  assert.ok(renders <= 5, `rendered ${renders} times after pageshow`)

  await act(async () => {
    root.unmount()
  })
})
