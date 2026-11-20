/**
 * CameraScreen — Live Relay camera with P1.5 Live video mode & Scan pages mode.
 *
 * Implements:
 * - Two-mode switch pill: "Live video" (default) and "Scan pages" (existing flow),
 *   persisted in localStorage; switching modes NEVER ends the camera stream
 * - Live video mode: connects Gemini immediately using the pre-unlocked AudioContext
 *   and pre-granted camera+mic MediaStream from the "Start scanning" tap
 * - 1 fps / 768 px JPEG (~0.6) stream via FrameCadenceController; pauses on hidden tab,
 *   Pause video button, socket disconnect, or Scan pages mode; resumes automatically
 * - Continuous 16 kHz mic VAD + Hold-to-Talk option; 24 kHz Gemini playback with barge-in flush
 * - Corner Gemini orb (listening / thinking / speaking), status pill (Connecting / Live /
 *   Reconnecting), last 2 caption lines over video (tap to open LiveSheet transcript)
 * - Buttons: Mic mute, VAD/Hold toggle, Pause video, Flip camera, Freeze and ask, End
 * - 10-minute idle cost guard with "Still there?" 30 s auto-end prompt
 * - End and save persists session to IndexedDB Recent (respecting Save results setting)
 * - Desktop (>600 px) centered 430 px phone column over dark teal surround
 * - Friendly translated error card with "Try again" & "Back to Home" for every failure
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { FirebaseLiveClient } from './live/FirebaseLiveClient.js'
import {
  LiveAudioManager,
  createOrResumeRelayAudioContext,
  requestRelayMediaStream,
} from './audio/LiveAudioManager.js'
import {
  buildLiveVideoSystemPrompt,
  buildSoloSystemPrompt,
} from './live/relayPrompt.js'
import type { RelayLanguage } from './live/LiveClient.js'
import {
  addPageToStack,
  calculateLongEdgeDimensions,
  removePageFromStack,
  type CapturedPage,
  MAX_PAGE_STACK_COUNT,
} from './pageStack.js'
import {
  sanitizeCaption,
  shouldDropInputDuringPlayback,
} from './captionSanitizer.js'
import type { SheetDetent } from './sheetDetents.js'
import PageViewer from './PageViewer.js'
import { pushBrowserHistory } from '../../utils/history.js'
import {
  classifyRelayError,
  createInitialRelayState,
  logRelayStage,
  transitionRelayState,
  type RelayErrorInfo,
  type RelaySessionState,
} from './relaySessionState.js'
import {
  FrameCadenceController,
  IdleGuardController,
  LIVE_FRAME_JPEG_QUALITY,
  LIVE_FRAME_MAX_EDGE_PX,
  deriveGeminiOrbState,
  loadSavedRelayMode,
  releaseRelayResources,
  saveRelayMode,
  type RelayCameraMode,
} from './liveVideoController.js'
import LiveSheet from './LiveSheet.js'
import type { CaptionTurn } from './RelaySpikeScreen.js'
import { getDictionary, resolveLang } from '../../i18n/index.js'
import { isSaveRecentEnabled, saveRecentResult } from '../../utils/db.js'
import type { ExplainResponse } from '../../types.js'
import './cameraScreen.css'

export interface RelayLaunchContext {
  audioCtx: AudioContext | null
  mediaPromise: Promise<MediaStream>
  facingMode: 'user' | 'environment'
}

interface CameraScreenProps {
  onClose: () => void
  onBack?: () => void
  onSessionSaved?: () => Promise<void> | void
  lang?: string
  initialLaunch?: RelayLaunchContext | null
}

function toRelayLanguage(lang: string): RelayLanguage {
  const resolved = resolveLang(lang)
  if (resolved === 'en') return 'en'
  if (resolved === 'ta') return 'ta'
  return 'auto'
}

export default function CameraScreen({
  onClose,
  onBack,
  onSessionSaved,
  lang = 'en',
  initialLaunch = null,
}: CameraScreenProps) {
  const resolvedLang = resolveLang(lang)
  const t = getDictionary(resolvedLang)

  // Mode switch state ("live" = default Live video, "scan" = Scan pages)
  const [mode, setMode] = useState<RelayCameraMode>(() => loadSavedRelayMode())
  const [videoPaused, setVideoPaused] = useState(false)
  const [tabHidden, setTabHidden] = useState<boolean>(() =>
    typeof document !== 'undefined' ? document.hidden : false,
  )
  const [framesSent, setFramesSent] = useState(0)

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

  // Idle cost-guard state
  const [idlePromptOpen, setIdlePromptOpen] = useState(false)

  // Pages stack & viewer state
  const [pages, setPages] = useState<CapturedPage[]>([])
  const [selectedPageId, setSelectedPageId] = useState<string | null>(null)
  const [viewerIndex, setViewerIndex] = useState<number | null>(null)
  const [toastMsg, setToastMsg] = useState<string | null>(null)

  // Live session & sheet state
  const [isLiveSheetOpen, setIsLiveSheetOpen] = useState(false)
  const [sheetDetent, setSheetDetent] = useState<SheetDetent>('half')
  const [showSoundBanner, setShowSoundBanner] = useState(false)
  const [isConnecting, setIsConnecting] = useState(false)
  const [isLive, setIsLive] = useState(false)
  const [isSpeaking, setIsSpeaking] = useState(false)
  const [isThinking, setIsThinking] = useState(false)
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
  const streamCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const sharedAudioCtxRef = useRef<AudioContext | null>(initialLaunch?.audioCtx || null)
  const clientRef = useRef<FirebaseLiveClient | null>(null)
  const audioManagerRef = useRef<LiveAudioManager | null>(null)
  const cadenceRef = useRef<FrameCadenceController | null>(null)
  const idleGuardRef = useRef<IdleGuardController | null>(null)
  const isMountedRef = useRef(true)
  const autoConnectAttemptedRef = useRef(false)
  const endingRef = useRef(false)

  // Latest values for callbacks & closures
  const modeRef = useRef<RelayCameraMode>(mode)
  const isLiveSheetOpenRef = useRef(isLiveSheetOpen)
  const captionsRef = useRef<CaptionTurn[]>(captions)
  const pagesRef = useRef<CapturedPage[]>(pages)
  const viewerIndexRef = useRef<number | null>(viewerIndex)
  const isPlayingAudioRef = useRef(false)
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const micModeRef = useRef<'vad' | 'hold'>('vad')
  const isMutedRef = useRef(false)
  const isHoldingTalkRef = useRef(false)

  // Turn grouping tracking refs
  const activeInputTurnId = useRef<string | null>(null)
  const activeOutputTurnId = useRef<string | null>(null)
  const activeInputText = useRef<string>('')
  const activeOutputText = useRef<string>('')

  const showToast = useCallback((msg: string) => {
    setToastMsg(msg)
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current)
    toastTimerRef.current = setTimeout(() => {
      if (isMountedRef.current) setToastMsg(null)
    }, 2400)
  }, [])

  useEffect(() => {
    viewerIndexRef.current = viewerIndex
  }, [viewerIndex])

  useEffect(() => {
    modeRef.current = mode
  }, [mode])

  useEffect(() => {
    isLiveSheetOpenRef.current = isLiveSheetOpen
  }, [isLiveSheetOpen])

  useEffect(() => {
    captionsRef.current = captions
  }, [captions])

  useEffect(() => {
    pagesRef.current = pages
  }, [pages])

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
    cadenceRef.current?.stop()
    idleGuardRef.current?.stop()
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

  const cleanupAllResources = useCallback(async () => {
    const streams = [
      activeStreamRef.current,
      videoRef.current?.srcObject as MediaStream | null | undefined,
    ]
    const client = clientRef.current
    const audioMgr = audioManagerRef.current
    const ctx = sharedAudioCtxRef.current

    clientRef.current = null
    audioManagerRef.current = null
    activeStreamRef.current = null
    sharedAudioCtxRef.current = null
    if (videoRef.current) {
      videoRef.current.srcObject = null
    }

    await releaseRelayResources({
      stopFrames: () => cadenceRef.current?.stop(),
      stopIdleGuard: () => idleGuardRef.current?.stop(),
      closeClient: () => client?.close(),
      stopAudio: () => audioMgr?.stop(),
      streams,
      closeAudioCtx: () => (ctx && ctx.state !== 'closed' ? ctx.close() : undefined),
    })
  }, [])

  // ── Save Session to IndexedDB Recent (End and save) ────────────────

  const saveSessionToRecent = useCallback(async () => {
    if (!isSaveRecentEnabled()) return
    const currentCaptions = captionsRef.current
    const currentPages = pagesRef.current

    const summaryLines =
      currentCaptions.length > 0
        ? currentCaptions
            .slice(-6)
            .map((c) => `${c.who}: ${c.text}`.trim())
            .filter(Boolean)
        : [t.relayModeLive]

    const firstUserTurn = currentCaptions.find((c) => c.who === 'You' && c.text.trim())
    const sessionTitle = firstUserTurn
      ? firstUserTurn.text.trim().slice(0, 60)
      : t.relaySessionTitle

    const syntheticResult: ExplainResponse = {
      doc_type: 'other',
      document_kind: 'live_relay',
      title: sessionTitle,
      report_title: null,
      report_date: null,
      letter_date: null,
      language: resolvedLang,
      summary: summaryLines,
      actions: [],
      warnings: [],
      facts: [],
      conflicts: [],
      evidence_summary: { matched: 0, check_original: 0, calculated: 0 },
      unreadable: false,
      unreadable_reason: null,
      protected_terms: [],
    }

    try {
      await saveRecentResult({
        id: `relay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        title: sessionTitle,
        fileCount: Math.max(currentPages.length, 1),
        fileNames:
          currentPages.length > 0
            ? currentPages.map((_, i) => `Pinned page ${i + 1}`)
            : [t.relayModeLive],
        lang: resolvedLang,
        result: syntheticResult,
      })
      await onSessionSaved?.()
    } catch {
      // Never block End navigation on storage error
    }
  }, [onSessionSaved, resolvedLang, t.relayModeLive, t.relaySessionTitle])

  const handleEndAndSave = useCallback(async () => {
    if (endingRef.current) return
    endingRef.current = true
    setIdlePromptOpen(false)
    await cleanupAllResources()
    await saveSessionToRecent()
    onClose()
  }, [cleanupAllResources, onClose, saveSessionToRecent])

  const handleCloseWithoutSave = useCallback(() => {
    if (endingRef.current) return
    endingRef.current = true
    setIdlePromptOpen(false)
    void cleanupAllResources()
    onClose()
  }, [cleanupAllResources, onClose])

  // ── 1 fps Live Video Frame Sender (768 px, JPEG ~0.6) ──────────────

  const sendLiveVideoFrame = useCallback(() => {
    const video = videoRef.current
    const client = clientRef.current
    if (!video || !client || !client.isConnected() || video.readyState < 2) return

    const origWidth = video.videoWidth || 640
    const origHeight = video.videoHeight || 480
    const { targetWidth, targetHeight } = calculateLongEdgeDimensions(
      origWidth,
      origHeight,
      LIVE_FRAME_MAX_EDGE_PX,
    )

    if (!streamCanvasRef.current) {
      streamCanvasRef.current = document.createElement('canvas')
    }
    const streamCanvas = streamCanvasRef.current
    streamCanvas.width = targetWidth
    streamCanvas.height = targetHeight
    const ctx = streamCanvas.getContext('2d')
    if (!ctx) return

    // Always draw unmirrored for Gemini
    ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

    streamCanvas.toBlob(
      (blob) => {
        if (!blob || !clientRef.current?.isConnected()) return
        void blob.arrayBuffer().then((buf) => {
          if (!clientRef.current?.isConnected()) return
          clientRef.current.sendVideo(buf)
          setFramesSent((prev) => {
            const next = prev + 1
            if (typeof window !== 'undefined') {
              ;(window as unknown as { __relayFramesSent?: number }).__relayFramesSent = next
            }
            return next
          })
        })
      },
      'image/jpeg',
      LIVE_FRAME_JPEG_QUALITY,
    )
  }, [])

  // Initialize FrameCadenceController once and keep flags synchronized
  useEffect(() => {
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __relayFramesSent?: number }).__relayFramesSent = 0
    }
    const controller = new FrameCadenceController(() => {
      sendLiveVideoFrame()
    })
    cadenceRef.current = controller
    return () => {
      controller.stop()
      cadenceRef.current = null
    }
  }, [sendLiveVideoFrame])

  useEffect(() => {
    cadenceRef.current?.update({
      mode,
      videoPaused,
      tabHidden,
      socketConnected: isLive && !isReconnecting,
      videoReady: cameraReady,
    })
  }, [mode, videoPaused, tabHidden, isLive, isReconnecting, cameraReady])

  // Pause video frames when browser tab is hidden; resume frames and AudioContext on return
  useEffect(() => {
    const onVisChange = () => {
      const hidden = document.hidden
      setTabHidden(hidden)
      if (!hidden) {
        const ctx = sharedAudioCtxRef.current || audioManagerRef.current?.getAudioContext()
        if (ctx && ctx.state === 'suspended') {
          void ctx.resume().then(() => {
            if (isMountedRef.current && ctx.state === 'running') {
              setShowSoundBanner(false)
            }
          }).catch(() => {})
        }
      }
    }
    document.addEventListener('visibilitychange', onVisChange)
    return () => document.removeEventListener('visibilitychange', onVisChange)
  }, [])

  // Resume AudioContext on first user touch/pointer gesture on CameraScreen (iOS Safari safety)
  useEffect(() => {
    const onFirstGesture = () => {
      const ctx = sharedAudioCtxRef.current || audioManagerRef.current?.getAudioContext()
      if (ctx && ctx.state === 'suspended') {
        void ctx.resume().then(() => {
          if (isMountedRef.current && ctx.state === 'running') {
            setShowSoundBanner(false)
          }
        }).catch(() => {})
      }
    }
    window.addEventListener('pointerdown', onFirstGesture, { passive: true })
    return () => window.removeEventListener('pointerdown', onFirstGesture)
  }, [])

  // 2 seconds after Live connects, if AudioContext is not running, show "Tap to turn on sound" banner
  useEffect(() => {
    if (!isLive) return
    const timer = setTimeout(() => {
      if (!isMountedRef.current) return
      const state = audioManagerRef.current?.getContextState() ?? sharedAudioCtxRef.current?.state ?? null
      if (state && state !== 'running') {
        console.info('[relay-audio] context not running 2s after connect', { state })
        setShowSoundBanner(true)
      }
    }, 2000)
    return () => clearTimeout(timer)
  }, [isLive])

  // Browser back gesture closes PageViewer first before leaving CameraScreen
  useEffect(() => {
    const onPopState = (event: PopStateEvent) => {
      const st = event.state as { screen?: string; overlay?: string | null } | null
      if (viewerIndexRef.current !== null && st?.overlay !== 'relay_page_viewer') {
        setViewerIndex(null)
      }
    }
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  // Idle cost guard (10 min no speech -> "Still there?" -> 30 s auto-end)
  useEffect(() => {
    const guard = new IdleGuardController({
      onPrompt: () => {
        if (isMountedRef.current) setIdlePromptOpen(true)
      },
      onAutoEnd: () => {
        if (isMountedRef.current) void handleEndAndSave()
      },
    })
    idleGuardRef.current = guard
    return () => {
      guard.stop()
      idleGuardRef.current = null
    }
  }, [handleEndAndSave])

  useEffect(() => {
    if (isLive && mode === 'live') {
      idleGuardRef.current?.start()
    } else {
      idleGuardRef.current?.stop()
      setIdlePromptOpen(false)
    }
  }, [isLive, mode])

  // ── Attach a MediaStream to <video> and wait for first frame ───────

  const attachStreamToVideo = useCallback(
    async (stream: MediaStream, isCancelled: () => boolean) => {
      if (isCancelled()) return

      stopActiveStream()
      activeStreamRef.current = stream
      logRelayStage('permission granted', {
        videoTracks: stream.getVideoTracks().length,
        audioTracks: stream.getAudioTracks().length,
      })
      setSessionState((prev) => transitionRelayState(prev, { type: 'PERMISSION_GRANTED' }))

      const videoEl = videoRef.current
      if (!videoEl) return

      // Preview uses video-only MediaStream so local mic never echoes through <video>
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
    endingRef.current = false
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
        setIsLive(false)
      }
    }
    window.addEventListener('offline', handleOffline)
    return () => window.removeEventListener('offline', handleOffline)
  }, [isLive, isConnecting])

  // Escape key closes viewer first, collapses sheet if expanded, else returns to intro/Home
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (viewerIndexRef.current !== null) {
          return
        }
        e.preventDefault()
        void cleanupAllResources()
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

  const handleEnableSound = useCallback(async () => {
    const state = audioManagerRef.current
      ? await audioManagerRef.current.resumeContext()
      : sharedAudioCtxRef.current
        ? await sharedAudioCtxRef.current.resume().then(() => sharedAudioCtxRef.current?.state ?? null).catch(() => null)
        : null
    if (state === 'running' && isMountedRef.current) {
      setShowSoundBanner(false)
    }
  }, [])

  /** Helper to create a small JPEG thumbnail (~512 px) from a CapturedPage for reconnect context. */
  const pageToSmallThumbnailBuffer = useCallback(async (page: CapturedPage): Promise<ArrayBuffer> => {
    try {
      const img = new Image()
      img.src = page.dataUrl
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve()
        img.onerror = () => reject(new Error('thumbnail load failed'))
      })
      const { targetWidth, targetHeight } = calculateLongEdgeDimensions(img.naturalWidth || page.width, img.naturalHeight || page.height, 512)
      const c = document.createElement('canvas')
      c.width = targetWidth
      c.height = targetHeight
      const ctx = c.getContext('2d')
      if (!ctx) return await page.blob.arrayBuffer()
      ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
      const smallBlob = await new Promise<Blob | null>((resolve) => c.toBlob(resolve, 'image/jpeg', 0.65))
      if (smallBlob) return await smallBlob.arrayBuffer()
    } catch {
      // Fallback to original blob
    }
    return await page.blob.arrayBuffer()
  }, [])

  // ── Audio & LiveClient Lifecycle ───────────────────────────────────

  const initLiveClient = useCallback(
    async (forMode: RelayCameraMode) => {
      if (clientRef.current?.isConnected()) return clientRef.current

      // Reuse the single AudioContext unlocked in the "Start scanning" tap (never create a new one if open)
      if (!sharedAudioCtxRef.current || sharedAudioCtxRef.current.state === 'closed') {
        sharedAudioCtxRef.current = createOrResumeRelayAudioContext(sharedAudioCtxRef.current)
      } else if (sharedAudioCtxRef.current.state === 'suspended') {
        void sharedAudioCtxRef.current.resume().catch(() => {})
      }

      setIsConnecting(true)
      setIsThinking(true)
      setRelayError(null)
      logRelayStage('Gemini connecting', { mode: forMode })
      setSessionState((prev) => transitionRelayState(prev, { type: 'GEMINI_CONNECTING' }))

      const client = new FirebaseLiveClient()
      const audioManager = new LiveAudioManager()

      try {
        // Start & connect the 24 kHz playback worklet BEFORE connecting the Live session
        await audioManager.start(
          (pcm) => {
            // In Scan mode, only stream mic while LiveSheet is open
            if (modeRef.current === 'scan' && !isLiveSheetOpenRef.current) {
              return
            }
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
            onPlaybackStateChange: (playing) => {
              isPlayingAudioRef.current = playing
              if (isMountedRef.current) {
                setIsSpeaking(playing)
                if (playing) setShowSoundBanner(false)
              }
            },
            onPlaybackStalled: () => {
              if (isMountedRef.current) {
                setShowSoundBanner(true)
              }
            },
          },
        )

        clientRef.current = client
        audioManagerRef.current = audioManager

        // Output audio (24 kHz) — speaking indicator follows actual playback from worklet
        client.onAudio = (pcm) => {
          idleGuardRef.current?.recordActivity()
          setIsThinking(false)
          audioManager.playAudio(pcm)
        }

        // Interrupted (barge-in flush — never appends emoji)
        client.onInterrupted = () => {
          audioManager.flush()
          isPlayingAudioRef.current = false
          setIsSpeaking(false)
          setIsThinking(false)
          if (activeOutputTurnId.current) {
            const turnId = activeOutputTurnId.current
            activeOutputTurnId.current = null
            activeOutputText.current = ''
            setCaptions((prev) =>
              prev.map((c) => (c.id === turnId ? { ...c, isComplete: true } : c)),
            )
          }
        }

        // Input captions (sanitized, dropped if noise or echo during playback)
        client.onInputText = (text: string) => {
          const candidate = activeInputTurnId.current ? activeInputText.current + text : text
          if (shouldDropInputDuringPlayback(candidate, isPlayingAudioRef.current)) {
            return
          }
          const cleaned = sanitizeCaption(candidate, 'input')
          if (!cleaned) return

          idleGuardRef.current?.recordActivity()
          setIdlePromptOpen(false)
          setIsThinking(true)
          if (activeOutputTurnId.current) {
            const prevId = activeOutputTurnId.current
            activeOutputTurnId.current = null
            activeOutputText.current = ''
            setCaptions((prev) => prev.map((c) => (c.id === prevId ? { ...c, isComplete: true } : c)))
          }

          if (!activeInputTurnId.current) {
            const turnId = `you-${Date.now()}`
            activeInputTurnId.current = turnId
            activeInputText.current = candidate
            setCaptions((prev) => [...prev.slice(-49), { id: turnId, who: 'You', text: cleaned }])
          } else {
            activeInputText.current = candidate
            const turnId = activeInputTurnId.current
            setCaptions((prev) => prev.map((c) => (c.id === turnId ? { ...c, text: cleaned } : c)))
          }
        }

        // Output captions (sanitized, one row per turn)
        client.onOutputText = (text: string) => {
          const candidate = activeOutputTurnId.current ? activeOutputText.current + text : text
          const cleaned = sanitizeCaption(candidate, 'output')
          if (!cleaned) return

          idleGuardRef.current?.recordActivity()
          setIsThinking(false)
          if (activeInputTurnId.current) {
            const prevId = activeInputTurnId.current
            activeInputTurnId.current = null
            activeInputText.current = ''
            setCaptions((prev) => prev.map((c) => (c.id === prevId ? { ...c, isComplete: true } : c)))
          }

          if (!activeOutputTurnId.current) {
            const turnId = `gemini-${Date.now()}`
            activeOutputTurnId.current = turnId
            activeOutputText.current = candidate
            setCaptions((prev) => [...prev.slice(-49), { id: turnId, who: 'Gemini', text: cleaned }])
          } else {
            activeOutputText.current = candidate
            const turnId = activeOutputTurnId.current
            setCaptions((prev) => prev.map((c) => (c.id === turnId ? { ...c, text: cleaned } : c)))
          }
        }

        client.onTurnComplete = () => {
          setIsThinking(false)
          if (!isPlayingAudioRef.current) {
            setIsSpeaking(false)
          }
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
          setIsThinking(false)
          if (!isPlayingAudioRef.current) {
            setIsSpeaking(false)
          }
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
          setIsLive(true)
          void audioManager.resumeContext()
          // Re-send existing pages as small thumbnails only when session reconnects
          const currentPages = pagesRef.current
          if (currentPages.length > 0) {
            void (async () => {
              for (let i = 0; i < currentPages.length; i++) {
                if (!clientRef.current?.isConnected()) break
                const thumbBuf = await pageToSmallThumbnailBuffer(currentPages[i])
                if (!clientRef.current?.isConnected()) break
                clientRef.current.sendVideo(thumbBuf)
                clientRef.current.sendText(`(Context page ${i + 1})`, false)
              }
            })()
          }
        }

        client.onClose = (info) => {
          if (!info.wasClean && !endingRef.current && isMountedRef.current) {
            const classified = classifyRelayError(
              new Error(info.reason || `WebSocket closed (${info.code})`),
              'gemini',
            )
            logRelayStage('error', { source: 'gemini-close', kind: classified.kind, code: info.code })
            setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
            setRelayError(classified)
            setIsLive(false)
            setIsThinking(false)
            setIsSpeaking(false)
          }
        }

        const relayLang = toRelayLanguage(lang)
        const systemInstruction =
          forMode === 'live'
            ? buildLiveVideoSystemPrompt(relayLang)
            : buildSoloSystemPrompt(relayLang)

        await client.connect({ language: relayLang, systemInstruction })
        if (!isMountedRef.current || endingRef.current) {
          await client.close().catch(() => {})
          await audioManager.stop().catch(() => {})
          return client
        }

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
        setIsThinking(false)
        setIsUsingFallback(usingFb)
        setFallbackModelName(activeModel)
        return client
      } catch (err: unknown) {
        setIsConnecting(false)
        setIsLive(false)
        setIsThinking(false)
        setIsSpeaking(false)
        clientRef.current = null
        audioManagerRef.current = null
        await client.close().catch(() => {})
        await audioManager.stop().catch(() => {})

        if (!isMountedRef.current || endingRef.current) {
          throw err
        }

        const classified = classifyRelayError(err, 'gemini')
        logRelayStage('error', { source: 'gemini', kind: classified.kind })
        setSessionState((prev) => transitionRelayState(prev, { type: 'ERROR', error: classified }))
        setRelayError(classified)
        throw err
      }
    },
    [lang, pageToSmallThumbnailBuffer],
  )

  // Auto-connect Gemini immediately when entering Live video mode with camera ready
  useEffect(() => {
    if (
      mode === 'live' &&
      cameraReady &&
      !isLive &&
      !isConnecting &&
      !relayError &&
      !autoConnectAttemptedRef.current
    ) {
      autoConnectAttemptedRef.current = true
      void initLiveClient('live').catch(() => {
        // Handled visibly via relayError card
      })
    }
  }, [mode, cameraReady, isLive, isConnecting, relayError, initLiveClient])

  // ── Mode Switching (NEVER ends the camera stream) ──────────────────

  const handleSelectMode = (nextMode: RelayCameraMode) => {
    if (nextMode === mode) return
    saveRelayMode(nextMode)
    setMode(nextMode)
    if (nextMode === 'live') {
      setIsLiveSheetOpen(false)
      if (!clientRef.current?.isConnected() && !isConnecting && !relayError && cameraReady) {
        autoConnectAttemptedRef.current = true
        void initLiveClient('live').catch(() => {})
      }
    }
  }

  // ── Shared Full-Resolution Page Capture (Shutter + Freeze and ask + Add page) ─

  const captureCurrentPage = useCallback(
    (onCaptured?: (page: CapturedPage, pageNumber: number) => void) => {
      const video = videoRef.current
      if (!video || !cameraReady) return
      if (pagesRef.current.length >= MAX_PAGE_STACK_COUNT) {
        showToast(t.relayMaxPagesReached || 'Maximum 10 pages reached')
        return
      }

      setFlash(true)
      setTimeout(() => setFlash(false), 350)

      const origWidth = video.videoWidth || 1280
      const origHeight = video.videoHeight || 720
      const { targetWidth, targetHeight } = calculateLongEdgeDimensions(origWidth, origHeight, 1600)

      const canvas = document.createElement('canvas')
      canvas.width = targetWidth
      canvas.height = targetHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(video, 0, 0, targetWidth, targetHeight)

      canvas.toBlob(
        (blob) => {
          if (!blob) return
          const dataUrl = canvas.toDataURL('image/jpeg', 0.85)
          const nextNumber = pagesRef.current.length + 1
          const newPage: CapturedPage = {
            id: `page-${Date.now()}-${nextNumber}`,
            blob,
            dataUrl,
            width: targetWidth,
            height: targetHeight,
            timestamp: Date.now(),
          }

          const res = addPageToStack(pagesRef.current, newPage)
          if (res.accepted) {
            setPages(res.pages)
            setSelectedPageId(newPage.id)
            onCaptured?.(newPage, res.pages.length)
          } else {
            showToast(t.relayMaxPagesReached || 'Maximum 10 pages reached')
          }
        },
        'image/jpeg',
        0.85,
      )
    },
    [cameraReady, showToast, t.relayMaxPagesReached],
  )

  const handleCapture = useCallback(() => {
    captureCurrentPage((page, pageNum) => {
      // If Gemini is already connected in Scan mode (e.g. sheet collapsed), send the new page directly
      if (clientRef.current?.isConnected()) {
        setIsThinking(true)
        void page.blob.arrayBuffer().then((buf) => {
          if (!clientRef.current?.isConnected()) return
          clientRef.current.sendVideo(buf)
          clientRef.current.sendText(`(Added page ${pageNum})`, true)
        })
        showToast((t.relayPageAdded || 'Page {n} added').replace('{n}', String(pageNum)))
      }
    })
  }, [captureCurrentPage, showToast, t.relayPageAdded])

  const handleFreezeAndAsk = useCallback(() => {
    idleGuardRef.current?.recordActivity()
    const prevDetent = sheetDetent
    if (isLiveSheetOpen && sheetDetent !== 'collapsed') {
      setSheetDetent('collapsed')
    }
    captureCurrentPage((page, pageNum) => {
      showToast((t.relayPageAdded || 'Page {n} added').replace('{n}', String(pageNum)))
      const client = clientRef.current
      if (client?.isConnected()) {
        setIsThinking(true)
        void page.blob.arrayBuffer().then((buf) => {
          if (!clientRef.current?.isConnected()) return
          clientRef.current.sendVideo(buf)
          clientRef.current.sendText(`(Added page ${pageNum})`, true)
        })
      }
      if (isLiveSheetOpen && prevDetent !== 'collapsed') {
        setSheetDetent(prevDetent)
      }
    })
  }, [captureCurrentPage, isLiveSheetOpen, sheetDetent, showToast, t.relayPageAdded])

  const handleAddPageFromSheet = useCallback(() => {
    if (pagesRef.current.length >= MAX_PAGE_STACK_COUNT) {
      showToast(t.relayMaxPagesReached || 'Maximum 10 pages reached')
      return
    }
    const prevDetent = sheetDetent
    setSheetDetent('collapsed')
    // Wait briefly for collapse animation frame, then capture full-resolution still & return
    setTimeout(() => {
      if (!isMountedRef.current) return
      captureCurrentPage((page, pageNum) => {
        showToast((t.relayPageAdded || 'Page {n} added').replace('{n}', String(pageNum)))
        if (clientRef.current?.isConnected()) {
          setIsThinking(true)
          void page.blob.arrayBuffer().then((buf) => {
            if (!clientRef.current?.isConnected()) return
            clientRef.current.sendVideo(buf)
            clientRef.current.sendText(`(Added page ${pageNum})`, true)
          })
        }
        setSheetDetent(prevDetent)
      })
    }, 80)
  }, [captureCurrentPage, sheetDetent, showToast, t.relayMaxPagesReached, t.relayPageAdded])

  // ── Page Viewer handlers (with history back support) ───────────────

  const openPageViewer = useCallback((index: number) => {
    if (pagesRef.current.length === 0) return
    const clamped = Math.max(0, Math.min(pagesRef.current.length - 1, index))
    setViewerIndex(clamped)
    pushBrowserHistory({ screen: 'relay-camera', overlay: 'relay_page_viewer' })
  }, [])

  const closePageViewer = useCallback(() => {
    if (typeof window !== 'undefined' && window.history.state?.overlay === 'relay_page_viewer') {
      window.history.back()
    } else {
      setViewerIndex(null)
    }
  }, [])

  const handleDiscussPage = useCallback((page: CapturedPage, pageNumber: number) => {
    idleGuardRef.current?.recordActivity()
    const client = clientRef.current
    if (!client?.isConnected()) return
    setIsThinking(true)
    void page.blob.arrayBuffer().then((buf) => {
      if (!clientRef.current?.isConnected()) return
      clientRef.current.sendVideo(buf)
      clientRef.current.sendText(`(Now looking at page ${pageNumber})`, true)
    })
  }, [])

  const handleDeletePage = useCallback((pageId: string) => {
    const next = removePageFromStack(pagesRef.current, pageId)
    setPages(next)
    if (next.length === 0) {
      setSelectedPageId(null)
    } else if (selectedPageId === pageId) {
      setSelectedPageId(next[next.length - 1].id)
    }
  }, [selectedPageId])

  // ── Scan pages: Proceed ────────────────────────────────────────────

  const handleProceed = useCallback(async () => {
    setIsLiveSheetOpen(true)
    setSheetDetent('half')
    setRelayError(null)
    try {
      const client = await initLiveClient('scan')

      // Send each pinned page as a still
      for (let i = 0; i < pagesRef.current.length; i++) {
        const p = pagesRef.current[i]
        const buf = await p.blob.arrayBuffer()
        client.sendVideo(buf)
        client.sendText(`Pinned page ${i + 1}`, true)
      }
    } catch {
      // Friendly error state already set and logged by initLiveClient
    }
  }, [initLiveClient])

  const handleRetryError = () => {
    if (relayError?.retryTarget === 'gemini') {
      autoConnectAttemptedRef.current = true
      if (mode === 'scan') {
        void handleProceed()
      } else {
        void initLiveClient('live').catch(() => {})
      }
    } else {
      autoConnectAttemptedRef.current = false
      void startCameraInGesture(facingMode)
    }
  }

  const hasPages = pages.length > 0
  const isFront = facingMode === 'user'
  const orbState = deriveGeminiOrbState({ isSpeaking, isThinking, isLive })
  const statusLabel = isReconnecting
    ? t.relayStatusReconnecting
    : isLive
      ? t.relayStatusLive
      : t.relayStatusConnecting
  const statusDotClass = isReconnecting
    ? 'rc-status-dot-reconnecting'
    : isLive
      ? 'rc-status-dot-live'
      : 'rc-status-dot-connecting'
  const orbLabel =
    orbState === 'speaking'
      ? t.relayOrbSpeaking
      : orbState === 'thinking'
        ? t.relayOrbThinking
        : t.relayOrbListening
  const visibleCaptions = captions.slice(-2)

  return (
    <div className="rc-outer" data-testid="relay-camera-outer">
      <div
        className="rc-column"
        data-testid="relay-camera-screen"
        data-relay-stage={sessionState.stage}
        data-relay-mode={mode}
        data-frames-sent={framesSent}
        data-video-paused={videoPaused ? 'true' : 'false'}
      >
        {/* Video Viewport */}
        <video
          ref={videoRef}
          data-testid="relay-camera-video"
          className="rc-video"
          playsInline
          muted
          autoPlay
          style={{
            transform: isFront ? 'scaleX(-1)' : 'none',
            opacity: mode === 'live' && videoPaused ? 0.35 : 1,
            transition: 'opacity 0.2s ease',
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

        {/* Scan pages mustard frame guideline (Scan mode only) */}
        {mode === 'scan' && (
          <div
            style={{
              position: 'absolute',
              left: '10%',
              right: '10%',
              top: '16%',
              bottom: '28%',
              border: '2.5px solid #E3B660',
              borderRadius: 12,
              background: 'rgba(227,182,96,0.06)',
              pointerEvents: 'none',
              zIndex: 10,
            }}
          />
        )}

        {/* Top Header Bar */}
        <div
          style={{
            position: 'relative',
            zIndex: 20,
            flex: 'none',
            minHeight: 64,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: 'max(10px, env(safe-area-inset-top, 10px)) 16px 6px',
            background: 'linear-gradient(to bottom, rgba(0,0,0,0.68) 0%, transparent 100%)',
          }}
        >
          {/* Close Button */}
          <button
            type="button"
            onClick={() => { void handleEndAndSave() }}
            aria-label={t.relayCloseCamera}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              background: 'rgba(0,0,0,0.55)',
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

          {/* Status Pill (Live video mode) OR Hint Pill (Scan pages mode) */}
          {mode === 'live' ? (
            <span
              data-testid="relay-status-pill"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 8,
                height: 36,
                padding: '0 14px',
                borderRadius: 18,
                background: 'rgba(14,14,14,0.72)',
                border: '1px solid rgba(255,255,255,0.16)',
                fontSize: 13.5,
                fontWeight: 700,
              }}
            >
              <span
                className={statusDotClass}
                style={{ width: 9, height: 9, borderRadius: '50%', display: 'inline-block' }}
              />
              {statusLabel}
            </span>
          ) : (
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
                  ? `${pages.length} page${pages.length > 1 ? 's' : ''} · ${t.relayProceed}`
                  : t.relayHintFitPage}
            </span>
          )}

          {/* Flip Camera Button */}
          <button
            type="button"
            data-testid="relay-flip-btn"
            onClick={handleFlipCamera}
            aria-label={t.relayFlipCamera}
            style={{
              width: 44,
              height: 44,
              borderRadius: 22,
              border: 0,
              background: 'rgba(0,0,0,0.55)',
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

        {/* Live Video Mode: Corner Gemini Orb + Paused Badge */}
        {mode === 'live' && (
          <div
            style={{
              position: 'relative',
              zIndex: 20,
              display: 'flex',
              alignItems: 'flex-start',
              justifyContent: 'space-between',
              padding: '6px 16px 0',
              pointerEvents: 'none',
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {videoPaused && (
                <span
                  data-testid="relay-paused-badge"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    padding: '5px 12px',
                    borderRadius: 14,
                    background: 'rgba(201, 104, 70, 0.92)',
                    color: '#F5F4F2',
                    fontSize: 12.5,
                    fontWeight: 700,
                  }}
                >
                  {t.relayVideoPausedBadge}
                </span>
              )}
              {hasPages && (
                <button
                  type="button"
                  data-testid="relay-pinned-badge"
                  onClick={() => openPageViewer(pages.length - 1)}
                  aria-label={(t.relayOpenPageN || 'Open page {n}').replace('{n}', String(pages.length))}
                  style={{
                    pointerEvents: 'auto',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                    minHeight: 44,
                    padding: '4px 12px',
                    borderRadius: 22,
                    background: 'rgba(27,27,27,0.85)',
                    border: '1.5px solid rgba(227,182,96,0.65)',
                    color: '#E3B660',
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {pages.length} pinned
                </button>
              )}
            </div>

            {/* Gemini Orb in corner */}
            <div
              data-testid="relay-gemini-orb"
              data-orb-state={orbState}
              style={{
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                gap: 4,
              }}
            >
              <div className={`rc-orb-wrap rc-orb-${orbState}`}>
                <span className="rc-orb-ring" />
                <span className="rc-orb-core">
                  <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
                    <path
                      d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10z"
                      fill="#1B1B1B"
                    />
                  </svg>
                </span>
              </div>
              <span
                style={{
                  fontSize: 11,
                  fontWeight: 700,
                  padding: '2px 8px',
                  borderRadius: 999,
                  background: 'rgba(14,14,14,0.72)',
                  color: '#E3B660',
                }}
              >
                {orbLabel}
              </span>
            </div>
          </div>
        )}

        {/* Sound Resume Banner (appears if AudioContext is still suspended 2s after connect or playback stalled) */}
        {showSoundBanner && !relayError && (
          <div style={{ position: 'relative', zIndex: 35, padding: '6px 16px 0' }}>
            <button
              type="button"
              data-testid="relay-sound-banner"
              onClick={() => { void handleEnableSound() }}
              style={{
                width: '100%',
                minHeight: 44,
                padding: '8px 14px',
                borderRadius: 16,
                border: '1.5px solid #1B1B1B',
                background: '#E3B660',
                color: '#1B1B1B',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 8,
                boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
              }}
            >
              {t.relayTapToTurnOnSound || 'Tap to turn on sound'}
            </button>
          </div>
        )}

        {/* Short Page Added / Max Pages Toast */}
        {toastMsg && (
          <div
            role="status"
            aria-live="polite"
            data-testid="relay-page-toast"
            style={{
              position: 'absolute',
              top: 74,
              left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 62,
              padding: '8px 16px',
              borderRadius: 999,
              background: 'rgba(27,27,27,0.92)',
              border: '1px solid rgba(227,182,96,0.55)',
              color: '#F5F4F2',
              fontSize: 13.5,
              fontWeight: 700,
              whiteSpace: 'nowrap',
              pointerEvents: 'none',
            }}
          >
            {toastMsg}
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Live Video Mode: Last 2 Caption Lines (tap to open LiveSheet transcript) */}
        {mode === 'live' && !isLiveSheetOpen && (
          <div style={{ position: 'relative', zIndex: 20, padding: '0 14px 10px' }}>
            <button
              type="button"
              data-testid="relay-live-captions"
              onClick={() => setIsLiveSheetOpen(true)}
              aria-label={t.relayOpenTranscript}
              aria-live="polite"
              style={{
                width: '100%',
                minHeight: 56,
                textAlign: 'left',
                padding: '10px 14px',
                borderRadius: 18,
                border: '1px solid rgba(255,255,255,0.16)',
                background: 'rgba(20, 20, 20, 0.82)',
                color: '#F5F4F2',
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                cursor: 'pointer',
              }}
            >
              {visibleCaptions.length === 0 ? (
                <span style={{ fontSize: 16, lineHeight: 1.35, color: 'rgba(245,244,242,0.82)' }}>
                  {t.relaySpeakHint}
                </span>
              ) : (
                visibleCaptions.map((turn) => (
                  <div
                    key={turn.id}
                    style={{
                      fontSize: 16.5,
                      lineHeight: 1.35,
                      fontWeight: turn.who === 'Gemini' ? 600 : 500,
                      overflow: 'hidden',
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                    }}
                  >
                    <span
                      style={{
                        color: turn.who === 'Gemini' ? '#E3B660' : '#D3E5E0',
                        fontWeight: 700,
                        marginRight: 6,
                      }}
                    >
                      {turn.who}:
                    </span>
                    {turn.text || '…'}
                  </div>
                ))
              )}
            </button>
          </div>
        )}

        {/* Live Video Mode: Hold to Talk bar when in hold mode */}
        {mode === 'live' && micMode === 'hold' && !isLiveSheetOpen && (
          <div style={{ position: 'relative', zIndex: 20, padding: '0 14px 8px' }}>
            <button
              type="button"
              data-testid="relay-hold-talk-btn"
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
              aria-label="Hold to talk"
              aria-pressed={isHoldingTalk}
              style={{
                width: '100%',
                minHeight: 48,
                borderRadius: 16,
                border: 0,
                background: isHoldingTalk ? '#E5533D' : '#C96846',
                color: '#F5F4F2',
                fontWeight: 700,
                fontSize: 15,
                cursor: 'pointer',
                userSelect: 'none',
                WebkitUserSelect: 'none',
              }}
            >
              {isHoldingTalk ? 'Listening…' : 'Hold to talk'}
            </button>
          </div>
        )}

        {/* Mode Switch Pill (above bottom controls / shutter) */}
        <div
          style={{
            position: 'relative',
            zIndex: 20,
            display: 'flex',
            justifyContent: 'center',
            padding: '0 16px 10px',
          }}
        >
          <div
            role="tablist"
            aria-label="Camera mode"
            data-testid="relay-mode-switch"
            style={{
              display: 'inline-flex',
              padding: 4,
              borderRadius: 999,
              background: 'rgba(14, 14, 14, 0.78)',
              border: '1px solid rgba(255,255,255,0.18)',
              gap: 4,
            }}
          >
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'live'}
              data-testid="relay-mode-live"
              onClick={() => handleSelectMode('live')}
              style={{
                minHeight: 44,
                padding: '0 18px',
                borderRadius: 999,
                border: 0,
                background: mode === 'live' ? '#E3B660' : 'transparent',
                color: mode === 'live' ? '#1B1B1B' : '#F5F4F2',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.relayModeLive}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={mode === 'scan'}
              data-testid="relay-mode-scan"
              onClick={() => handleSelectMode('scan')}
              style={{
                minHeight: 44,
                padding: '0 18px',
                borderRadius: 999,
                border: 0,
                background: mode === 'scan' ? '#E3B660' : 'transparent',
                color: mode === 'scan' ? '#1B1B1B' : '#F5F4F2',
                fontSize: 14,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {t.relayModeScan}
            </button>
          </div>
        </div>

        {/* Bottom Control Bar: Live video controls OR Scan pages controls */}
        {mode === 'live' ? (
          <div
            data-testid="relay-live-controls"
            style={{
              position: 'relative',
              zIndex: 20,
              flex: 'none',
              padding: '12px 14px calc(20px + env(safe-area-inset-bottom, 12px))',
              marginBottom: isLiveSheetOpen && sheetDetent === 'collapsed' ? 74 : 0,
              background: 'rgba(10, 10, 10, 0.86)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
              transition: 'margin-bottom 250ms ease',
            }}
          >
            {/* Mic Mute */}
            <button
              type="button"
              data-testid="relay-mute-btn"
              onClick={() => setIsMuted((m) => !m)}
              aria-label={isMuted ? t.relayUnmuteMic : t.relayMuteMic}
              aria-pressed={isMuted}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                border: 0,
                background: isMuted ? '#F5F4F2' : 'rgba(255,255,255,0.16)',
                color: isMuted ? '#1B1B1B' : '#F5F4F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              <svg viewBox="0 0 24 24" width={21} height={21} fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                {isMuted && <path d="M4 4l16 16" />}
              </svg>
            </button>

            {/* VAD / Hold-to-Talk switch */}
            <button
              type="button"
              data-testid="relay-mic-mode-btn"
              onClick={() => setMicMode((m) => (m === 'vad' ? 'hold' : 'vad'))}
              aria-label={micMode === 'vad' ? t.relaySwitchToHold : t.relaySwitchToVad}
              aria-pressed={micMode === 'hold'}
              style={{
                minWidth: 48,
                height: 48,
                padding: '0 10px',
                borderRadius: 24,
                border: '1px solid rgba(255,255,255,0.2)',
                background: micMode === 'hold' ? '#C96846' : 'rgba(255,255,255,0.12)',
                color: '#F5F4F2',
                fontSize: 12,
                fontWeight: 700,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              {micMode === 'vad' ? 'VAD' : 'Hold'}
            </button>

            {/* Pause / Resume Video */}
            <button
              type="button"
              data-testid="relay-pause-video-btn"
              onClick={() => setVideoPaused((p) => !p)}
              aria-label={videoPaused ? t.relayResumeVideo : t.relayPauseVideo}
              aria-pressed={videoPaused}
              style={{
                width: 48,
                height: 48,
                borderRadius: 24,
                border: 0,
                background: videoPaused ? '#C96846' : 'rgba(255,255,255,0.16)',
                color: '#F5F4F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              {videoPaused ? (
                <svg viewBox="0 0 24 24" width={21} height={21} fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z" />
                  <path d="M15 10l5-3v10l-5-3" />
                  <path d="M3 3l18 18" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" width={21} height={21} fill="none" stroke="currentColor" strokeWidth={2}>
                  <path d="M2 8a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V8z" />
                  <path d="M15 10l5-3v10l-5-3" />
                </svg>
              )}
            </button>

            {/* Freeze and ask */}
            <button
              type="button"
              data-testid="relay-freeze-ask-btn"
              onClick={handleFreezeAndAsk}
              disabled={!cameraReady}
              aria-label={t.relayFreezeAndAsk}
              style={{
                flex: 1,
                minHeight: 48,
                padding: '0 12px',
                borderRadius: 24,
                border: 0,
                background: '#E3B660',
                color: '#1B1B1B',
                fontSize: 13.5,
                fontWeight: 700,
                cursor: cameraReady ? 'pointer' : 'not-allowed',
                opacity: cameraReady ? 1 : 0.45,
                whiteSpace: 'nowrap',
              }}
            >
              {t.relayFreezeAndAsk}
            </button>

            {/* End & Save */}
            <button
              type="button"
              data-testid="relay-end-btn"
              onClick={() => { void handleEndAndSave() }}
              aria-label={t.relayEnd}
              style={{
                minWidth: 64,
                height: 48,
                padding: '0 16px',
                borderRadius: 24,
                border: 0,
                background: '#E5533D',
                color: '#F5F4F2',
                fontSize: 14.5,
                fontWeight: 700,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              {t.relayEnd}
            </button>
          </div>
        ) : (
          <div
            data-testid="relay-scan-controls"
            style={{
              position: 'relative',
              zIndex: 20,
              flex: 'none',
              padding: '12px 20px calc(22px + env(safe-area-inset-bottom, 12px))',
              marginBottom: isLiveSheetOpen && sheetDetent === 'collapsed' ? 74 : 0,
              background: 'rgba(10, 10, 10, 0.84)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              transition: 'margin-bottom 250ms ease',
            }}
          >
            {/* Left: Tappable Thumbnail stack (when hasPages) OR Mic mute toggle */}
            <div style={{ width: 92, display: 'flex', justifyContent: 'flex-start' }}>
              {hasPages ? (
                <button
                  type="button"
                  data-testid="relay-page-thumb"
                  onClick={() => openPageViewer(pages.length - 1)}
                  aria-label={(t.relayOpenPageN || 'Open page {n}').replace('{n}', String(pages.length))}
                  style={{
                    position: 'relative',
                    width: 48,
                    height: 60,
                    minWidth: 44,
                    minHeight: 44,
                    padding: 0,
                    border: 0,
                    background: 'transparent',
                    cursor: 'pointer',
                  }}
                >
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
                    alt=""
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
                    data-testid="relay-page-count-badge"
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
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsMuted((m) => !m)}
                  aria-label={isMuted ? t.relayUnmuteMic : t.relayMuteMic}
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
                  onClick={() => { void handleEndAndSave() }}
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
        )}

        {/* Cost Guard: 10-minute idle "Still there?" prompt */}
        {idlePromptOpen && !relayError && (
          <div
            role="dialog"
            aria-modal="true"
            data-testid="relay-idle-prompt"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 65,
              background: 'rgba(14,14,14,0.82)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 336,
                background: '#F4F3F1',
                color: '#1B1B1B',
                borderRadius: 24,
                border: '2px solid #1B1B1B',
                padding: 22,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <h2 style={{ margin: 0, fontFamily: 'Fraunces, Georgia, serif', fontSize: 22, fontWeight: 600 }}>
                {t.relayIdleTitle}
              </h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: '#3D3B37' }}>
                {t.relayIdleBody}
              </p>
              <div style={{ display: 'flex', gap: 10, marginTop: 6 }}>
                <button
                  type="button"
                  onClick={() => {
                    setIdlePromptOpen(false)
                    idleGuardRef.current?.confirmStillHere()
                  }}
                  style={{
                    flex: 1,
                    minHeight: 48,
                    borderRadius: 999,
                    border: '2px solid #1B1B1B',
                    background: '#E3B660',
                    color: '#1B1B1B',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t.relayIdleStay}
                </button>
                <button
                  type="button"
                  onClick={() => { void handleEndAndSave() }}
                  style={{
                    minWidth: 88,
                    minHeight: 48,
                    borderRadius: 999,
                    border: 0,
                    background: '#E5533D',
                    color: '#F5F4F2',
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: 'pointer',
                  }}
                >
                  {t.relayEnd}
                </button>
              </div>
            </div>
          </div>
        )}

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
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  lineHeight: 1.4,
                  color: '#575B58',
                }}
              >
                {t.relayNoSoundHelp || 'No sound? Check the ring/silent switch and the volume.'}
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
                  onClick={handleCloseWithoutSave}
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

        {/* LiveSheet 3-Detent Transcript & Pages Drawer */}
        <LiveSheet
          isOpen={isLiveSheetOpen && !relayError}
          detent={sheetDetent}
          onDetentChange={setSheetDetent}
          isLive={isLive}
          isSpeaking={isSpeaking}
          isThinking={isThinking}
          isReconnecting={isReconnecting}
          isUsingFallback={isUsingFallback}
          fallbackModelName={fallbackModelName}
          captions={captions}
          pages={pages}
          selectedPageId={selectedPageId}
          onOpenPage={(idx) => openPageViewer(idx)}
          onAddPage={handleAddPageFromSheet}
          canAddPage={cameraReady && pages.length < MAX_PAGE_STACK_COUNT}
          showSoundBanner={showSoundBanner}
          onEnableSound={() => { void handleEnableSound() }}
          t={t}
          onSendText={(text) => {
            idleGuardRef.current?.recordActivity()
            setIsThinking(true)
            clientRef.current?.sendText(text, true)
          }}
          onEnd={() => { void handleEndAndSave() }}
          onDismiss={mode === 'live' ? () => setIsLiveSheetOpen(false) : undefined}
          onToggleMic={() => setIsMuted((m) => !m)}
          onToggleMicMode={() => setMicMode((m) => (m === 'vad' ? 'hold' : 'vad'))}
          isMuted={isMuted}
          micMode={micMode}
          isHoldingTalk={isHoldingTalk}
          onHoldTalkStart={() => setIsHoldingTalk(true)}
          onHoldTalkEnd={() => setIsHoldingTalk(false)}
        />

        {/* Full-Screen Scanned Page Viewer */}
        {viewerIndex !== null && pages.length > 0 && (
          <PageViewer
            pages={pages}
            initialIndex={viewerIndex}
            isGeminiConnected={isLive}
            onClose={closePageViewer}
            onDiscussPage={handleDiscussPage}
            onDeletePage={handleDeletePage}
            t={t}
          />
        )}
      </div>
    </div>
  )
}
