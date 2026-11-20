/**
 * LiveClient — the single interface from the architecture doc.
 *
 * Both Option A (Python proxy) and Option B (Firebase AI Logic) expose
 * this same contract so the rest of the app doesn't care which won.
 */

export type SetupProfile = 'minimal' | 'transcription' | 'compression' | 'resumption'

export type RelayLanguage = 'auto' | 'en' | 'ta'

export interface LiveConnectOptions {
  model?: string
  voice?: string
  profile?: SetupProfile
  language?: RelayLanguage
  systemInstruction?: string
}

export interface WebSocketCloseInfo {
  code: number
  reason: string
  wasClean?: boolean
}

export interface LiveClient {
  /** Open a connection to Gemini Live. */
  connect(options?: LiveConnectOptions): Promise<void>

  /** Send a chunk of 16-bit PCM audio at 16 kHz (raw ArrayBuffer). */
  sendAudio(pcm16: ArrayBuffer): void

  /** Send a camera frame as JPEG bytes. */
  sendFrame(jpeg: ArrayBuffer): void

  /** Send a camera video frame as JPEG bytes (Live video realtime stream). */
  sendVideo(jpeg: ArrayBuffer): void

  /** Whether the Live session socket is currently open. */
  isConnected(): boolean

  /** Send a text message, optionally marking it as a complete user turn. */
  sendText(text: string, turnComplete: boolean): void

  // ── Callbacks ──────────────────────────────────────────────────────

  /** Gemini's voice data: 24 kHz mono PCM16, little-endian. */
  onAudio: ((pcm16: ArrayBuffer) => void) | null

  /** Transcription of the user's speech (input). */
  onInputText: ((text: string) => void) | null

  /** Transcription of Gemini's speech (output). */
  onOutputText: ((text: string) => void) | null

  /** Turn completed by server. */
  onTurnComplete?: (() => void) | null

  /** Generation completed by server. */
  onGenerationComplete?: (() => void) | null

  /** Gemini was interrupted (barge-in). */
  onInterrupted: (() => void) | null

  /** WebSocket closed event info. */
  onClose: ((info: WebSocketCloseInfo) => void) | null

  /** Error payload received from server or socket. */
  onErrorPayload: ((payload: unknown) => void) | null

  /** Fired when falling back from preferred model to fallback model. */
  onUsingFallback?: ((model: string) => void) | null

  /** Fired when attempting reconnection. */
  onReconnecting?: ((attempt: number) => void) | null

  /** Fired after successful reconnection. */
  onReconnected?: (() => void) | null

  /** Get last close info if available. */
  getLastCloseInfo(): WebSocketCloseInfo | null

  /** Get last error payload if available. */
  getLastErrorPayload(): unknown | null

  /** Get current active model string. */
  getActiveModel(): string

  /** Check if currently using fallback model. */
  getIsUsingFallback(): boolean

  /** Get session resumption handle. */
  getResumeHandle(): string | undefined

  /** Set session resumption handle. */
  setResumeHandle(handle: string | undefined): void

  /** Reconnect using the saved session resumption handle if supported. */
  reconnectWithResumption?(): Promise<void>

  /** Close the connection. */
  close(): Promise<void>
}
