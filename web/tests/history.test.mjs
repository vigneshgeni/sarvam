import test from 'node:test'
import assert from 'node:assert/strict'

// Pure stack transitions matching src/utils/history.ts
function pushScreenTransition(stack, newScreen) {
  const current = stack[stack.length - 1] || { screen: 'home', overlay: null }
  if (current.screen === newScreen && current.overlay === null) {
    return stack
  }
  return [...stack, { screen: newScreen, overlay: null, timestamp: Date.now() }]
}

function pushOverlayTransition(stack, overlay) {
  const current = stack[stack.length - 1] || { screen: 'home', overlay: null }
  if (current.overlay === overlay) {
    return stack
  }
  return [...stack, { screen: current.screen, overlay, timestamp: Date.now() }]
}

function popEntryTransition(stack) {
  if (stack.length <= 1) {
    const root = stack[0] || { screen: 'home', overlay: null }
    return {
      newStack: [root],
      closedOverlay: root.overlay,
      targetScreen: root.screen,
    }
  }

  const popped = stack[stack.length - 1]
  const newStack = stack.slice(0, -1)
  const target = newStack[newStack.length - 1]

  return {
    newStack,
    closedOverlay: popped.overlay,
    targetScreen: target.screen,
  }
}

test('History stack - initial state and screen push', () => {
  const initialStack = [{ screen: 'home', overlay: null }]

  // Navigate home -> reading
  const stackReading = pushScreenTransition(initialStack, 'reading')
  assert.equal(stackReading.length, 2)
  assert.equal(stackReading[1].screen, 'reading')
  assert.equal(stackReading[1].overlay, null)

  // Navigate reading -> result
  const stackResult = pushScreenTransition(stackReading, 'result')
  assert.equal(stackResult.length, 3)
  assert.equal(stackResult[2].screen, 'result')
  assert.equal(stackResult[2].overlay, null)
})

test('History stack - opening overlays pushes onto stack', () => {
  const stack = [
    { screen: 'home', overlay: null },
    { screen: 'result', overlay: null },
  ]

  // Open Listen sheet
  const stackListen = pushOverlayTransition(stack, 'listen')
  assert.equal(stackListen.length, 3)
  assert.equal(stackListen[2].screen, 'result')
  assert.equal(stackListen[2].overlay, 'listen')

  // Open Ask sheet from Listen or Result
  const stackAsk = pushOverlayTransition(stackListen, 'ask')
  assert.equal(stackAsk.length, 4)
  assert.equal(stackAsk[3].screen, 'result')
  assert.equal(stackAsk[3].overlay, 'ask')
})

test('History stack - back closes topmost overlay first without changing screen', () => {
  const stack = [
    { screen: 'home', overlay: null },
    { screen: 'result', overlay: null },
    { screen: 'result', overlay: 'listen' },
  ]

  // Pop (Back gesture or back button)
  const step1 = popEntryTransition(stack)
  assert.equal(step1.closedOverlay, 'listen')
  assert.equal(step1.targetScreen, 'result')
  assert.equal(step1.newStack.length, 2)
  assert.equal(step1.newStack[1].overlay, null)

  // Pop again -> goes to previous screen (home)
  const step2 = popEntryTransition(step1.newStack)
  assert.equal(step2.closedOverlay, null)
  assert.equal(step2.targetScreen, 'home')
  assert.equal(step2.newStack.length, 1)
})

test('History stack - popping from root stays on root', () => {
  const rootStack = [{ screen: 'home', overlay: null }]
  const res = popEntryTransition(rootStack)
  assert.equal(res.targetScreen, 'home')
  assert.equal(res.newStack.length, 1)
})
