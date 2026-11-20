/**
 * Pure audio playback chunk queue that buffers incoming 24 kHz PCM16 chunks
 * until the AudioWorklet reports ready — ensuring early Gemini audio chunks
 * are NEVER dropped. Flush clears pending chunks only on explicit barge-in.
 */

export class PlaybackChunkQueue {
  private ready = false
  private queue: ArrayBuffer[] = []
  private readonly sink: (chunk: ArrayBuffer) => void
  public receivedCount = 0
  public forwardedCount = 0

  constructor(sink: (chunk: ArrayBuffer) => void) {
    this.sink = sink
  }

  isReady(): boolean {
    return this.ready
  }

  pendingCount(): number {
    return this.queue.length
  }

  enqueue(chunk: ArrayBuffer): void {
    this.receivedCount += 1
    if (!this.ready) {
      this.queue.push(chunk)
      return
    }
    this.forwardedCount += 1
    this.sink(chunk)
  }

  markReady(): number {
    if (this.ready) return 0
    this.ready = true
    const drained = this.queue.length
    while (this.queue.length > 0) {
      const next = this.queue.shift()!
      this.forwardedCount += 1
      this.sink(next)
    }
    return drained
  }

  flush(): number {
    const dropped = this.queue.length
    this.queue = []
    return dropped
  }
}
