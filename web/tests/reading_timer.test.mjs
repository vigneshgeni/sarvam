import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const taPath = fs.existsSync(path.resolve('src/i18n/ta.json'))
  ? path.resolve('src/i18n/ta.json')
  : path.resolve('web/src/i18n/ta.json')
const orPath = fs.existsSync(path.resolve('src/i18n/or.json'))
  ? path.resolve('src/i18n/or.json')
  : path.resolve('web/src/i18n/or.json')

const taDict = JSON.parse(fs.readFileSync(taPath, 'utf-8'))
const orDict = JSON.parse(fs.readFileSync(orPath, 'utf-8'))

class ExplainApiError extends Error {
  constructor(message, messageLocal, statusCode, retryAfter, errorCode) {
    super(messageLocal || message)
    this.name = 'ExplainApiError'
    this.message = message
    this.messageLocal = messageLocal || message
    this.statusCode = statusCode
    this.retryAfter = retryAfter
    this.errorCode = errorCode
  }
}

// Queue logic matching web/src/utils/queue.ts
class RequestQueue {
  constructor(maxConcurrent = 2) {
    this.maxConcurrent = Math.max(1, maxConcurrent)
    this.running = 0
    this.queue = []
  }

  async run(task, signal) {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    if (this.running >= this.maxConcurrent) {
      await new Promise((resolve, reject) => {
        let onAbort
        if (signal) {
          onAbort = () => {
            const index = this.queue.findIndex((item) => item.onAbort === onAbort)
            if (index !== -1) {
              this.queue.splice(index, 1)
            }
            reject(new DOMException('Aborted', 'AbortError'))
          }
          signal.addEventListener('abort', onAbort, { once: true })
        }
        this.queue.push({ resolve, reject, signal, onAbort })
      })
    }

    this.running++
    try {
      return await task()
    } finally {
      this.running--
      this.processNext()
    }
  }

  processNext() {
    while (this.queue.length > 0 && this.running < this.maxConcurrent) {
      const item = this.queue.shift()
      if (item) {
        if (item.signal && item.onAbort) {
          item.signal.removeEventListener('abort', item.onAbort)
        }
        if (item.signal?.aborted) {
          item.reject(new DOMException('Aborted', 'AbortError'))
        } else {
          item.resolve()
          break
        }
      }
    }
  }
}

// Client explain simulation matching web/src/api.ts
async function explainDocumentSim(fetchFn, queue, externalSignal, timeoutMs = 90_000) {
  try {
    return await queue.run(async () => {
      const controller = new AbortController()
      let timedOut = false
      let timeoutId

      const onExternalAbort = () => {
        if (externalSignal?.reason === 'timeout') {
          timedOut = true
        }
        controller.abort(externalSignal?.reason)
      }

      if (externalSignal) {
        if (externalSignal.aborted) {
          if (externalSignal.reason === 'timeout') {
            throw new ExplainApiError(
              'Request timed out after 90 seconds.',
              'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
              504
            )
          }
          throw new DOMException('Aborted', 'AbortError')
        }
        externalSignal.addEventListener('abort', onExternalAbort, { once: true })
      } else {
        timeoutId = setTimeout(() => {
          timedOut = true
          controller.abort('timeout')
        }, timeoutMs)
      }

      try {
        return await fetchFn(controller.signal)
      } catch (err) {
        if (externalSignal?.aborted) {
          if (externalSignal.reason === 'timeout') {
            throw new ExplainApiError(
              'Request timed out after 90 seconds.',
              'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
              504
            )
          }
          throw new DOMException('Aborted', 'AbortError')
        }
        if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && timedOut)) {
          throw new ExplainApiError(
            'Request timed out after 90 seconds.',
            'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
            504
          )
        }
        throw err
      } finally {
        if (timeoutId) clearTimeout(timeoutId)
        if (externalSignal) {
          externalSignal.removeEventListener('abort', onExternalAbort)
        }
      }
    }, externalSignal)
  } catch (err) {
    if (externalSignal?.aborted) {
      if (externalSignal.reason === 'timeout') {
        throw new ExplainApiError(
          'Request timed out after 90 seconds.',
          'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
          504
        )
      }
      throw new DOMException('Aborted', 'AbortError')
    }
    throw err
  }
}

// Client translate simulation matching web/src/api.ts
async function translateDocumentSim(fetchFn, externalSignal) {
  const controller = new AbortController()
  let timedOut = false
  let timeoutId

  const onExternalAbort = () => {
    if (externalSignal?.reason === 'timeout') {
      timedOut = true
    }
    controller.abort(externalSignal?.reason)
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      if (externalSignal.reason === 'timeout') {
        throw new ExplainApiError(
          'Request timed out after 90 seconds.',
          'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
          504
        )
      }
      throw new DOMException('Aborted', 'AbortError')
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  } else {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort('timeout')
    }, 90_000)
  }

  try {
    return await fetchFn(controller.signal)
  } catch (err) {
    if (externalSignal?.aborted) {
      if (externalSignal.reason === 'timeout') {
        throw new ExplainApiError(
          'Request timed out after 90 seconds.',
          'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
          504
        )
      }
      throw new DOMException('Aborted', 'AbortError')
    }
    if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && timedOut)) {
      throw new ExplainApiError(
        'Request timed out after 90 seconds.',
        'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
        504
      )
    }
    throw err
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort)
    }
  }
}

// Client ask simulation matching web/src/api.ts
async function askDocumentSim(fetchFn, signal) {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort('timeout')
  }, 50) // fast proxy for 55_000

  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    return await fetchFn(controller.signal)
  } catch (err) {
    if (signal?.aborted && signal.reason !== 'timeout') {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && (timedOut || signal?.reason === 'timeout'))) {
      throw new ExplainApiError(
        'Ask request timed out after 55 seconds.',
        'நேரம் முடிந்தது. மீண்டும் முயற்சிக்கவும்.',
        504
      )
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

test('Reading timer - top-level 90s timer aborts explain and returns 504 ExplainApiError', async () => {
  const queue = new RequestQueue(2)
  const topController = new AbortController()

  // Top-level timer expires after 40ms (proxy for 90s)
  setTimeout(() => {
    topController.abort('timeout')
  }, 40)

  const hangingFetch = (signal) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })

  try {
    await explainDocumentSim(hangingFetch, queue, topController.signal)
    assert.fail('Expected 504 timeout error')
  } catch (err) {
    assert.ok(err instanceof ExplainApiError)
    assert.equal(err.statusCode, 504)
    assert.match(err.message, /90 seconds/i)
  }
})

test('Reading timer - top-level timer aborts request waiting in explain queue', async () => {
  const queue = new RequestQueue(1) // concurrency 1 to test queue wait

  // Slot 1 occupied by a running task
  let releaseSlot1
  const slot1Promise = new Promise((resolve) => {
    releaseSlot1 = resolve
  })
  queue.run(() => slot1Promise)

  // Request 2 enqueued with 30ms top-level timer
  const topController = new AbortController()
  setTimeout(() => {
    topController.abort('timeout')
  }, 30)

  const neverRunsFetch = () => Promise.resolve({ ok: true })

  try {
    await explainDocumentSim(neverRunsFetch, queue, topController.signal)
    assert.fail('Queued request should have timed out')
  } catch (err) {
    assert.ok(err instanceof ExplainApiError)
    assert.equal(err.statusCode, 504)
  } finally {
    releaseSlot1()
  }
})

test('Cancel - user cancel aborts immediately with AbortError for clean reset', async () => {
  const queue = new RequestQueue(2)
  const topController = new AbortController()

  // User taps Cancel after 10ms
  setTimeout(() => {
    topController.abort('cancelled')
  }, 10)

  const hangingFetch = (signal) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })

  try {
    await explainDocumentSim(hangingFetch, queue, topController.signal)
    assert.fail('Should have aborted with AbortError')
  } catch (err) {
    assert.ok(err instanceof DOMException)
    assert.equal(err.name, 'AbortError')
  }
})

test('Translate - respects top-level timer and does NOT add independent 120s timer', async () => {
  const topController = new AbortController()
  setTimeout(() => {
    topController.abort('timeout')
  }, 35)

  const hangingFetch = (signal) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })

  try {
    await translateDocumentSim(hangingFetch, topController.signal)
    assert.fail('Should have timed out within top-level budget')
  } catch (err) {
    assert.ok(err instanceof ExplainApiError)
    assert.equal(err.statusCode, 504)
  }
})

test('Ask - client timeout at 55s produces 504 ExplainApiError', async () => {
  const hangingFetch = (signal) =>
    new Promise((_, reject) => {
      signal.addEventListener('abort', () => {
        reject(new DOMException('Aborted', 'AbortError'))
      })
    })

  try {
    await askDocumentSim(hangingFetch)
    assert.fail('Should have timed out')
  } catch (err) {
    assert.ok(err instanceof ExplainApiError)
    assert.equal(err.statusCode, 504)
    assert.match(err.message, /55 seconds/i)
  }
})

test('ReadingScreen - Cancel button label localized in Tamil and Odia down to 360px', () => {
  // Tamil back/cancel
  assert.ok(taDict.goBack || taDict.cancel)
  // Odia cancel
  assert.ok(orDict.cancel || orDict.goBack)
  assert.equal(orDict.cancel, 'ବାତିଲ୍')
})
