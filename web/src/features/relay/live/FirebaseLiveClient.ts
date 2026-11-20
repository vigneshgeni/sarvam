/**
 * Option B implementation: Firebase AI Logic + AgentPlatformBackend.
 *
 * Uses the `firebase/ai` SDK to open a Gemini Live session directly
 * from the browser, authenticated through the relay Firebase app.
 *
 * Defaults to `gemini-3.8-live` with fallback to `gemini-live-2.5-flash-native-audio`.
 * Voice defaults to `Aoede` (best-sounding for English & Tamil).
 */

import {
  getAI,
  AgentPlatformBackend,
  getLiveGenerativeModel,
  ResponseModality,
  type LiveSession,
  type LiveServerContent,
  type LiveSessionResumptionUpdate,
  type LiveServerGoingAwayNotice,
  type LiveGenerationConfig,
  type SingleSpeakerSpeechConfig,
} from 'firebase/ai'

import { getRelayApp } from '../firebaseRelay.js'
import type { LiveClient, LiveConnectOptions, WebSocketCloseInfo } from './LiveClient.js'
import { buildSoloSystemPrompt } from './relayPrompt.js'

// ── Env helpers ──────────────────────────────────────────────────────

function env(name: string, fallback?: string): string {
  const v = import.meta.env[name]
  if (typeof v === 'string' && v.length > 0) {
    return v
  }
  if (fallback !== undefined) {
    return fallback
  }
  throw new Error(`Missing ${name}`)
}

// ── Helpers ──────────────────────────────────────────────────────────

/** Convert an ArrayBuffer to a base64 string. */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/** Convert a base64 string to an ArrayBuffer. */
function base64ToArrayBuffer(base64: string): ArrayBuffer {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

// ── Implementation ──────────────────────────────────────────────────

export class FirebaseLiveClient implements LiveClient {
  private session: LiveSession | null = null
  private receiveLoopRunning = false
  private reconnecting = false
  private connectOptions?: LiveConnectOptions

  /** Session resumption handle, kept in memory & session. */
  private resumeHandle: string | undefined = undefined

  /** Active model in use. */
  private activeModel: string = import.meta.env.VITE_LIVE_MODEL || 'gemini-3.8-live'
  private isUsingFallback = false

  /** Captured WebSocket diagnostics. */
  private lastCloseInfo: WebSocketCloseInfo | null = null
  private lastErrorPayload: unknown = null

  // Callbacks
  onAudio: ((pcm16: ArrayBuffer) => void) | null = null
  onInputText: ((text: string) => void) | null = null
  onOutputText: ((text: string) => void) | null = null
  onTurnComplete: (() => void) | null = null
  onGenerationComplete: (() => void) | null = null
  onInterrupted: (() => void) | null = null
  onClose: ((info: WebSocketCloseInfo) => void) | null = null
  onErrorPayload: ((payload: unknown) => void) | null = null
  onUsingFallback: ((model: string) => void) | null = null
  onReconnecting: ((attempt: number) => void) | null = null
  onReconnected: (() => void) | null = null

  constructor() {
    // Restore resume handle if available
    try {
      if (typeof sessionStorage !== 'undefined') {
        const saved = sessionStorage.getItem('relay.live.resumeHandle')
        if (saved) this.resumeHandle = saved
      }
    } catch {
      // ignore
    }
  }

  getLastCloseInfo(): WebSocketCloseInfo | null {
    return this.lastCloseInfo
  }

  getLastErrorPayload(): unknown | null {
    return this.lastErrorPayload
  }

  getActiveModel(): string {
    return this.activeModel
  }

  getIsUsingFallback(): boolean {
    return this.isUsingFallback
  }

  getResumeHandle(): string | undefined {
    return this.resumeHandle
  }

  setResumeHandle(handle: string | undefined): void {
    this.resumeHandle = handle
    try {
      if (typeof sessionStorage !== 'undefined') {
        if (handle) {
          sessionStorage.setItem('relay.live.resumeHandle', handle)
        } else {
          sessionStorage.removeItem('relay.live.resumeHandle')
        }
      }
    } catch {
      // ignore
    }
  }

  async connect(options?: LiveConnectOptions): Promise<void> {
    this.connectOptions = options
    const preferredModel = options?.model || env('VITE_LIVE_MODEL', 'gemini-3.8-live')
    const fallbackModel = env('VITE_LIVE_FALLBACK_MODEL', 'gemini-live-2.5-flash-native-audio')

    try {
      this.activeModel = preferredModel
      this.isUsingFallback = false
      await this.internalConnect(preferredModel, options)
    } catch (err) {
      if (fallbackModel && fallbackModel !== preferredModel) {
        console.warn(
          `[FirebaseLiveClient] Connection to preferred model ${preferredModel} failed. Retrying with fallback model ${fallbackModel}...`,
          err,
        )
        this.activeModel = fallbackModel
        this.isUsingFallback = true
        if (this.onUsingFallback) {
          this.onUsingFallback(fallbackModel)
        }
        await this.internalConnect(fallbackModel, options)
        return
      }
      throw err
    }
  }

  private async internalConnect(model: string, options?: LiveConnectOptions): Promise<void> {
    const app = getRelayApp()
    const location = env('VITE_LIVE_LOCATION', 'us-central1')
    // Best-sounding voice default: Aoede
    const voice = options?.voice ?? (import.meta.env.VITE_LIVE_VOICE || 'Aoede')
    const profile = options?.profile ?? 'resumption'
    const language = options?.language ?? 'auto'

    const ai = getAI(app, { backend: new AgentPlatformBackend(location) })

    // Build generationConfig adapted for 3.8 and 2.5:
    // (no thinking_level, no affective dialogue, never proactive_audio: false)
    const generationConfig: LiveGenerationConfig = {
      responseModalities: [ResponseModality.AUDIO],
    }

    const speechConfig: SingleSpeakerSpeechConfig = {}

    if (voice) {
      speechConfig.voiceConfig = {
        prebuiltVoiceConfig: {
          voiceName: voice,
        },
      }
    }

    // Do not set a single speechConfig.languageCode or input language hint so multilingual
    // speakers (Tamil, English, Hindi) are never locked to one language.
    if (speechConfig.voiceConfig) {
      generationConfig.speechConfig = speechConfig
    }

    if (profile === 'transcription' || profile === 'compression' || profile === 'resumption') {
      generationConfig.inputAudioTranscription = {}
      generationConfig.outputAudioTranscription = {}
    }

    if (profile === 'compression' || profile === 'resumption') {
      generationConfig.contextWindowCompression = {
        slidingWindow: {},
      }
    }

    const systemInstruction = options?.systemInstruction || buildSoloSystemPrompt(language)

    const liveModel = getLiveGenerativeModel(ai, {
      model,
      generationConfig,
      systemInstruction,
    })

    const sessionResumptionConfig =
      profile === 'resumption'
        ? (this.resumeHandle ? { handle: this.resumeHandle } : undefined)
        : undefined

    this.lastCloseInfo = null
    this.lastErrorPayload = null

    // Track WebSocket in browser environments
    const hasWindowWS = typeof window !== 'undefined' && typeof window.WebSocket !== 'undefined'
    const OriginalWebSocket = hasWindowWS ? window.WebSocket : null

    if (hasWindowWS && OriginalWebSocket) {
      const client = this
      class TrackedWebSocket extends OriginalWebSocket {
        constructor(url: string | URL, protocols?: string | string[]) {
          super(url, protocols)

          this.addEventListener('close', (event: CloseEvent) => {
            const info: WebSocketCloseInfo = {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
            }
            client.lastCloseInfo = info
            console.warn('[FirebaseLiveClient] WebSocket close event:', {
              code: event.code,
              reason: event.reason,
              wasClean: event.wasClean,
            })
            if (client.onClose) {
              client.onClose(info)
            }
          })

          this.addEventListener('error', (_event) => {
            console.warn('[FirebaseLiveClient] WebSocket error event raised')
            if (client.onErrorPayload) {
              client.onErrorPayload({ type: 'websocket_error' })
            }
          })

          this.addEventListener('message', async (event: MessageEvent) => {
            let text = ''
            if (typeof event.data === 'string') {
              text = event.data
            } else if (event.data instanceof Blob) {
              text = await event.data.text()
            }
            if (text) {
              try {
                const parsed = JSON.parse(text)
                if (parsed.error) {
                  client.lastErrorPayload = parsed.error
                  console.warn('[FirebaseLiveClient] Server error payload received:', parsed.error)
                  if (client.onErrorPayload) {
                    client.onErrorPayload(parsed.error)
                  }
                }
              } catch {
                // non-JSON frame
              }
            }
          })
        }
      }

      window.WebSocket = TrackedWebSocket as unknown as typeof WebSocket
    }

    try {
      let timeoutId: ReturnType<typeof setTimeout> | undefined
      const timeoutPromise = new Promise<never>((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new Error('Gemini Live connection timed out'))
        }, 10000)
      })
      try {
        this.session = await Promise.race([
          liveModel.connect(sessionResumptionConfig),
          timeoutPromise,
        ])
      } finally {
        if (timeoutId !== undefined) clearTimeout(timeoutId)
      }
      this.startReceiveLoop()
    } catch (err) {
      const close = this.getLastCloseInfo()
      if (close) {
        console.warn(
          `[FirebaseLiveClient] Connect handshake failed (WS close code: ${close.code}, reason: "${close.reason}")`,
        )
      }
      throw err
    } finally {
      if (hasWindowWS && OriginalWebSocket) {
        window.WebSocket = OriginalWebSocket
      }
    }
  }

  sendAudio(pcm16: ArrayBuffer): void {
    if (!this.session) return
    const data = arrayBufferToBase64(pcm16)
    void this.session.sendAudioRealtime({ mimeType: 'audio/pcm', data })
  }

  sendFrame(jpeg: ArrayBuffer): void {
    this.sendVideo(jpeg)
  }

  sendVideo(jpeg: ArrayBuffer): void {
    if (!this.session) return
    const data = arrayBufferToBase64(jpeg)
    void this.session.sendVideoRealtime({ mimeType: 'image/jpeg', data })
  }

  isConnected(): boolean {
    return this.session !== null
  }

  sendText(text: string, turnComplete: boolean): void {
    if (!this.session) return
    void this.session.send(text, turnComplete)
  }

  async reconnectWithResumption(): Promise<void> {
    await this.triggerReconnect()
  }

  async close(): Promise<void> {
    this.receiveLoopRunning = false
    this.reconnecting = false
    if (this.session) {
      await this.session.close()
      this.session = null
    }
  }

  // ── Private ────────────────────────────────────────────────────────

  private startReceiveLoop(): void {
    if (!this.session || this.receiveLoopRunning) return
    this.receiveLoopRunning = true
    const session = this.session

    ;(async () => {
      try {
        for await (const msg of session.receive()) {
          if (!this.receiveLoopRunning) break

          switch (msg.type) {
            case 'serverContent':
              this.handleServerContent(msg as LiveServerContent)
              break

            case 'sessionResumptionUpdate':
              this.handleResumption(msg as LiveSessionResumptionUpdate)
              break

            case 'goingAwayNotice':
              void this.handleGoAway(msg as LiveServerGoingAwayNotice)
              break
          }
        }
      } catch (err) {
        if (this.receiveLoopRunning && !this.reconnecting) {
          console.warn('[LiveClient] receive loop interrupted, attempting reconnect…', err)
          void this.triggerReconnect()
        }
      }
    })()
  }

  private handleServerContent(msg: LiveServerContent): void {
    // Audio data from model
    if (msg.modelTurn?.parts) {
      for (const part of msg.modelTurn.parts) {
        if ('inlineData' in part && part.inlineData) {
          const blob = part.inlineData as { mimeType: string; data: string }
          if (blob.mimeType.startsWith('audio/') && this.onAudio) {
            this.onAudio(base64ToArrayBuffer(blob.data))
          }
        }
      }
    }

    // Input transcription
    if (msg.inputTranscription?.text && this.onInputText) {
      this.onInputText(msg.inputTranscription.text)
    }

    // Output transcription
    if (msg.outputTranscription?.text && this.onOutputText) {
      this.onOutputText(msg.outputTranscription.text)
    }

    // Interrupted (barge-in)
    if (msg.interrupted && this.onInterrupted) {
      this.onInterrupted()
    }

    // Turn complete
    if (msg.turnComplete && this.onTurnComplete) {
      this.onTurnComplete()
    }

    // Generation complete
    if ((msg as unknown as { generationComplete?: boolean }).generationComplete && this.onGenerationComplete) {
      this.onGenerationComplete()
    }
  }

  private handleResumption(msg: LiveSessionResumptionUpdate): void {
    if (msg.newHandle) {
      this.setResumeHandle(msg.newHandle)
    }
  }

  private async handleGoAway(_msg: LiveServerGoingAwayNotice): Promise<void> {
    console.warn('[LiveClient] goAway received, reconnecting with handle…')
    await this.triggerReconnect()
  }

  private async triggerReconnect(): Promise<void> {
    if (this.reconnecting) return
    this.reconnecting = true
    this.receiveLoopRunning = false

    try {
      await this.session?.close()
    } catch {
      // ignore
    }
    this.session = null

    if (this.onReconnecting) {
      this.onReconnecting(1)
    }

    try {
      await this.internalConnect(this.activeModel, this.connectOptions)
      this.reconnecting = false
      if (this.onReconnected) {
        this.onReconnected()
      }
    } catch (err) {
      console.warn('[LiveClient] Reconnect with resume handle failed, trying fresh session…', err)
      this.setResumeHandle(undefined)
      try {
        await this.internalConnect(this.activeModel, this.connectOptions)
        this.reconnecting = false
        if (this.onReconnected) {
          this.onReconnected()
        }
      } catch (freshErr) {
        this.reconnecting = false
        console.error('[LiveClient] Fresh reconnect also failed', freshErr)
      }
    }
  }
}
