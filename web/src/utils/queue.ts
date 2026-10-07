/**
 * Reusable request concurrency queue.
 * Ensures at most `maxConcurrent` asynchronous operations run in parallel.
 */
export class RequestQueue {
  private maxConcurrent: number
  private running = 0
  private queue: Array<{
    resolve: () => void
    reject: (reason?: unknown) => void
    signal?: AbortSignal
    onAbort?: () => void
  }> = []

  constructor(maxConcurrent = 2) {
    this.maxConcurrent = Math.max(1, maxConcurrent)
  }

  /**
   * Enqueues and executes an async task when a concurrency slot is available.
   * If signal is aborted while waiting in queue, rejects immediately with AbortError.
   */
  async run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    if (signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }

    if (this.running >= this.maxConcurrent) {
      await new Promise<void>((resolve, reject) => {
        let onAbort: (() => void) | undefined
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

  private processNext(): void {
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

  get inFlight(): number {
    return this.running
  }

  get queued(): number {
    return this.queue.length
  }
}

/**
 * Singleton explain queue enforcing at most 2 in-flight /api/explain calls.
 */
export const explainQueue = new RequestQueue(2)
