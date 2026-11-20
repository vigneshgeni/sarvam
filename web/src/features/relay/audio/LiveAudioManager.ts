/**
 * LiveAudioManager — Reusable Web Audio pipeline for Gemini Live.
 *
 * Requirements:
 * - One AudioContext created/resumed synchronously on the user's tap (iOS requirement).
 * - Mic captured with echoCancellation, noiseSuppression and autoGainControl.
 * - Downsampled to 16 kHz mono PCM16 in 40 ms chunks (640 samples).
 * - 24 kHz playback via AudioWorklet with instant flush on barge-in.
 */

export const RECORDER_WORKLET_CODE = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this._buf = [];
  }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const ratio = sampleRate / 16000;
    for (let i = 0; i < ch.length; i += ratio) {
      this._buf.push(ch[Math.floor(i)]);
    }
    // 40ms chunk at 16 kHz = 640 samples
    while (this._buf.length >= 640) {
      const chunk = this._buf.splice(0, 640);
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
    this.port.onmessage = (e) => {
      if (e.data === 'flush') {
        this._queue = [];
        this._pos = 0;
        return;
      }
      this._queue.push(e.data);
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    for (let i = 0; i < out.length; i++) {
      if (this._queue.length === 0) {
        out[i] = 0;
        continue;
      }
      const buf = this._queue[0];
      const view = new Int16Array(buf);
      out[i] = view[this._pos] / 32768;
      this._pos++;
      if (this._pos >= view.length) {
        this._queue.shift();
        this._pos = 0;
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
    chunkDurationMs: (chunkSizeSamples / targetSampleRate) * 1000, // 40ms
  }
}

/**
 * Synchronously create or resume a single AudioContext inside a user tap handler.
 * Required by iOS Safari so playback and mic capture stay unlocked.
 */
export function createOrResumeRelayAudioContext(existing?: AudioContext | null): AudioContext | null {
  if (typeof window === 'undefined') return null
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
}

export class LiveAudioManager {
  private ctx: AudioContext | null = null
  private ownsCtx = true
  private playerNode: AudioWorkletNode | null = null
  private recorderNode: AudioWorkletNode | null = null
  private micStream: MediaStream | null = null
  private ownsMicStream = true
  private isMuted = false

  async start(
    onAudioChunk: (pcm16: ArrayBuffer) => void,
    options?: LiveAudioStartOptions,
  ): Promise<void> {
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
      await ctx.resume()
    }

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

    // 3. Output player node (24 kHz)
    const playerNode = new AudioWorkletNode(ctx, 'player-processor')
    playerNode.connect(ctx.destination)
    this.playerNode = playerNode

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
    if (this.playerNode) {
      this.playerNode.port.postMessage(pcm16, [pcm16])
    }
  }

  flush(): void {
    if (this.playerNode) {
      this.playerNode.port.postMessage('flush')
    }
  }

  setMuted(muted: boolean): void {
    this.isMuted = muted
  }

  getMuted(): boolean {
    return this.isMuted
  }

  async stop(): Promise<void> {
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
    if (this.ctx) {
      if (this.ownsCtx && this.ctx.state !== 'closed') {
        await this.ctx.close().catch(() => {})
      }
      this.ctx = null
    }
    this.isMuted = false
  }
}
