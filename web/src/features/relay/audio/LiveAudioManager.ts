/**
 * LiveAudioManager — Reusable Web Audio pipeline for Gemini Live.
 *
 * Requirements:
 * - One AudioContext created/resumed synchronously on the user's tap (iOS requirement).
 * - Sets navigator.audioSession.type = 'play-and-record' when available (Safari 17+).
 * - Mic captured with echoCancellation, noiseSuppression and autoGainControl.
 * - Downsampled to 16 kHz mono PCM16 in 40 ms chunks (640 samples) or 20 ms chunks (320 samples).
 * - 24 kHz playback via AudioWorklet created & connected before Live session starts,
 *   with a PlaybackChunkQueue so early chunks are never dropped before worklet ready,
 *   instant flush on barge-in, actual playback state events, and [relay-audio] telemetry.
 */

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

export const RECORDER_WORKLET_CODE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
    this._chunkSize = 320; // 20ms at 16 kHz (320 samples)
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const ratio = sampleRate / 16000;
    for (let i = 0; i < ch.length; i += ratio) {
      this._buf.push(ch[Math.floor(i)]);
    }
    while (this._buf.length >= this._chunkSize) {
      const chunk = this._buf.splice(0, this._chunkSize);
      const pcm = new Int16Array(chunk.length);
      for (let j = 0; j < chunk.length; j++) {
        const s = Math.max(-1, Math.min(1, chunk[j]));
        pcm[j] = s < 0 ? s * 0x8000 : s * 0x7FFF;
      }
      this.port.postMessage(pcm.buffer, [pcm.buffer]);
    }
    return true;
  }
}
registerProcessor('recorder-processor', RecorderProcessor);
`

export const PLAYER_WORKLET_CODE = `
class PlayerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._queue = [];
    this._pos = 0;
    this._playing = false;
    this._firstPlayed = false;
    this._silentBlocks = 0;
    this._levelBlocks = 0;
    this._rmsAccum = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this._queue = [];
        this._pos = 0;
        this._silentBlocks = 0;
        if (this._playing) {
          this._playing = false;
          this.port.postMessage({ type: 'playing', active: false, rms: 0 });
        }
        return;
      }
      if (e.data === 'ping') {
        this.port.postMessage({ type: 'ready' });
        return;
      }
      this._queue.push(e.data);
    };
    this.port.postMessage({ type: 'ready' });
  }
  process(_inputs, outputs) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    let playedSample = false;
    let sumSq = 0;
    for (let i = 0; i < out.length; i++) {
      if (this._queue.length === 0) {
        out[i] = 0;
        continue;
      }
      const buf = this._queue[0];
      const view = new Int16Array(buf);
      const sample = view[this._pos] / 32768;
      out[i] = sample;
      sumSq += sample * sample;
      playedSample = true;
      this._pos++;
      if (this._pos >= view.length) {
        this._queue.shift();
        this._pos = 0;
      }
    }
    if (playedSample) {
      this._silentBlocks = 0;
      const rms = Math.sqrt(sumSq / out.length);
      this._rmsAccum = Math.max(this._rmsAccum, rms);
      if (!this._firstPlayed) {
        this._firstPlayed = true;
        this.port.postMessage({ type: 'firstChunkPlayed' });
      }
      if (!this._playing) {
        this._playing = true;
        this.port.postMessage({ type: 'playing', active: true, rms });
      }
      this._levelBlocks++;
      if (this._levelBlocks >= 6) {
        this.port.postMessage({ type: 'level', rms: this._rmsAccum });
        this._levelBlocks = 0;
        this._rmsAccum = 0;
      }
    } else if (this._playing) {
      this._silentBlocks++;
      // ~30 render quanta at 24 kHz (~160 ms) of empty queue -> stopped playing
      if (this._silentBlocks >= 30) {
        this._playing = false;
        this._silentBlocks = 0;
        this.port.postMessage({ type: 'playing', active: false, rms: 0 });
      }
    }
    return true;
  }
}
registerProcessor('player-processor', PlayerProcessor);
`

export function blobUrl(code: string): string {
  return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
}

/**
 * Sets navigator.audioSession.type = 'play-and-record' when supported (iOS Safari 17+).
 */
export function configureRelayAudioSession(): void {
  try {
    if (typeof navigator !== 'undefined') {
      const nav = navigator as Navigator & { audioSession?: { type: string } }
      if (nav.audioSession) {
        nav.audioSession.type = 'play-and-record'
        console.info('[relay-audio] audioSession set to play-and-record')
      }
    }
  } catch {
    // Ignore on browsers that reject or do not support audioSession
  }
}

/**
 * Calculates the expected number of 16 kHz PCM16 samples and chunks for a given
 * duration or input sample count.
 */
export function calculateDownsampleMath(
  inputSampleRate: number,
  inputSamplesCount: number,
  targetSampleRate = 16000,
  chunkSizeSamples = 640,
) {
  const ratio = inputSampleRate / targetSampleRate
  const expectedTargetSamples = Math.floor(inputSamplesCount / ratio)
  const fullChunks = Math.floor(expectedTargetSamples / chunkSizeSamples)
  const remainderSamples = expectedTargetSamples % chunkSizeSamples
  return {
    ratio,
    expectedTargetSamples,
    fullChunks,
    remainderSamples,
    chunkDurationMs: (chunkSizeSamples / targetSampleRate) * 1000,
  }
}

/**
 * Synchronously create or resume a single AudioContext inside a user tap handler.
 * Required by iOS Safari so playback and mic capture stay unlocked.
 */
export function createOrResumeRelayAudioContext(existing?: AudioContext | null): AudioContext | null {
  if (typeof window === 'undefined') return null
  configureRelayAudioSession()
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null

  let ctx: AudioContext | null = existing && existing.state !== 'closed' ? existing : null
  if (!ctx) {
    try {
      ctx = new Ctor({ sampleRate: 24000 })
    } catch {
      ctx = new Ctor()
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {})
  }
  console.info('[relay-audio] context', { state: ctx.state, sampleRate: ctx.sampleRate })
  return ctx
}

/**
 * Request camera and microphone in a single user-gesture getUserMedia call.
 */
export async function requestRelayMediaStream(
  facing: 'user' | 'environment' = 'environment',
): Promise<MediaStream> {
  if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
    const err = new Error('Camera API (mediaDevices) is unavailable in this browser.')
    err.name = 'NotFoundError'
    throw err
  }
  try {
    return await navigator.mediaDevices.getUserMedia({
      video: {
        facingMode: { ideal: facing },
        width: { ideal: 1920 },
        height: { ideal: 1080 },
      },
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
      },
    })
  } catch (err) {
    const name = (err as { name?: string })?.name || ''
    // If combined constraints fail due to missing mic or strict resolution, fall back to video-only
    if (name === 'OverconstrainedError') {
      return await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing } },
        audio: false,
      })
    }
    throw err
  }
}

const registeredWorkletContexts = new WeakSet<AudioContext>()

export interface LiveAudioStartOptions {
  audioCtx?: AudioContext | null
  audioStream?: MediaStream | null
  onPlaybackStateChange?: (playing: boolean) => void
  onPlaybackStalled?: (reason: 'suspended' | 'silent') => void
  onPlaybackLevel?: (rms: number) => void
}

export class LiveAudioManager {
  private ctx: AudioContext | null = null
  private ownsCtx = true
  private playerNode: AudioWorkletNode | null = null
  private recorderNode: AudioWorkletNode | null = null
  private micStream: MediaStream | null = null
  private ownsMicStream = true
  private isMuted = false
  private playbackQueue: PlaybackChunkQueue | null = null
  private isPlayingAudio = false
  private playbackRms = 0
  private firstChunkReceivedAt: number | null = null
  private firstChunkPlayedAt: number | null = null
  private silentCheckTimer: ReturnType<typeof setTimeout> | null = null
  private readyFallbackTimer: ReturnType<typeof setTimeout> | null = null
  private onPlaybackStateChange: ((playing: boolean) => void) | null = null
  private onPlaybackStalled: ((reason: 'suspended' | 'silent') => void) | null = null
  private onPlaybackLevel: ((rms: number) => void) | null = null

  async start(
    onAudioChunk: (pcm16: ArrayBuffer) => void,
    options?: LiveAudioStartOptions,
  ): Promise<void> {
    configureRelayAudioSession()
    this.onPlaybackStateChange = options?.onPlaybackStateChange || null
    this.onPlaybackStalled = options?.onPlaybackStalled || null
    this.onPlaybackLevel = options?.onPlaybackLevel || null
    this.firstChunkReceivedAt = null
    this.firstChunkPlayedAt = null
    this.isPlayingAudio = false
    this.playbackRms = 0

    // 1. Reuse pre-unlocked AudioContext from user tap, or create one now
    let ctx: AudioContext
    if (options?.audioCtx && options.audioCtx.state !== 'closed') {
      ctx = options.audioCtx
      this.ownsCtx = false
    } else {
      const created = createOrResumeRelayAudioContext()
      if (!created) {
        throw new Error('AudioContext is not supported in this browser')
      }
      ctx = created
      this.ownsCtx = true
    }
    this.ctx = ctx

    if (ctx.state === 'suspended') {
      await ctx.resume().catch(() => {})
    }
    console.info('[relay-audio] start', { contextState: ctx.state, sampleRate: ctx.sampleRate })

    // 2. Register worklets once per AudioContext
    if (!registeredWorkletContexts.has(ctx)) {
      const recUrl = blobUrl(RECORDER_WORKLET_CODE)
      const playUrl = blobUrl(PLAYER_WORKLET_CODE)
      try {
        await ctx.audioWorklet.addModule(recUrl)
        await ctx.audioWorklet.addModule(playUrl)
        registeredWorkletContexts.add(ctx)
      } finally {
        URL.revokeObjectURL(recUrl)
        URL.revokeObjectURL(playUrl)
      }
    }

    // 3. Output player node (24 kHz) created & connected BEFORE Live session starts
    const playerNode = new AudioWorkletNode(ctx, 'player-processor')
    playerNode.connect(ctx.destination)
    this.playerNode = playerNode

    this.playbackQueue = new PlaybackChunkQueue((chunk) => {
      if (this.playerNode) {
        this.playerNode.port.postMessage(chunk, [chunk])
      }
    })

    const markWorkletReady = (source: string) => {
      if (!this.playbackQueue || this.playbackQueue.isReady()) return
      const drained = this.playbackQueue.markReady()
      console.info('[relay-audio] worklet ready', { source, drainedChunks: drained, contextState: this.ctx?.state })
    }

    playerNode.port.onmessage = (e: MessageEvent<{ type?: string; active?: boolean; rms?: number }>) => {
      const msg = e.data
      if (!msg || typeof msg !== 'object') return
      if (msg.type === 'ready') {
        if (this.readyFallbackTimer) {
          clearTimeout(this.readyFallbackTimer)
          this.readyFallbackTimer = null
        }
        markWorkletReady('worklet')
      } else if (msg.type === 'firstChunkPlayed') {
        if (this.firstChunkPlayedAt === null) {
          this.firstChunkPlayedAt = Date.now()
          if (this.silentCheckTimer) {
            clearTimeout(this.silentCheckTimer)
            this.silentCheckTimer = null
          }
          const deltaMs =
            this.firstChunkReceivedAt !== null ? this.firstChunkPlayedAt - this.firstChunkReceivedAt : 0
          console.info('[relay-audio] first chunk played', { deltaMs, contextState: this.ctx?.state })
        }
      } else if (msg.type === 'playing') {
        const active = Boolean(msg.active)
        this.isPlayingAudio = active
        if (!active) {
          this.playbackRms = 0
          this.onPlaybackLevel?.(0)
        } else if (typeof msg.rms === 'number') {
          this.playbackRms = msg.rms
          this.onPlaybackLevel?.(msg.rms)
        }
        this.onPlaybackStateChange?.(active)
      } else if (msg.type === 'level' && typeof msg.rms === 'number') {
        this.playbackRms = msg.rms
        this.onPlaybackLevel?.(msg.rms)
      }
    }

    // Ping the worklet in case its constructor message fired before onmessage was attached
    playerNode.port.postMessage('ping')
    this.readyFallbackTimer = setTimeout(() => {
      markWorkletReady('fallback-timer')
    }, 150)

    // 4. Reuse pre-granted mic stream if available; otherwise request mic
    let stream: MediaStream | null = null
    if (options?.audioStream && options.audioStream.getAudioTracks().some((tr) => tr.readyState === 'live')) {
      stream = new MediaStream(options.audioStream.getAudioTracks())
      this.ownsMicStream = false
    } else {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      })
      this.ownsMicStream = true
    }
    this.micStream = stream

    const micSource = ctx.createMediaStreamSource(stream)
    const recorderNode = new AudioWorkletNode(ctx, 'recorder-processor')
    micSource.connect(recorderNode)
    this.recorderNode = recorderNode

    recorderNode.port.onmessage = (e: MessageEvent<ArrayBuffer>) => {
      if (!this.isMuted) {
        onAudioChunk(e.data)
      }
    }
  }

  playAudio(pcm16: ArrayBuffer): void {
    if (this.firstChunkReceivedAt === null) {
      this.firstChunkReceivedAt = Date.now()
      console.info('[relay-audio] first chunk received', {
        byteLength: pcm16.byteLength,
        contextState: this.ctx?.state,
        workletReady: this.playbackQueue?.isReady() ?? false,
      })
      if (this.silentCheckTimer) clearTimeout(this.silentCheckTimer)
      this.silentCheckTimer = setTimeout(() => {
        if (this.firstChunkPlayedAt === null) {
          console.info('[relay-audio] playback silent 1.5s after first chunk', {
            contextState: this.ctx?.state,
            pendingChunks: this.playbackQueue?.pendingCount() ?? 0,
          })
          this.onPlaybackStalled?.('silent')
        }
      }, 1500)
    }

    if (this.ctx && this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => {})
    }

    this.playbackQueue?.enqueue(pcm16)
  }

  flush(): void {
    this.playbackQueue?.flush()
    if (this.playerNode) {
      this.playerNode.port.postMessage('flush')
    }
    if (this.isPlayingAudio) {
      this.isPlayingAudio = false
      this.playbackRms = 0
      this.onPlaybackLevel?.(0)
      this.onPlaybackStateChange?.(false)
    }
  }

  async resumeContext(): Promise<AudioContextState | null> {
    if (!this.ctx || this.ctx.state === 'closed') return null
    configureRelayAudioSession()
    if (this.ctx.state === 'suspended') {
      try {
        await this.ctx.resume()
      } catch {
        // ignore
      }
    }
    console.info('[relay-audio] context resumed', { state: this.ctx.state })
    return this.ctx.state
  }

  getContextState(): AudioContextState | null {
    return this.ctx?.state ?? null
  }

  getAudioContext(): AudioContext | null {
    return this.ctx
  }

  getPlayerNode(): AudioWorkletNode | null {
    return this.playerNode
  }

  getIsPlayingAudio(): boolean {
    return this.isPlayingAudio
  }

  getPlaybackLevel(): number {
    return this.playbackRms
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
  }

  getMuted(): boolean {
    return this.isMuted
  }

  async stop(): Promise<void> {
    if (this.silentCheckTimer) {
      clearTimeout(this.silentCheckTimer)
      this.silentCheckTimer = null
    }
    if (this.readyFallbackTimer) {
      clearTimeout(this.readyFallbackTimer)
      this.readyFallbackTimer = null
    }
    if (this.micStream) {
      if (this.ownsMicStream) {
        this.micStream.getTracks().forEach((track) => track.stop())
      }
      this.micStream = null
    }
    if (this.recorderNode) {
      this.recorderNode.disconnect()
      this.recorderNode = null
    }
    if (this.playerNode) {
      this.playerNode.disconnect()
      this.playerNode = null
    }
    this.playbackQueue = null
    this.isPlayingAudio = false
    this.playbackRms = 0
    if (this.ctx) {
      if (this.ownsCtx && this.ctx.state !== 'closed') {
        await this.ctx.close().catch(() => {})
      }
      this.ctx = null
    }
    this.isMuted = false
  }
}
