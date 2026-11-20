/**
 * Dev-only spike page for testing Gemini Live audio + video.
 *
 * Route: /relay-spike  (checked in App.tsx via location.pathname)
 *
 * Features:
 *  - Start button (creates AudioContext on tap — iOS requirement)
 *  - Mic capture → Gemini (16 kHz PCM16)
 *  - Gemini audio out → speakers (24 kHz PCM16)
 *  - Input + output captions grouped by turn (strip speaker notes, update in place)
 *  - Button to send current camera frame as JPEG
 *  - Dev-only Model & Setup Profile switches + Automated Diagnostics
 *  - Language setting (Auto, English, Tamil) with speechConfig.languageCode & solo system instruction lock
 *  - VAD (Open Mic + Mute) / Hold-to-Talk switch
 *  - Detailed WebSocket close code & reason + error payload display
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { FirebaseLiveClient } from './live/FirebaseLiveClient.js'
import { subscribeAppCheckStatus, getRelayAppCheckDebugToken } from './firebaseRelay.js'
import { stripSpeakerNotes } from './live/relayPrompt.js'
import type { SetupProfile, WebSocketCloseInfo, RelayLanguage } from './live/LiveClient.js'

// ── Audio worklet inline code ───────────────────────────────────────

const RECORDER_WORKLET = `
class RecorderProcessor extends AudioWorkletProcessor {
  constructor() { super(); this._buf = []; }
  process(inputs) {
    const ch = inputs[0]?.[0];
    if (!ch) return true;
    const ratio = sampleRate / 16000;
    for (let i = 0; i < ch.length; i += ratio) {
      this._buf.push(ch[Math.floor(i)]);
    }
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

const PLAYER_WORKLET = `
class PlayerProcessor extends AudioWorkletProcessor {
  constructor() { super(); this._queue = []; this._pos = 0;
    this.port.onmessage = (e) => {
      if (e.data === 'flush') { this._queue = []; this._pos = 0; return; }
      this._queue.push(e.data);
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0]?.[0];
    if (!out) return true;
    for (let i = 0; i < out.length; i++) {
      if (this._queue.length === 0) { out[i] = 0; continue; }
      const buf = this._queue[0];
      const view = new Int16Array(buf);
      out[i] = view[this._pos] / 32768;
      this._pos++;
      if (this._pos >= view.length) { this._queue.shift(); this._pos = 0; }
    }
    return true;
  }
}
registerProcessor('player-processor', PlayerProcessor);
`

function blobUrl(code: string): string {
  return URL.createObjectURL(new Blob([code], { type: 'application/javascript' }))
}

// ── Diagnostics Constants ───────────────────────────────────────────

const CANDIDATE_MODELS = [
  'gemini-live-2.5-flash-native-audio',
  'gemini-live-2.5-flash-preview-native-audio-09-2025',
  'gemini-live-2.5-flash',
]

const VOICES = [
  { id: '', label: '(Model Default)' },
  { id: 'Aoede', label: 'Aoede' },
  { id: 'Kore', label: 'Kore' },
  { id: 'Puck', label: 'Puck' },
  { id: 'Charon', label: 'Charon' },
  { id: 'Fenrir', label: 'Fenrir' },
  { id: 'Zephyr', label: 'Zephyr' },
  { id: 'Leda', label: 'Leda' },
  { id: 'Orus', label: 'Orus' },
]

const PROFILES: { id: SetupProfile; label: string; desc: string }[] = [
  { id: 'minimal', label: 'a. minimal', desc: 'AUDIO response only' },
  { id: 'transcription', label: 'b. + transcription', desc: 'input & output transcription' },
  { id: 'compression', label: 'c. + compression', desc: 'slidingWindow compression' },
  { id: 'resumption', label: 'd. + resumption', desc: 'sessionResumption' },
]

const LANGUAGES: { id: RelayLanguage; label: string; desc: string; code?: string }[] = [
  { id: 'auto', label: 'Auto (Tamil/English)', desc: 'Tanglish / Tamil / English auto-lock' },
  { id: 'en', label: 'English (en-IN)', desc: 'Strict English lock', code: 'en-IN' },
  { id: 'ta', label: 'Tamil (ta-IN)', desc: 'Strict Tamil lock', code: 'ta-IN' },
]

export interface CaptionTurn {
  id: string
  who: 'You' | 'Gemini' | 'System'
  text: string
  isComplete?: boolean
}

// ── Component ───────────────────────────────────────────────────────

export default function RelaySpikeScreen() {
  const [status, setStatus] = useState<'idle' | 'connecting' | 'live' | 'error'>('idle')
  const [captions, setCaptions] = useState<CaptionTurn[]>([])
  const [errorMsg, setErrorMsg] = useState('')

  // Settings state
  const defaultModel = import.meta.env.VITE_LIVE_MODEL || 'gemini-live-2.5-flash-native-audio'
  const defaultVoice = import.meta.env.VITE_LIVE_VOICE || ''
  const [selectedModel, setSelectedModel] = useState<string>(defaultModel)
  const [selectedVoice, setSelectedVoice] = useState<string>(defaultVoice)
  const [selectedProfile, setSelectedProfile] = useState<SetupProfile>('resumption')
  const [selectedLanguage, setSelectedLanguage] = useState<RelayLanguage>('auto')

  // Mic mode state (VAD vs Hold to talk)
  const [micMode, setMicMode] = useState<'vad' | 'hold'>('vad')
  const [isMuted, setIsMuted] = useState(false)
  const [isHoldingTalk, setIsHoldingTalk] = useState(false)

  // Diagnostics & App Check state
  const [lastClose, setLastClose] = useState<WebSocketCloseInfo | null>(null)
  const [lastErrorPayload, setLastErrorPayload] = useState<unknown | null>(null)
  const [appCheckStatus, setAppCheckStatus] = useState<string>('Checking App Check token…')
  const devDebugToken = import.meta.env.DEV ? getRelayAppCheckDebugToken() : ''
  const [copiedToken, setCopiedToken] = useState(false)

  const handleCopyDebugToken = useCallback(() => {
    if (!devDebugToken) return
    void navigator.clipboard.writeText(devDebugToken)
    setCopiedToken(true)
    setTimeout(() => setCopiedToken(false), 2000)
  }, [devDebugToken])

  useEffect(() => {
    const timer = setTimeout(() => {
      setAppCheckStatus((curr) =>
        curr.startsWith('Checking')
          ? 'App Check token: FAILED (appCheck/timeout - Verification timed out after 10s)'
          : curr
      )
    }, 10000)

    const unsub = subscribeAppCheckStatus((s) => {
      setAppCheckStatus(s)
    })

    return () => {
      clearTimeout(timer)
      unsub()
    }
  }, [])

  // Diagnostics runner state
  const [diagRunning, setDiagRunning] = useState(false)
  const [diagResults, setDiagResults] = useState<
    { model: string; profile: SetupProfile; status: 'PASS' | 'FAIL'; detail?: string }[]
  >([])

  const clientRef = useRef<FirebaseLiveClient | null>(null)
  const audioCtxRef = useRef<AudioContext | null>(null)
  const playerNodeRef = useRef<AudioWorkletNode | null>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)

  // Mic mode refs for worklet loop
  const micModeRef = useRef<'vad' | 'hold'>('vad')
  const isMutedRef = useRef(false)
  const isHoldingTalkRef = useRef(false)

  useEffect(() => {
    micModeRef.current = micMode
  }, [micMode])

  useEffect(() => {
    isMutedRef.current = isMuted
  }, [isMuted])

  useEffect(() => {
    isHoldingTalkRef.current = isHoldingTalk
  }, [isHoldingTalk])

  // Turn grouping refs
  const activeInputTurnId = useRef<string | null>(null)
  const activeOutputTurnId = useRef<string | null>(null)
  const activeInputText = useRef<string>('')
  const activeOutputText = useRef<string>('')

  // ── Start ──────────────────────────────────────────────────────────

  const handleStart = useCallback(async () => {
    setStatus('connecting')
    setErrorMsg('')
    setLastClose(null)
    setLastErrorPayload(null)

    // Reset turn buffers
    activeInputTurnId.current = null
    activeOutputTurnId.current = null
    activeInputText.current = ''
    activeOutputText.current = ''

    try {
      // 1. AudioContext (must be created from a user tap on iOS)
      const ctx = new AudioContext({ sampleRate: 24000 })
      audioCtxRef.current = ctx

      // 2. Register worklets
      const recUrl = blobUrl(RECORDER_WORKLET)
      const playUrl = blobUrl(PLAYER_WORKLET)
      await ctx.audioWorklet.addModule(recUrl)
      await ctx.audioWorklet.addModule(playUrl)

      // 3. Player node (24 kHz output)
      const playerNode = new AudioWorkletNode(ctx, 'player-processor')
      playerNode.connect(ctx.destination)
      playerNodeRef.current = playerNode

      // 4. Mic → recorder worklet → sendAudio
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, sampleRate: 16000 },
      })
      const micSource = ctx.createMediaStreamSource(stream)
      const recorderNode = new AudioWorkletNode(ctx, 'recorder-processor')
      micSource.connect(recorderNode)

      // 5. Create LiveClient
      const client = new FirebaseLiveClient()
      clientRef.current = client

      // Wire callbacks
      client.onAudio = (pcm16) => {
        playerNode.port.postMessage(pcm16, [pcm16])
      }

      // Input text: group into a single "You" row per turn, update in place
      client.onInputText = (text: string) => {
        // If Gemini was speaking, close Gemini's active turn
        if (activeOutputTurnId.current) {
          const prevId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) =>
            prev.map((c) => (c.id === prevId ? { ...c, isComplete: true } : c))
          )
        }

        if (!activeInputTurnId.current) {
          const turnId = `you-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          activeInputTurnId.current = turnId
          activeInputText.current = text
          const cleaned = stripSpeakerNotes(activeInputText.current)
          setCaptions((prev) => [
            ...prev.slice(-49),
            { id: turnId, who: 'You', text: cleaned },
          ])
        } else {
          activeInputText.current += text
          const cleaned = stripSpeakerNotes(activeInputText.current)
          const turnId = activeInputTurnId.current
          setCaptions((prev) =>
            prev.map((c) => (c.id === turnId ? { ...c, text: cleaned } : c))
          )
        }
      }

      // Output text: group into a single "Gemini" row per turn, update in place
      client.onOutputText = (text: string) => {
        // If You was speaking, close You's active turn
        if (activeInputTurnId.current) {
          const prevId = activeInputTurnId.current
          activeInputTurnId.current = null
          activeInputText.current = ''
          setCaptions((prev) =>
            prev.map((c) => (c.id === prevId ? { ...c, isComplete: true } : c))
          )
        }

        if (!activeOutputTurnId.current) {
          const turnId = `gemini-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
          activeOutputTurnId.current = turnId
          activeOutputText.current = text
          const cleaned = stripSpeakerNotes(activeOutputText.current)
          setCaptions((prev) => [
            ...prev.slice(-49),
            { id: turnId, who: 'Gemini', text: cleaned },
          ])
        } else {
          activeOutputText.current += text
          const cleaned = stripSpeakerNotes(activeOutputText.current)
          const turnId = activeOutputTurnId.current
          setCaptions((prev) =>
            prev.map((c) => (c.id === turnId ? { ...c, text: cleaned } : c))
          )
        }
      }

      // Turn completed: mark active turn complete so next speech creates a new row
      client.onTurnComplete = () => {
        if (activeOutputTurnId.current) {
          const turnId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) =>
            prev.map((c) => (c.id === turnId ? { ...c, isComplete: true } : c))
          )
        }
        if (activeInputTurnId.current) {
          const turnId = activeInputTurnId.current
          activeInputTurnId.current = null
          activeInputText.current = ''
          setCaptions((prev) =>
            prev.map((c) => (c.id === turnId ? { ...c, isComplete: true } : c))
          )
        }
      }

      client.onGenerationComplete = () => {
        if (activeOutputTurnId.current) {
          const turnId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) =>
            prev.map((c) => (c.id === turnId ? { ...c, isComplete: true } : c))
          )
        }
      }

      // Barge-in interruption
      client.onInterrupted = () => {
        playerNode.port.postMessage('flush')
        if (activeOutputTurnId.current) {
          const turnId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) =>
            prev.map((c) =>
              c.id === turnId
                ? { ...c, isComplete: true, text: c.text ? `${c.text} ⚡` : '⚡' }
                : c
            )
          )
        }
      }

      client.onClose = (info) => {
        setLastClose(info)
      }

      client.onErrorPayload = (payload) => {
        setLastErrorPayload(payload)
      }

      // 6. Connect with selected model, voice, profile & language
      await client.connect({
        model: selectedModel,
        voice: selectedVoice,
        profile: selectedProfile,
        language: selectedLanguage,
      })

      // 7. Forward mic audio according to micMode (VAD vs Hold-to-Talk)
      recorderNode.port.onmessage = (e) => {
        if (!clientRef.current) return
        const pcm = e.data as ArrayBuffer

        if (micModeRef.current === 'vad') {
          if (!isMutedRef.current) {
            clientRef.current.sendAudio(pcm)
          }
        } else {
          // Hold to talk mode
          if (isHoldingTalkRef.current) {
            clientRef.current.sendAudio(pcm)
          }
        }
      }

      setStatus('live')

      // 8. Start camera (back-facing for the spike)
      try {
        const camStream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: 'environment', width: 768, height: 1024 },
        })
        if (videoRef.current) {
          videoRef.current.srcObject = camStream
          void videoRef.current.play()
        }
      } catch {
        console.warn('[Spike] Camera not available')
      }
    } catch (err: unknown) {
      console.error('[Spike] Start failed', err)
      setStatus('error')

      const closeInfo = clientRef.current?.getLastCloseInfo()
      if (closeInfo) setLastClose(closeInfo)
      const errorPayload = clientRef.current?.getLastErrorPayload()
      if (errorPayload) setLastErrorPayload(errorPayload)

      const raw =
        err instanceof Error
          ? err.message
          : typeof err === 'object' && err !== null && 'message' in err
            ? String((err as { message: unknown }).message)
            : String(err)
      const full = `${raw} ${String(err)}`
      const isAppCheck = /app[- ]?check|403/i.test(full)
      const msg = isAppCheck ? `App Check blocked the request: ${raw}` : raw
      setErrorMsg(msg)
    }
  }, [selectedModel, selectedVoice, selectedProfile, selectedLanguage])

  // ── Send camera frame ──────────────────────────────────────────────

  const handleSendFrame = useCallback(() => {
    const video = videoRef.current
    const canvas = canvasRef.current
    const client = clientRef.current
    if (!video || !canvas || !client) return

    canvas.width = Math.min(video.videoWidth, 768)
    canvas.height = Math.round((canvas.width / video.videoWidth) * video.videoHeight)
    const ctx2d = canvas.getContext('2d')!
    ctx2d.drawImage(video, 0, 0, canvas.width, canvas.height)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        blob.arrayBuffer().then((buf) => {
          client.sendFrame(buf)
          client.sendText('What is in my hand?', true)

          // Finalize existing turns
          activeInputTurnId.current = null
          activeOutputTurnId.current = null
          activeInputText.current = ''
          activeOutputText.current = ''

          setCaptions((prev) => [
            ...prev.slice(-49),
            {
              id: `frame-${Date.now()}`,
              who: 'System',
              text: '📷 Sent camera frame ("What is in my hand?")',
              isComplete: true,
            },
          ])
        })
      },
      'image/jpeg',
      0.7,
    )
  }, [])

  // ── Stop ───────────────────────────────────────────────────────────

  const handleStop = useCallback(async () => {
    if (clientRef.current) {
      await clientRef.current.close()
      clientRef.current = null
    }
    if (audioCtxRef.current) {
      await audioCtxRef.current.close()
      audioCtxRef.current = null
    }
    const video = videoRef.current
    if (video?.srcObject) {
      ;(video.srcObject as MediaStream).getTracks().forEach((t) => t.stop())
      video.srcObject = null
    }
    setStatus('idle')
    activeInputTurnId.current = null
    activeOutputTurnId.current = null
    activeInputText.current = ''
    activeOutputText.current = ''
    setIsHoldingTalk(false)
  }, [])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      void handleStop()
    }
  }, [handleStop])

  // ── Automated Diagnostics Runner ───────────────────────────────────

  const runSingleProbe = async (
    model: string,
    profile: SetupProfile,
  ): Promise<{ status: 'PASS' | 'FAIL'; detail: string }> => {
    const probe = new FirebaseLiveClient()
    try {
      await probe.connect({
        model,
        voice: selectedVoice,
        profile,
        language: selectedLanguage,
      })
      await probe.close()
      return { status: 'PASS', detail: 'Connected successfully' }
    } catch (err: unknown) {
      const close = probe.getLastCloseInfo()
      const raw = err instanceof Error ? err.message : String(err)
      const detail = close
        ? `Close ${close.code}: "${close.reason || 'no reason'}" (${raw})`
        : raw
      return { status: 'FAIL', detail }
    }
  }

  const handleRunDiagnostics = async () => {
    setDiagRunning(true)
    setDiagResults([])

    const results: { model: string; profile: SetupProfile; status: 'PASS' | 'FAIL'; detail?: string }[] = []

    const testOne = async (model: string, profile: SetupProfile) => {
      const res = await runSingleProbe(model, profile)
      results.push({ model, profile, status: res.status, detail: res.detail })
      setDiagResults([...results])
      return res.status === 'PASS'
    }

    console.log(`[Diagnostics] Testing model: ${selectedModel}`)
    const minimalPassed = await testOne(selectedModel, 'minimal')

    if (minimalPassed) {
      const transPassed = await testOne(selectedModel, 'transcription')
      if (transPassed) {
        const compPassed = await testOne(selectedModel, 'compression')
        if (compPassed) {
          await testOne(selectedModel, 'resumption')
        }
      }
    } else {
      for (const m of CANDIDATE_MODELS) {
        if (m === selectedModel) continue
        const passed = await testOne(m, 'minimal')
        if (passed) {
          setSelectedModel(m)
          const transPassed = await testOne(m, 'transcription')
          if (transPassed) {
            const compPassed = await testOne(m, 'compression')
            if (compPassed) {
              await testOne(m, 'resumption')
            }
          }
          break
        }
      }
    }

    setDiagRunning(false)
  }

  // ── Render ─────────────────────────────────────────────────────────

  const isNativeAudioModel = selectedModel.includes('native-audio')

  return (
    <div
      style={{
        minHeight: '100dvh',
        background: '#1B1B1B',
        color: '#F5F4F2',
        padding: 16,
        fontFamily: 'DM Sans, sans-serif',
      }}
    >
      <h1 style={{ fontSize: 24, fontFamily: 'Fraunces, serif', marginBottom: 8 }}>
        🔬 Relay Spike — Gemini Live (Option B)
      </h1>

      {/* Dev-Only Debug Token Box */}
      {import.meta.env.DEV && devDebugToken && (
        <div
          style={{
            background: 'rgba(227, 182, 96, 0.12)',
            border: '1px solid #E3B660',
            borderRadius: 14,
            padding: 14,
            marginBottom: 16,
          }}
        >
          <div style={{ fontSize: 13, fontWeight: 600, color: '#E3B660', marginBottom: 8 }}>
            Debug token (dev only): register this in Firebase App Check &gt; Sarvam web &gt; Manage debug tokens
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <code
              style={{
                flex: 1,
                background: 'rgba(0, 0, 0, 0.45)',
                color: '#F5F4F2',
                padding: '10px 12px',
                borderRadius: 8,
                fontSize: 13,
                wordBreak: 'break-all',
                userSelect: 'all',
                fontFamily: 'monospace',
              }}
            >
              {devDebugToken}
            </code>
            <button
              onClick={handleCopyDebugToken}
              aria-label="Copy debug token to clipboard"
              style={{
                background: copiedToken ? '#4ade80' : '#E3B660',
                color: '#1B1B1B',
                border: 'none',
                borderRadius: 8,
                padding: '10px 16px',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                minHeight: 44,
                minWidth: 44,
              }}
            >
              {copiedToken ? '✓ Copied' : 'Copy'}
            </button>
          </div>
        </div>
      )}

      {/* Active Diagnostics Summary Card */}
      <div
        style={{
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.12)',
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
        }}
      >
        {/* App Check Status */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6, letterSpacing: '0.05em' }}>
            App Check Status
          </div>
          <div
            style={{
              marginTop: 4,
              fontSize: 14,
              fontWeight: 600,
              color: appCheckStatus.includes('OK') ? '#4ade80' : '#E5533D',
            }}
          >
            {appCheckStatus}
          </div>
        </div>

        {/* Active Model */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6, letterSpacing: '0.05em' }}>
            Active Model String
          </div>
          <code
            style={{
              display: 'inline-block',
              background: '#214D47',
              color: '#D3E5E0',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {selectedModel}
          </code>
        </div>

        {/* Active Voice */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6, letterSpacing: '0.05em' }}>
            Active Voice
          </div>
          <code
            style={{
              display: 'inline-block',
              background: '#214D47',
              color: '#D3E5E0',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {selectedVoice || '(Model Default)'}
          </code>
        </div>

        {/* Active Language */}
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 13, textTransform: 'uppercase', opacity: 0.6, letterSpacing: '0.05em' }}>
            Active Language
          </div>
          <code
            style={{
              display: 'inline-block',
              background: '#214D47',
              color: '#D3E5E0',
              padding: '4px 10px',
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              marginTop: 4,
            }}
          >
            {selectedLanguage === 'auto'
              ? 'Auto (English/Tamil)'
              : selectedLanguage === 'en'
                ? 'English (en-IN)'
                : 'Tamil (ta-IN)'}
          </code>
        </div>

        {/* Language Setting Selector */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
            Language Setting (System Instruction + TTS):
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {LANGUAGES.map((l) => (
              <button
                key={l.id}
                onClick={() => setSelectedLanguage(l.id)}
                aria-label={`Select language ${l.label}`}
                style={{
                  background: selectedLanguage === l.id ? '#E3B660' : 'rgba(255,255,255,0.08)',
                  color: selectedLanguage === l.id ? '#1B1B1B' : '#F5F4F2',
                  border: 'none',
                  borderRadius: 16,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: selectedLanguage === l.id ? 'bold' : 'normal',
                }}
              >
                {l.label}
              </button>
            ))}
          </div>
          <div style={{ fontSize: 11, opacity: 0.6, marginTop: 4 }}>
            {!isNativeAudioModel
              ? `Passing speechConfig.languageCode: ${selectedLanguage === 'en' ? 'en-IN' : selectedLanguage === 'ta' ? 'ta-IN' : '(none/auto)'} (supported by ${selectedModel})`
              : `Native audio model: languageCode not accepted in speechConfig, strict solo system instruction lock applies.`}
          </div>
        </div>

        {/* Voice Dropdown */}
        <div style={{ marginBottom: 14 }}>
          <label htmlFor="voice-select" style={{ display: 'block', fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
            Select Voice:
          </label>
          <select
            id="voice-select"
            value={selectedVoice}
            onChange={(e) => setSelectedVoice(e.target.value)}
            style={{
              background: 'rgba(255, 255, 255, 0.1)',
              color: '#F5F4F2',
              border: '1px solid rgba(255, 255, 255, 0.2)',
              borderRadius: 10,
              padding: '8px 12px',
              fontSize: 14,
              cursor: 'pointer',
              width: '100%',
              maxWidth: 320,
            }}
          >
            {VOICES.map((v) => (
              <option key={v.id} value={v.id} style={{ background: '#1B1B1B', color: '#F5F4F2' }}>
                {v.label}
              </option>
            ))}
          </select>
        </div>

        {/* Model Switcher */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>Switch Model:</div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {CANDIDATE_MODELS.map((m) => (
              <button
                key={m}
                onClick={() => setSelectedModel(m)}
                style={{
                  background: selectedModel === m ? '#E3B660' : 'rgba(255,255,255,0.08)',
                  color: selectedModel === m ? '#1B1B1B' : '#F5F4F2',
                  border: 'none',
                  borderRadius: 16,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: selectedModel === m ? 'bold' : 'normal',
                }}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Setup Profile Switcher */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 6 }}>
            Setup Profile (Current: <strong>{selectedProfile}</strong>):
          </div>
          <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            {PROFILES.map((p) => (
              <button
                key={p.id}
                onClick={() => setSelectedProfile(p.id)}
                style={{
                  background: selectedProfile === p.id ? '#D3E5E0' : 'rgba(255,255,255,0.08)',
                  color: selectedProfile === p.id ? '#1B1B1B' : '#F5F4F2',
                  border: 'none',
                  borderRadius: 16,
                  padding: '6px 12px',
                  fontSize: 12,
                  cursor: 'pointer',
                  fontWeight: selectedProfile === p.id ? 'bold' : 'normal',
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>

        {/* Automated Diagnostics Trigger */}
        <button
          onClick={handleRunDiagnostics}
          disabled={diagRunning || status === 'live'}
          style={{
            background: diagRunning ? '#555' : '#C96846',
            color: '#fff',
            border: 'none',
            borderRadius: 20,
            padding: '10px 18px',
            fontSize: 13,
            cursor: diagRunning ? 'not-allowed' : 'pointer',
            fontWeight: 600,
          }}
        >
          {diagRunning ? '⏳ Running Suite…' : '🧪 Run Setup Diagnostics (Auto-test)'}
        </button>

        {/* Diagnostics Results Table */}
        {diagResults.length > 0 && (
          <div
            style={{
              marginTop: 12,
              background: 'rgba(0,0,0,0.3)',
              borderRadius: 8,
              padding: 10,
              fontSize: 12,
              maxHeight: 200,
              overflowY: 'auto',
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 6 }}>Diagnostic Results:</div>
            {diagResults.map((r, i) => (
              <div key={i} style={{ marginBottom: 4, display: 'flex', gap: 8, alignItems: 'flex-start' }}>
                <span
                  style={{
                    color: r.status === 'PASS' ? '#4ade80' : '#E5533D',
                    fontWeight: 'bold',
                    minWidth: 42,
                  }}
                >
                  [{r.status}]
                </span>
                <span style={{ color: '#E3B660' }}>{r.profile}</span>
                <span style={{ opacity: 0.8 }}>({r.model})</span>
                <span style={{ opacity: 0.6, wordBreak: 'break-word' }}>{r.detail}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Main Start / Connect Controls */}
      {status === 'idle' && (
        <button
          onClick={handleStart}
          aria-label="Start Gemini Live session"
          style={{
            background: '#214D47',
            color: '#F5F4F2',
            border: 'none',
            borderRadius: 22,
            padding: '14px 32px',
            fontSize: 17,
            cursor: 'pointer',
            minHeight: 44,
            minWidth: 44,
          }}
        >
          ▶ Start
        </button>
      )}

      {status === 'connecting' && <p style={{ color: '#E3B660' }}>Connecting to Gemini Live…</p>}

      {status === 'error' && (
        <div style={{ marginBottom: 16 }}>
          <p style={{ color: '#E5533D', wordBreak: 'break-word', fontWeight: 500 }}>Error: {errorMsg}</p>

          {/* WebSocket Close Info Banner */}
          {lastClose && (
            <div
              style={{
                background: 'rgba(229, 83, 61, 0.15)',
                border: '1px solid #E5533D',
                borderRadius: 12,
                padding: 12,
                margin: '8px 0',
              }}
            >
              <div style={{ fontWeight: 600, color: '#E5533D', marginBottom: 4 }}>
                WebSocket Close Event
              </div>
              <div style={{ fontSize: 13 }}>
                Code: <strong>{lastClose.code}</strong> | Clean: {lastClose.wasClean ? 'yes' : 'no'}
              </div>
              <div style={{ fontSize: 13, marginTop: 2, wordBreak: 'break-word' }}>
                Reason: <strong>{lastClose.reason || '(empty/no reason provided)'}</strong>
              </div>
            </div>
          )}

          {/* Server Error Payload */}
          {lastErrorPayload !== null && (
            <div
              style={{
                background: 'rgba(227, 182, 96, 0.15)',
                border: '1px solid #E3B660',
                borderRadius: 12,
                padding: 12,
                margin: '8px 0',
              }}
            >
              <div style={{ fontWeight: 600, color: '#E3B660', marginBottom: 4 }}>
                Server Error Payload
              </div>
              <pre style={{ margin: 0, fontSize: 12, overflowX: 'auto' }}>
                {JSON.stringify(lastErrorPayload, null, 2)}
              </pre>
            </div>
          )}

          <button
            onClick={handleStart}
            aria-label="Retry connection"
            style={{
              background: '#C96846',
              color: '#fff',
              border: 'none',
              borderRadius: 22,
              padding: '14px 32px',
              fontSize: 17,
              cursor: 'pointer',
              marginTop: 8,
              minHeight: 44,
              minWidth: 44,
            }}
          >
            Retry
          </button>
        </div>
      )}

      {status === 'live' && (
        <div>
          {/* Microphone Mode Selection & Controls */}
          <div
            style={{
              background: 'rgba(255,255,255,0.06)',
              borderRadius: 16,
              padding: 14,
              marginBottom: 16,
            }}
          >
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 8 }}>Microphone Mode:</div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <button
                onClick={() => setMicMode('vad')}
                aria-label="Set mic mode to Open Mic VAD"
                style={{
                  flex: 1,
                  minHeight: 44,
                  background: micMode === 'vad' ? '#214D47' : 'rgba(255,255,255,0.1)',
                  color: micMode === 'vad' ? '#D3E5E0' : '#F5F4F2',
                  border: micMode === 'vad' ? '2px solid #D3E5E0' : 'none',
                  borderRadius: 12,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Open Mic (VAD)
              </button>
              <button
                onClick={() => setMicMode('hold')}
                aria-label="Set mic mode to Hold to Talk"
                style={{
                  flex: 1,
                  minHeight: 44,
                  background: micMode === 'hold' ? '#C96846' : 'rgba(255,255,255,0.1)',
                  color: '#F5F4F2',
                  border: micMode === 'hold' ? '2px solid #F5F4F2' : 'none',
                  borderRadius: 12,
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                }}
              >
                Hold to Talk
              </button>
            </div>

            {micMode === 'vad' ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ fontSize: 13, color: isMuted ? '#E5533D' : '#4ade80', fontWeight: 600 }}>
                  {isMuted ? '🔇 Microphone Muted' : '🟢 Open Mic Active (VAD streaming)'}
                </div>
                <button
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
                  style={{
                    minHeight: 44,
                    padding: '8px 18px',
                    borderRadius: 22,
                    border: 'none',
                    background: isMuted ? '#4ade80' : '#E5533D',
                    color: isMuted ? '#1B1B1B' : '#fff',
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {isMuted ? 'Unmute' : 'Mute'}
                </button>
              </div>
            ) : (
              <div style={{ textAlign: 'center' }}>
                <button
                  onPointerDown={() => setIsHoldingTalk(true)}
                  onPointerUp={() => setIsHoldingTalk(false)}
                  onPointerLeave={() => setIsHoldingTalk(false)}
                  onTouchStart={(e) => {
                    e.preventDefault()
                    setIsHoldingTalk(true)
                  }}
                  onTouchEnd={(e) => {
                    e.preventDefault()
                    setIsHoldingTalk(false)
                  }}
                  onKeyDown={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      setIsHoldingTalk(true)
                    }
                  }}
                  onKeyUp={(e) => {
                    if (e.key === ' ' || e.key === 'Enter') {
                      setIsHoldingTalk(false)
                    }
                  }}
                  aria-label="Hold to talk button"
                  aria-pressed={isHoldingTalk}
                  style={{
                    width: '100%',
                    minHeight: 56,
                    borderRadius: 16,
                    border: 'none',
                    background: isHoldingTalk ? '#E5533D' : '#C96846',
                    color: '#F5F4F2',
                    fontSize: 17,
                    fontWeight: 700,
                    cursor: 'pointer',
                    boxShadow: isHoldingTalk ? '0 0 16px rgba(229, 83, 61, 0.8)' : 'none',
                    transform: isHoldingTalk ? 'scale(0.98)' : 'scale(1)',
                    transition: 'all 0.1s ease',
                    userSelect: 'none',
                    WebkitUserSelect: 'none',
                  }}
                >
                  {isHoldingTalk ? '🔴 Listening… (Release to stop)' : '🎙️ Hold to Talk'}
                </button>
                <div style={{ fontSize: 12, opacity: 0.6, marginTop: 6 }}>
                  Press &amp; hold to stream voice, release when finished speaking.
                </div>
              </div>
            )}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 12, marginBottom: 16, flexWrap: 'wrap' }}>
            <button
              onClick={handleSendFrame}
              aria-label="Send camera frame to Gemini"
              style={{
                background: '#E3B660',
                color: '#1B1B1B',
                border: 'none',
                borderRadius: 22,
                padding: '14px 24px',
                fontSize: 15,
                cursor: 'pointer',
                minHeight: 44,
                minWidth: 44,
                fontWeight: 600,
              }}
            >
              📷 Send Frame
            </button>
            <button
              onClick={handleStop}
              aria-label="Stop Gemini Live session"
              style={{
                background: '#E5533D',
                color: '#fff',
                border: 'none',
                borderRadius: 22,
                padding: '14px 24px',
                fontSize: 15,
                cursor: 'pointer',
                minHeight: 44,
                minWidth: 44,
                fontWeight: 600,
              }}
            >
              ■ Stop
            </button>
          </div>

          {/* Camera preview */}
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: '100%',
              maxWidth: 400,
              borderRadius: 12,
              background: '#333',
              marginBottom: 12,
            }}
          />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      )}

      {/* Captions grouped by turn */}
      <div
        aria-live="polite"
        style={{
          marginTop: 16,
          maxHeight: '40vh',
          overflowY: 'auto',
          padding: 12,
          borderRadius: 12,
          background: 'rgba(255,255,255,0.05)',
        }}
      >
        <h2 style={{ fontSize: 15, opacity: 0.6, marginBottom: 8 }}>Captions (Turn-by-turn)</h2>
        {captions.length === 0 && (
          <p style={{ opacity: 0.4, fontSize: 14 }}>Say something in Tamil or English…</p>
        )}
        {captions.map((c) => (
          <div
            key={c.id}
            style={{
              fontSize: 14,
              margin: '8px 0',
              padding: '8px 12px',
              borderRadius: 8,
              background:
                c.who === 'Gemini'
                  ? 'rgba(227, 182, 96, 0.1)'
                  : c.who === 'You'
                    ? 'rgba(211, 229, 224, 0.1)'
                    : 'rgba(255, 255, 255, 0.05)',
            }}
          >
            <div
              style={{
                fontWeight: 700,
                fontSize: 12,
                marginBottom: 2,
                color:
                  c.who === 'Gemini'
                    ? '#E3B660'
                    : c.who === 'You'
                      ? '#D3E5E0'
                      : '#C96846',
              }}
            >
              {c.who} {!c.isComplete && c.who !== 'System' && '•'}
            </div>
            <div style={{ lineHeight: 1.4, wordBreak: 'break-word' }}>
              {c.text || '…'}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
