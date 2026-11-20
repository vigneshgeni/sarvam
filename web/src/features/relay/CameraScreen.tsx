/**
 * CameraScreen — Full-screen Live Relay camera.
 *
 * Implements:
 * - Immediate mount on tap (never waits for Gemini before showing the camera)
 * - Reuses the MediaStream & AudioContext acquired inside the user's tap gesture
 * - <video> with playsInline, muted, autoPlay, and awaited play() with catch
 * - Full-screen camera with flip button (facingMode user & environment)
 * - Preview mirrored only on front camera; Gemini frames unmirrored
 * - Shutter with page stack (max 10, JPEG long edge 1600 px, in-memory)
 * - LiveSheet integration over camera with non-blocking connect
 * - Friendly, translated error card with "Try again" & "Back to Home" for every failure
 * - Stage logging via console.info('[relay] ...') for Safari Web Inspector
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { FirebaseLiveClient } from './live/FirebaseLiveClient.js'
import {
  LiveAudioManager,
  createOrResumeRelayAudioContext,
  requestRelayMediaStream,
} from './audio/LiveAudioManager.js'
import { stripSpeakerNotes } from './live/relayPrompt.js'
import {
  addPageToStack,
  calculateLongEdgeDimensions,
  type CapturedPage,
  MAX_PAGE_STACK_COUNT,
} from './pageStack.js'
import {
  classifyRelayError,
  createInitialRelayState,
  logRelayStage,
  transitionRelayState,
  type RelayErrorInfo,
  type RelaySessionState,
} from './relaySessionState.js'
import LiveSheet from './LiveSheet.js'
import type { CaptionTurn } from './RelaySpikeScreen.js'
import { getDictionary, resolveLang } from '../../i18n/index.js'

export interface RelayLaunchContext {
  audioCtx: AudioContext | null
  mediaPromise: Promise<MediaStream>
  facingMode: 'user' | 'environment'
}

interface CameraScreenProps {
  onClose: () => void
  onBack?: () => void
  lang?: string
  initialLaunch?: RelayLaunchContext | null
}

export default function CameraScreen({
  onClose,
  onBack,
  lang = 'en',
  initialLaunch = null,
}: CameraScreenProps) {
  const t = getDictionary(resolveLang(lang))

  // Camera state
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>(
    initialLaunch?.facingMode || 'environment',
  )
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraStarting, setCameraStarting] = useState(true)
  const [flash, setFlash] = useState(false)

  // Session stage & error state machine
  const [sessionState, setSessionState] = useState<RelaySessionState>(() =>
    transitionRelayState(createInitialRelayState(), { type: 'TAP' }),
  )
  const [relayError, setRelayError] = useState<RelayErrorInfo | null>(null)

  // Pages stack state
  const [pages, setPages] = useState<CapturedPage[]>([])

  // Live session state
  const [isLiveSheetOpen, setIsLiveSheetOpen] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isReconnecting, setIsReconnecting] = useState(false)
  const [isUsingFallback, setIsUsingFallback] = useState(false)
  const [fallbackModelName, setFallbackModelName] = useState<string>()
  const [captions, setCaptions] = useState<CaptionTurn[]>([])

  // Audio / Mic controls
  const [micMode, setMicMode] = useState<'vad' | 'hold'>('vad')
  const [isMuted, setIsMuted] = useState(false)
  const [isHoldingTalk, setIsHoldingTalk] = useState(false)

  // DOM & Manager refs
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const sharedAudioCtxRef = useRef<AudioContext | null>(initialLaunch?.audioCtx || null)
  const clientRef = useRef<FirebaseLiveClient | null>(null)
  const audioManagerRef = useRef<LiveAudioManager | null>(null)
  const fpsIntervalRef = useRef<number | null>(null)
  const isMountedRef = useRef(true)

  // Turn grouping tracking refs
  const activeInputTurnId = useRef<string | null>(null)
  const activeOutputTurnId = useRef<string | null>(null)
  const activeInputText = useRef<string>('')
  const activeOutputText = useRef<string>('')

  // Mic state refs for realtime callback
  const micModeRef = useRef<'vad' | 'hold'>('vad')
  const isMutedRef = useRef(false)
  const isHoldingTalkRef = useRef(false)

  useEffect(() => {
    micModeRef.current = micMode
  }, [micMode])

  useEffect(() => {
    isMutedRef.current = isMuted
    audioManagerRef.current?.setMuted(isMuted)
  }, [isMuted])

  useEffect(() => {
    isHoldingTalkRef.current = isHoldingTalk
  }, [isHoldingTalk])

  // ── Resource Cleanup (NEVER calls onClose — safe under StrictMode) ─

  const stopActiveStream = useCallback(() => {
    if (activeStreamRef.current) {
      activeStreamRef.current.getTracks().forEach((track) => track.stop())
      activeStreamRef.current = null
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
  }, [])

  const stopGeminiSession = useCallback(async () => {
    if (fpsIntervalRef.current) {
      window.clearInterval(fpsIntervalRef.current)
      fpsIntervalRef.current = null
    }
    if (clientRef.current) {
      const c = clientRef.current
      clientRef.current = null
      await c.close().catch(() => {})
    }
    if (audioManagerRef.current) {
      const am = audioManagerRef.current
      audioManagerRef.current = null
      await am.stop().catch(() => {})
    }
  }, [])

  const cleanupAllResources = useCallback(() => {
    void stopGeminiSession()
    stopActiveStream()
    if (sharedAudioCtxRef.current && sharedAudioCtxRef.current.state !== 'closed') {
      void sharedAudioCtxRef.current.close().catch(() => {})
      sharedAudioCtxRef.current = null
    }
  }, [stopActiveStream, stopGeminiSession])

  // ── Attach a MediaStream to <video> and wait for first frame ───────

  const attachStreamToVideo = useCallback(
    async (stream: MediaStream, isCancelled: () => boolean) => {
      if (isCancelled()) {
        return
      }

      stopActiveStream()
      activeStreamRef.current = stream
      logRelayStage('permission granted', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      })
      setSessionState((prev) => transitionRelayState(prev, { type: 'PERMISSION_GRANTED' }))

      const videoEl = videoRef.current
      if (!videoEl) {
        return
      }

      // Preview uses video-only MediaStream so local mic is never echoed through <video>
      const videoOnlyStream = new MediaStream(stream.getVideoTracks())
      videoEl.srcObject = videoOnlyStream
      logRelayStage('stream started')
      setSessionState((prev) => transitionRelayState(prev, { type: 'STREAM_STARTED' }))

      let firstFrameLogged = false
      const markFirstFrame = () => {
        if (firstFrameLogged || isCancelled()) return
        firstFrameLogged = true
        logRelayStage('first frame', {
          width: videoEl.videoWidth,
          height: videoEl.videoHeight,
        })
        setSessionState((prev) => transitionRelayState(prev, { type: 'FIRST_FRAME' }))
        setCameraReady(true)
        setCameraStarting(false)
      }

      videoEl.addEventListener('loadeddata', markFirstFrame, { once: true })
      videoEl.addEventListener('playing', markFirstFrame, { once: true })

      try {
        await videoEl.play()
        if (!isCancelled() && videoEl.readyState >= 2) {
          markFirstFrame()
        } else if (!isCancelled()) {
          // Video play resolved; mark ready as soon as metadata/frame arrives
          setCameraReady(true)
          setCameraStarting(false)
        }
      } catch (playErr: unknown) {
        if (isCancelled()) return
        const classified = classifyRelayError(playErr, 'camera')
        logRelayStage('error', { source: 'video-play', kind: classified.kind })
        setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
        setRelayError(classified)
        setCameraStarting(false)
      }
    },
    [stopActiveStream],
  )

  // ── Initial mount: consume the stream requested in the user's tap ──

  useEffect(() => {
    isMountedRef.current = true
    let cancelled = false

    const boot = async () => {
      setCameraStarting(true)
      setRelayError(null)
      try {
        const stream = initialLaunch
          ? await initialLaunch.mediaPromise
          : await requestRelayMediaStream(facingMode)
        if (cancelled) return
        await attachStreamToVideo(stream, () => cancelled)
      } catch (err: unknown) {
        if (cancelled) return
        const classified = classifyRelayError(err, 'camera')
        logRelayStage('error', { source: 'camera', kind: classified.kind })
        setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
        setRelayError(classified)
        setCameraReady(false)
        setCameraStarting(false)
      }
    }

    void boot()

    return () => {
      cancelled = true
      isMountedRef.current = false
      // Only stop tracks if this mount actually attached a stream (StrictMode-safe)
      if (activeStreamRef.current) {
        stopActiveStream()
      }
      void stopGeminiSession()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialLaunch])

  // Watch browser offline events while live
  useEffect(() => {
    const handleOffline = () => {
      if (isLive || isConnecting) {
        const classified = classifyRelayError(new Error('network offline'), 'gemini', false)
        logRelayStage('error', { source: 'network', kind: classified.kind })
        setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
        setRelayError(classified)
      }
    }
    window.addEventListener('offline', handleOffline)
    return () => window.removeEventListener('offline', handleOffline)
  }, [isLive, isConnecting])

  // Escape key returns to intro or Home cleanly
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        cleanupAllResources()
        if (onBack) {
          onBack()
        } else {
          onClose()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [cleanupAllResources, onBack, onClose])

  // ── User-gesture handlers (camera retry & flip) ────────────────────

  const startCameraInGesture = useCallback(
    async (facing: 'user' | 'environment') => {
      logRelayStage('tap', { action: 'camera', facing })
      sharedAudioCtxRef.current = createOrResumeRelayAudioContext(sharedAudioCtxRef.current)
      setRelayError(null)
      setCameraReady(false)
      setCameraStarting(true)
      stopActiveStream()

      try {
        // First await inside the user tap handler!
        const stream = await requestRelayMediaStream(facing)
        if (!isMountedRef.current) {
          stream.getTracks().forEach((tr) => tr.stop())
          return
        }
        await attachStreamToVideo(stream, () => !isMountedRef.current)
      } catch (err: unknown) {
        if (!isMountedRef.current) return
        const classified = classifyRelayError(err, 'camera')
        logRelayStage('error', { source: 'camera', kind: classified.kind })
        setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
        setRelayError(classified)
        setCameraReady(false)
        setCameraStarting(false)
      }
    },
    [attachStreamToVideo, stopActiveStream],
  )

  const handleFlipCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextFacing)
    void startCameraInGesture(nextFacing)
  }

  // ── Audio & LiveClient Lifecycle ───────────────────────────────────

  const initLiveClient = useCallback(async () => {
    if (clientRef.current) return clientRef.current

    // Ensure AudioContext is unlocked on this tap if not already
    sharedAudioCtxRef.current = createOrResumeRelayAudioContext(sharedAudioCtxRef.current)

    setIsConnecting(true)
    setRelayError(null)
    logRelayStage('Gemini connecting')
    setSessionState((prev) => transitionRelayState(prev, { type: 'GEMINI_CONNECTING' }))

    const client = new FirebaseLiveClient()
    const audioManager = new LiveAudioManager()

    try {
      // Forward mic audio respecting micMode & hold-to-talk
      await audioManager.start(
        (pcm) => {
          if (micModeRef.current === 'vad') {
            if (!isMutedRef.current) {
              client.sendAudio(pcm)
            }
          } else if (isHoldingTalkRef.current) {
            client.sendAudio(pcm)
          }
        },
        {
          audioCtx: sharedAudioCtxRef.current,
          audioStream: activeStreamRef.current,
        },
      )

      clientRef.current = client
      audioManagerRef.current = audioManager

      // Output audio
      client.onAudio = (pcm) => {
        setIsSpeaking(true)
        audioManager.playAudio(pcm)
      }

      // Interrupted
      client.onInterrupted = () => {
        audioManager.flush()
        setIsSpeaking(false)
        if (activeOutputTurnId.current) {
          const turnId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) =>
            prev.map((c) =>
              c.id === turnId ? { ...c, isComplete: true, text: c.text ? `${c.text} ⚡` : '⚡' } : c,
            ),
          )
        }
      }

      // Input captions (one row per turn, in-place update)
      client.onInputText = (text: string) => {
        if (activeOutputTurnId.current) {
          const prevId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) => prev.map((c) => (c.id === prevId ? { ...c, isComplete: true } : c)))
        }

        if (!activeInputTurnId.current) {
          const turnId = `you-${Date.now()}`
          activeInputTurnId.current = turnId
          activeInputText.current = text
          const cleaned = stripSpeakerNotes(activeInputText.current)
          setCaptions((prev) => [...prev.slice(-49), { id: turnId, who: 'You', text: cleaned }])
        } else {
          activeInputText.current += text
          const cleaned = stripSpeakerNotes(activeInputText.current)
          const turnId = activeInputTurnId.current
          setCaptions((prev) => prev.map((c) => (c.id === turnId ? { ...c, text: cleaned } : c)))
        }
      }

      // Output captions (one row per turn, in-place update)
      client.onOutputText = (text: string) => {
        setIsSpeaking(true)
        if (activeInputTurnId.current) {
          const prevId = activeInputTurnId.current
          activeInputTurnId.current = null
          activeInputText.current = ''
          setCaptions((prev) => prev.map((c) => (c.id === prevId ? { ...c, isComplete: true } : c)))
        }

        if (!activeOutputTurnId.current) {
          const turnId = `gemini-${Date.now()}`
          activeOutputTurnId.current = turnId
          activeOutputText.current = text
          const cleaned = stripSpeakerNotes(activeOutputText.current)
          setCaptions((prev) => [...prev.slice(-49), { id: turnId, who: 'Gemini', text: cleaned }])
        } else {
          activeOutputText.current += text
          const cleaned = stripSpeakerNotes(activeOutputText.current)
          const turnId = activeOutputTurnId.current
          setCaptions((prev) => prev.map((c) => (c.id === turnId ? { ...c, text: cleaned } : c)))
        }
      }

      client.onTurnComplete = () => {
        setIsSpeaking(false)
        if (activeOutputTurnId.current) {
          const turnId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) => prev.map((c) => (c.id === turnId ? { ...c, isComplete: true } : c)))
        }
        if (activeInputTurnId.current) {
          const turnId = activeInputTurnId.current
          activeInputTurnId.current = null
          activeInputText.current = ''
          setCaptions((prev) => prev.map((c) => (c.id === turnId ? { ...c, isComplete: true } : c)))
        }
      }

      client.onGenerationComplete = () => {
        setIsSpeaking(false)
        if (activeOutputTurnId.current) {
          const turnId = activeOutputTurnId.current
          activeOutputTurnId.current = null
          activeOutputText.current = ''
          setCaptions((prev) => prev.map((c) => (c.id === turnId ? { ...c, isComplete: true } : c)))
        }
      }

      client.onUsingFallback = (fbModel) => {
        setIsUsingFallback(true)
        setFallbackModelName(fbModel)
      }

      client.onReconnecting = () => {
        setIsReconnecting(true)
        setSessionState((prev) => transitionRelayState(prev, { type: 'RECONNECTING' }))
      }

      client.onReconnected = () => {
        setIsReconnecting(false)
      }

      client.onClose = (info) => {
        if (!info.wasClean && isMountedRef.current) {
          const classified = classifyRelayError(
            new Error(info.reason || `WebSocket closed (${info.code})`),
            'gemini',
          )
          logRelayStage('error', { source: 'gemini-close', kind: classified.kind, code: info.code })
          setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
          setRelayError(classified)
          setIsLive(false)
        }
      }

      await client.connect()
      const activeModel = client.getActiveModel()
      const usingFb = client.getIsUsingFallback()
      logRelayStage('connected')
      logRelayStage('model used', {
        model: activeModel,
        tier: usingFb ? 'fallback' : 'primary',
      })
      setSessionState((prev) =>
        transitionRelayState(prev, { type: 'CONNECTED', model: activeModel, isFallback: usingFb }),
      )
      setIsLive(true)
      setIsConnecting(false)
      setIsUsingFallback(usingFb)
      setFallbackModelName(activeModel)
      return client
    } catch (err: unknown) {
      setIsConnecting(false)
      setIsLive(false)
      clientRef.current = null
      audioManagerRef.current = null
      await client.close().catch(() => {})
      await audioManager.stop().catch(() => {})

      const classified = classifyRelayError(err, 'gemini')
      logRelayStage('error', { source: 'gemini', kind: classified.kind })
      setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
      setRelayError(classified)
      throw err
    }
  }, [])

  // ── Shutter & Page Capture ─────────────────────────────────────────

  const handleCapture = useCallback(() => {
    const video = videoRef.current
    if (!video || !cameraReady) return

    if (pages.length >= MAX_PAGE_STACK_COUNT) {
      return
    }

    // Trigger visual flash
    setFlash(true)
    setTimeout(() => setFlash(false), 350)

    const origWidth = video.videoWidth || 1280
    const origHeight = video.videoHeight || 720
    const { targetWidth, targetHeight } = calculateLongEdgeDimensions(origWidth, origHeight, 1600)

    const canvas = document.createElement('canvas')
    canvas.width = targetWidth
    canvas.height = targetHeight
    const ctx = canvas.getContext('2d')!

    // Draw unmirrored
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

    canvas.toBlob(
      (blob) => {
        if (!blob) return
        const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
        const newPage: CapturedPage = {
          id: `page-${Date.now()}-${pages.length + 1}`,
          blob,
          dataUrl,
          width: targetWidth,
          height: targetHeight,
          timestamp: Date.now(),
        }

        const res = addPageToStack(pages, newPage)
        if (res.accepted) {
          setPages(res.pages)
        }
      },
      'image/jpeg',
      0.85,
    )
  }, [cameraReady, pages])

  // ── Proceed & Live Video Streaming ─────────────────────────────────

  const startFpsVideoLoop = useCallback((client: FirebaseLiveClient) => {
    if (fpsIntervalRef.current) {
      window.clearInterval(fpsIntervalRef.current)
    }

    const streamCanvas = document.createElement('canvas')
    const ctx = streamCanvas.getContext('2d')!

    // 1 frame per second
    fpsIntervalRef.current = window.setInterval(() => {
      const video = videoRef.current
      if (!video || video.readyState < 2) return

      const origWidth = video.videoWidth || 640
      const origHeight = video.videoHeight || 480
      const { targetWidth, targetHeight } = calculateLongEdgeDimensions(origWidth, origHeight, 768)

      streamCanvas.width = targetWidth
      streamCanvas.height = targetHeight
      // Always send unmirrored
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

      streamCanvas.toBlob(
        (blob) => {
          if (!blob) return
          void blob.arrayBuffer().then((buf) => {
            client.sendFrame(buf)
          })
        },
        'image/jpeg',
        0.7,
      )
    }, 1000)
  }, [])

  const handleProceed = useCallback(async () => {
    setIsLiveSheetOpen(true)
    setRelayError(null)
    try {
      const client = await initLiveClient()

      // Send each pinned page as a still
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        const buf = await p.blob.arrayBuffer()
        client.sendFrame(buf)
        client.sendText(`Pinned page ${i + 1}`, true)
      }

      // Start 1 fps video streaming loop over the live camera
      startFpsVideoLoop(client)
    } catch {
      // Friendly error state already set and logged by initLiveClient
    }
  }, [initLiveClient, pages, startFpsVideoLoop])

  const handleRetryError = () => {
    if (relayError?.retryTarget === 'gemini') {
      void handleProceed()
    } else {
      void startCameraInGesture(facingMode)
    }
  }

  const handleCloseToHome = useCallback(() => {
    cleanupAllResources()
    onClose()
  }, [cleanupAllResources, onClose])

  const hasPages = pages.length > 0
  const isFront = facingMode === 'user'

  return (
    <div
      data-testid="relay-camera-screen"
      data-relay-stage={sessionState.stage}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 40,
        background: '#0E0E0E',
        color: '#F5F4F2',
        fontFamily: 'DM Sans, system-ui, sans-serif',
        overflow: 'hidden',
        display: 'flex',
        flexDirection: 'column',
      }}
    >
      {/* Video Viewport */}
      <video
        ref={videoRef}
        data-testid="relay-camera-video"
        playsInline
        muted
        autoPlay
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'cover',
          transform: isFront ? 'scaleX(-1)' : 'none',
        }}
      />
      <canvas ref={canvasRef} style={{ display: 'none' }} />

      {/* Shutter Flash Animation */}
      {flash && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 60,
            background: '#fff',
            opacity: 0.85,
            pointerEvents: 'none',
            animation: 'sv-flash 0.35s ease both',
          }}
        />
      )}

      {/* Frame Outline (Mustard guideline) */}
      <div
        style={{
          position: 'absolute',
          left: '10%',
          right: '10%',
          top: '16%',
          bottom: '24%',
          border: '2.5px solid #E3B660',
          borderRadius: 12,
          background: 'rgba(227,182,96,0.06)',
          pointerEvents: 'none',
          zIndex: 10,
        }}
      />

      {/* Top Header Bar */}
      <div
        style={{
          position: 'relative',
          zIndex: 20,
          flex: 'none',
          height: 64,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px',
          background: 'linear-gradient(to bottom, rgba(0,0,0,0.6) 0%, transparent 100%)',
        }}
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={handleCloseToHome}
          aria-label={t.relayCloseCamera}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            background: 'rgba(0,0,0,0.5)',
            border: 0,
            color: '#F5F4F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>

        {/* Hint Pill */}
        <span
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 7,
            height: 36,
            padding: '0 14px',
            borderRadius: 18,
            background: 'rgba(0,0,0,0.55)',
            fontSize: 13.5,
            fontWeight: 700,
          }}
        >
          <span style={{ width: 8, height: 8, borderRadius: 4, background: '#E3B660' }} />
          {cameraStarting && !relayError
            ? t.relayStartingCamera
            : hasPages
              ? `${pages.length} page${pages.length > 1 ? 's' : ''} · add more or ${t.relayProceed}`
              : t.relayHintFitPage}
        </span>

        {/* Flip Camera Button */}
        <button
          type="button"
          onClick={handleFlipCamera}
          aria-label={t.relayFlipCamera}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            border: 0,
            background: 'rgba(0,0,0,0.5)',
            color: '#F5F4F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg viewBox="0 0 24 24" width={22} height={22} fill="none" stroke="currentColor" strokeWidth={2.2}>
            <path d="M20 10c0-4.4-3.6-8-8-8s-8 3.6-8 8m0 4c0 4.4 3.6 8 8 8s8-3.6 8-8" strokeLinecap="round" />
            <path d="M4 6l-2 4 4 0M20 18l2-4-4 0" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      </div>

      {/* Friendly Translated Error Overlay (never blank, never silent) */}
      {relayError && (
        <div
          role="alert"
          data-testid="relay-error-card"
          data-error-kind={relayError.kind}
          style={{
            position: 'absolute',
            inset: 0,
            zIndex: 70,
            background: 'rgba(14, 14, 14, 0.88)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 24,
          }}
        >
          <div
            style={{
              width: '100%',
              maxWidth: 342,
              background: '#F4F3F1',
              color: '#1B1B1B',
              borderRadius: 24,
              border: '2px solid #1B1B1B',
              padding: 24,
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              boxShadow: '0 20px 44px rgba(0,0,0,0.45)',
            }}
          >
            <h2
              style={{
                margin: 0,
                fontFamily: 'Fraunces, Georgia, serif',
                fontSize: 22,
                lineHeight: 1.25,
                fontWeight: 600,
                color: '#1B1B1B',
              }}
            >
              {t[relayError.titleKey]}
            </h2>
            <p
              style={{
                margin: 0,
                fontSize: 15,
                lineHeight: 1.45,
                color: '#3D3B37',
              }}
            >
              {t[relayError.bodyKey]}
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginTop: 8 }}>
              <button
                type="button"
                data-testid="relay-error-retry"
                onClick={handleRetryError}
                style={{
                  width: '100%',
                  minHeight: 48,
                  borderRadius: 999,
                  border: '2px solid #1B1B1B',
                  background: '#E3B660',
                  color: '#1B1B1B',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.relayTryAgain}
              </button>
              <button
                type="button"
                data-testid="relay-error-home"
                onClick={handleCloseToHome}
                style={{
                  width: '100%',
                  minHeight: 48,
                  borderRadius: 999,
                  border: '2px solid #214D47',
                  background: 'transparent',
                  color: '#214D47',
                  fontSize: 16,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {t.backHome}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Spacer */}
      <div style={{ flex: 1 }} />

      {/* "Gemini is reading in background" badge */}
      {hasPages && (
        <div
          style={{
            position: 'relative',
            zIndex: 20,
            display: 'flex',
            justifyContent: 'center',
            paddingBottom: 12,
          }}
        >
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 8,
              height: 32,
              padding: '0 14px',
              borderRadius: 16,
              background: 'rgba(0,0,0,0.65)',
              fontSize: 13,
              fontWeight: 600,
            }}
          >
            <span
              style={{
                width: 14,
                height: 14,
                borderRadius: 7,
                border: '2.5px solid rgba(255,255,255,0.3)',
                borderTopColor: '#E3B660',
                animation: 'sv-spin 0.9s linear infinite',
              }}
            />
            Gemini is reading in the background
          </span>
        </div>
      )}

      {/* Bottom Control Bar */}
      <div
        style={{
          position: 'relative',
          zIndex: 20,
          flex: 'none',
          padding: '16px 20px calc(24px + env(safe-area-inset-bottom, 12px))',
          background: 'rgba(10, 10, 10, 0.8)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        {/* Left: Thumbnail stack (when hasPages) OR Mic toggle (when noPages) */}
        <div style={{ width: 92, display: 'flex', justifyContent: 'flex-start' }}>
          {hasPages ? (
            <div style={{ position: 'relative', width: 48, height: 60 }}>
              {pages.length > 1 && (
                <span
                  style={{
                    position: 'absolute',
                    left: 5,
                    top: -4,
                    width: 42,
                    height: 56,
                    borderRadius: 5,
                    background: '#D9D3C4',
                    transform: 'rotate(6deg)',
                  }}
                />
              )}
              <img
                src={pages[pages.length - 1].dataUrl}
                alt="Captured page thumbnail"
                style={{
                  position: 'absolute',
                  left: 0,
                  top: 0,
                  width: 44,
                  height: 58,
                  borderRadius: 5,
                  objectFit: 'cover',
                  border: '2px solid #F5F4F2',
                }}
              />
              <span
                style={{
                  position: 'absolute',
                  right: -8,
                  top: -8,
                  minWidth: 24,
                  height: 24,
                  padding: '0 6px',
                  borderRadius: 12,
                  background: '#C96846',
                  color: '#1B1B1B',
                  border: '2px solid #0E0E0E',
                  fontSize: 12,
                  fontWeight: 700,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                {pages.length}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              aria-pressed={isMuted}
              style={{
                width: 52,
                height: 52,
                borderRadius: 26,
                border: 0,
                background: isMuted ? '#F5F4F2' : 'rgba(255,255,255,0.16)',
                color: isMuted ? '#1B1B1B' : '#F5F4F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg viewBox="0 0 24 24" width={23} height={23} fill="none" stroke="currentColor" strokeWidth={1.9}>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                {isMuted && <path d="M4 4l16 16" />}
              </svg>
            </button>
          )}
        </div>

        {/* Center: Shutter Button */}
        <button
          type="button"
          data-testid="relay-shutter"
          onClick={handleCapture}
          disabled={!cameraReady || pages.length >= MAX_PAGE_STACK_COUNT}
          aria-label={t.relayCapturePage}
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            border: '4px solid #F5F4F2',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: !cameraReady || pages.length >= MAX_PAGE_STACK_COUNT ? 'not-allowed' : 'pointer',
            opacity: !cameraReady || pages.length >= MAX_PAGE_STACK_COUNT ? 0.4 : 1,
          }}
        >
          <span style={{ width: 60, height: 60, borderRadius: 30, background: '#F5F4F2' }} />
        </button>

        {/* Right: "End" (when noPages) OR "Proceed" (when hasPages) */}
        <div style={{ width: 92, display: 'flex', justifyContent: 'flex-end' }}>
          {hasPages ? (
            <button
              type="button"
              data-testid="relay-proceed"
              onClick={handleProceed}
              disabled={isConnecting}
              style={{
                height: 52,
                padding: '0 16px',
                borderRadius: 26,
                background: '#E3B660',
                color: '#1B1B1B',
                border: 0,
                display: 'flex',
                alignItems: 'center',
                gap: 6,
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {isConnecting ? t.relayStarting : t.relayProceed}
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.6}>
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              data-testid="relay-end"
              onClick={handleCloseToHome}
              style={{
                height: 52,
                padding: '0 18px',
                borderRadius: 26,
                background: 'rgba(255,255,255,0.14)',
                color: '#F5F4F2',
                border: 0,
                display: 'flex',
                alignItems: 'center',
                fontSize: 15,
                fontWeight: 700,
                cursor: 'pointer',
              }}
            >
              {t.relayEnd}
            </button>
          )}
        </div>
      </div>

      {/* LiveSheet Over Camera */}
      <LiveSheet
        isOpen={isLiveSheetOpen && !relayError}
        isLive={isLive}
        isSpeaking={isSpeaking}
        isReconnecting={isReconnecting}
        isUsingFallback={isUsingFallback}
        fallbackModelName={fallbackModelName}
        captions={captions}
        onSendText={(text) => {
          clientRef.current?.sendText(text, true)
        }}
        onEnd={handleCloseToHome}
        onToggleMic={() => setIsMuted((m) => !m)}
        onToggleMicMode={() => setMicMode((m) => (m === 'vad' ? 'hold' : 'vad'))}
        isMuted={isMuted}
        micMode={micMode}
        isHoldingTalk={isHoldingTalk}
        onHoldTalkStart={() => setIsHoldingTalk(true)}
        onHoldTalkEnd={() => setIsHoldingTalk(false)}
      />
    </div>
  )
}
