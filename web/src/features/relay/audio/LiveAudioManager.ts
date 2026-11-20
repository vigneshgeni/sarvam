/**
 * LiveAudioManager — Reusable Web Audio pipeline for Gemini Live.
 *
 * Requirements:
 * - One AudioContext created on the user's tap (iOS requirement).
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

export class LiveAudioManager {
  private ctx: AudioContext | null = null
  private playerNode: AudioWorkletNode | null = null
  private recorderNode: AudioWorkletNode | null = null
  private micStream: MediaStream | null = null
  private isMuted = false

  async start(onAudioChunk: (pcm16: ArrayBuffer) => void): Promise<void> {
    // 1. Create AudioContext (must be invoked inside user-gesture tap on iOS)
    const ctx = new AudioContext({ sampleRate: 24000 })
    this.ctx = ctx

    if (ctx.state === 'suspended') {
      await ctx.resume()
    }

    // 2. Register worklets
    const recUrl = blobUrl(RECORDER_WORKLET_CODE)
    const playUrl = blobUrl(PLAYER_WORKLET_CODE)
    await ctx.audioWorklet.addModule(recUrl)
    await ctx.audioWorklet.addModule(playUrl)

    // 3. Output player node (24 kHz)
    const playerNode = new AudioWorkletNode(ctx, 'player-processor')
    playerNode.connect(ctx.destination)
    this.playerNode = playerNode

    // 4. Capture mic with full noise cancellation and automatic gain control
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        sampleRate: 16000,
      },
    })
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
      this.micStream.getTracks().forEach((track) => track.stop())
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
      await this.ctx.close()
      this.ctx = null
    }
    this.isMuted = false
  }
}
