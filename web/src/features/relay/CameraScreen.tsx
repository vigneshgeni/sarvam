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
  buildRoomSystemPrompt,
  buildSoloSystemPrompt,
} from './live/relayPrompt.js'
import type { LiveClient, RelayLanguage } from './live/LiveClient.js'
import {
  addPageToStack,
  calculateLongEdgeDimensions,
  removePageFromStack,
  type CapturedPage,
  MAX_PAGE_STACK_COUNT,
} from './pageStack.js'
import type { ConversationGateMetrics } from './audio/ConversationGate.js'
import { RoomAudioMixerGraph } from './audio/RoomAudioMixer.js'
import { RelayTurnController, type RelayTurnSnapshot } from './relayTurnState.js'
import { TranscriptAssembler } from './transcriptAssembler.js'
import RelayDebugOverlay, { isRelayDebugEnabled } from './RelayDebugOverlay.js'
import RoomHost, { type RoomHostHandle, type RoomMemberInfo } from './room/RoomHost.js'
import {
  buildCaptionBroadcast,
  SpeakerNoteTracker,
} from './room/speakerTracker.js'
import {
  createInitialCameraHandoffState,
  transitionCameraHandoff,
  type CameraHandoffState,
  type CameraHandoffTransitionResult,
} from './room/cameraHandoff.js'
import { updateRelayGuestPermission } from './room/relayApi.js'
import { openFormFill } from '../formfill/openFormFill.js'
import type { RemoteTrack } from 'livekit-client'
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
import {
  isSaveRecentEnabled,
  saveRecentResult,
  saveRelaySession,
} from '../../utils/db.js'
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

  // P1.7 Turn state machine, watchdog no-answer card & ?debug=1 HUD
  const [turnSnapshot, setTurnSnapshot] = useState<RelayTurnSnapshot>({
    state: 'idle',
    stillThinking: false,
    lastServerMessageAt: Date.now(),
    reconnectCount: 0,
    recentEvents: [],
  })
  const [noAnswerError, setNoAnswerError] = useState(false)
  const [debugGateMetrics, setDebugGateMetrics] = useState<ConversationGateMetrics | null>(null)
  const debugEnabled = isRelayDebugEnabled()

  // P3 Room handoff & privacy state
  const [handoffState, setHandoffState] = useState<CameraHandoffState>(() => createInitialCameraHandoffState())
  const [guestCount, setGuestCount] = useState(0)
  const [roomPrivacyShown, setRoomPrivacyShown] = useState(false)

  // DOM & Manager refs
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const remoteGuestVideoRef = useRef<HTMLVideoElement | null>(null)
  const activeGuestVideoTrackRef = useRef<RemoteTrack | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const streamCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const activeStreamRef = useRef<MediaStream | null>(null)
  const sharedAudioCtxRef = useRef<AudioContext | null>(initialLaunch?.audioCtx || null)
  const clientRef = useRef<LiveClient | null>(null)
  const audioManagerRef = useRef<LiveAudioManager | null>(null)
  const cadenceRef = useRef<FrameCadenceController | null>(null)
  const idleGuardRef = useRef<IdleGuardController | null>(null)
  const roomHostRef = useRef<RoomHostHandle | null>(null)
  const mixerRef = useRef<RoomAudioMixerGraph>(new RoomAudioMixerGraph())
  const speakerTrackerRef = useRef<SpeakerNoteTracker | null>(null)
  const turnCtrlRef = useRef<RelayTurnController | null>(null)
  const transcriptRef = useRef<TranscriptAssembler>(new TranscriptAssembler())
  const handoffStateRef = useRef<CameraHandoffState>(handoffState)
  const allowGuestCameraRef = useRef(false)
  const videoPausedRef = useRef(videoPaused)
  const sessionStartedAtRef = useRef<number>(Date.now())
  const participantsSetRef = useRef<Set<string>>(new Set(['You']))
  const lastGateActiveAtRef = useRef<number>(0)
  const lastEndedSpeechMsRef = useRef<number>(0)
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
    handoffStateRef.current = handoffState
  }, [handoffState])

  useEffect(() => {
    videoPausedRef.current = videoPaused
  }, [videoPaused])

  // Ensure host source is registered in mixer graph and speaker tracker is initialized once
  useEffect(() => {
    mixerRef.current.addSource({ id: 'host', name: 'You', isHost: true })
    const tracker = new SpeakerNoteTracker((note) => {
      if (clientRef.current?.isConnected()) {
        clientRef.current.sendText(note, false)
      }
    }, 600)
    speakerTrackerRef.current = tracker
    return () => {
      tracker.reset()
      speakerTrackerRef.current = null
    }
  }, [])

  // Attach guest remote video track once the guest <video> element mounts
  useEffect(() => {
    if (handoffState.kind !== 'guestCamera') return
    const el = remoteGuestVideoRef.current
    const tr = activeGuestVideoTrackRef.current
    if (el && tr) {
      tr.attach(el)
      el.muted = true
      el.playsInline = true
      el.autoplay = true
      void el.play().catch(() => {})
    }
  }, [handoffState])

  useEffect(() => {
    micModeRef.current = micMode
    mixerRef.current.setHostMode('host', micMode === 'hold' ? 'hold' : 'auto')
  }, [micMode])

  useEffect(() => {
    isMutedRef.current = isMuted
    audioManagerRef.current?.setMuted(isMuted)
  }, [isMuted])

  useEffect(() => {
    isHoldingTalkRef.current = isHoldingTalk
    const transition = mixerRef.current.setHostHolding('host', isHoldingTalk, Date.now())
    if (transition.speechStarted) {
      lastGateActiveAtRef.current = Date.now()
      turnCtrlRef.current?.onUserSpeechStart()
    } else if (transition.speechEnded) {
      lastEndedSpeechMsRef.current = transition.endedSpeechDurationMs
      const committed = transcriptRef.current.commitUserTurn(transition.endedSpeechDurationMs)
      if (committed) {
        setCaptions(transcriptRef.current.getTurns())
        const payload = buildCaptionBroadcast({
          id: committed.id,
          speaker: committed.who,
          lang: committed.speakerLang || resolvedLang,
          text: committed.text,
          ts: committed.ts,
          kind: 'input',
        })
        if (payload) roomHostRef.current?.broadcastData(payload as unknown as Record<string, unknown>, true)
      }
      turnCtrlRef.current?.onUserSpeechEnd(committed?.text || null)
    }
  }, [isHoldingTalk, resolvedLang])

  // Poll gate metrics for ?debug=1 overlay only when debug mode is explicitly enabled
  useEffect(() => {
    if (!debugEnabled) return
    const id = setInterval(() => {
      if (isMountedRef.current) {
        setDebugGateMetrics(mixerRef.current.getSourceMetrics('host'))
      }
    }, 250)
    return () => clearInterval(id)
  }, [debugEnabled])

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
    turnCtrlRef.current?.stop()
    turnCtrlRef.current = null
    mixerRef.current.resetAll()
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

  // ── Save Session to IndexedDB relaySessions + Recent (End and save) ─

  const saveSessionToRecent = useCallback(async () => {
    if (!isSaveRecentEnabled()) return
    const currentCaptions = captionsRef.current
    const currentPages = pagesRef.current
    const sessionId = `relay-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`

    const summaryLines =
      currentCaptions.length > 0
        ? currentCaptions
            .slice(-6)
            .map((c) => `${c.who}: ${c.text}`.trim())
            .filter(Boolean)
        : [t.relayModeLive]

    const firstCaption = currentCaptions.find((c) => c.text.trim())
    const sessionTitle = firstCaption
      ? firstCaption.text.trim().slice(0, 60)
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
      await saveRelaySession({
        id: sessionId,
        title: sessionTitle,
        startedAt: sessionStartedAtRef.current,
        endedAt: Date.now(),
        participants: Array.from(participantsSetRef.current),
        captions: currentCaptions.map((c) => ({
          speaker: c.who,
          text: c.text,
          lang: c.speakerLang || resolvedLang,
          ts: c.ts || Date.now(),
        })),
        pages: currentPages.map((p) => ({
          id: p.id,
          dataUrl: p.dataUrl,
          thumbDataUrl: p.dataUrl,
          width: p.width,
          height: p.height,
          timestamp: p.timestamp,
        })),
        pins: currentPages.map((p) => p.id),
      })

      await saveRecentResult({
        id: sessionId,
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
    await roomHostRef.current?.endRoom().catch(() => {})
    await cleanupAllResources()
    await saveSessionToRecent()
    onClose()
  }, [cleanupAllResources, onClose, saveSessionToRecent])

  const handleCloseWithoutSave = useCallback(() => {
    if (endingRef.current) return
    endingRef.current = true
    setIdlePromptOpen(false)
    void roomHostRef.current?.endRoom().catch(() => {})
    void cleanupAllResources()
    onClose()
  }, [cleanupAllResources, onClose])

  // ── 1 fps Live Video Frame Sender (reads from ACTIVE camera: host or guest) ─

  const sendLiveVideoFrame = useCallback(() => {
    const isGuestActive = handoffStateRef.current.kind === 'guestCamera'
    const guestEl = remoteGuestVideoRef.current
    const useGuest = isGuestActive && guestEl && guestEl.readyState >= 2 && guestEl.videoWidth > 0
    const video = useGuest ? guestEl : videoRef.current
    const client = clientRef.current
    if (!video || !client || !client.isConnected() || video.readyState < 2) return

    if (typeof window !== 'undefined') {
      ;(window as unknown as { __relayFrameSource?: string }).__relayFrameSource = useGuest ? 'guest' : 'host'
    }

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
      // If a LiveKit room is active (e.g. after Flip camera), replace the published video track seamlessly
      const newVideoTrack = stream.getVideoTracks()[0]
      if (newVideoTrack && roomHostRef.current?.isInRoom()) {
        void roomHostRef.current.replaceVideoTrack(newVideoTrack).catch(() => {})
      }
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
      setNoAnswerError(false)
      logRelayStage('Gemini connecting', { mode: forMode })
      setSessionState((prev) => transitionRelayState(prev, { type: 'GEMINI_CONNECTING' }))

      const win = typeof window !== 'undefined' ? (window as unknown as {
        __relayMockLiveClientFactory?: () => LiveClient
        __relayWatchdogTimings?: {
          stillThinkingMs?: number
          reconnectResendMs?: number
          noAnswerMs?: number
          modelAudioStallMs?: number
          socketSilenceMs?: number
        }
      }) : undefined
      const client: LiveClient = win?.__relayMockLiveClientFactory
        ? win.__relayMockLiveClientFactory()
        : new FirebaseLiveClient()
      const audioManager = new LiveAudioManager()

      // Initialize P1.7 Turn State Machine + Watchdog
      turnCtrlRef.current?.stop()
      const turnCtrl = new RelayTurnController(
        {
          onStateChange: (snap) => {
            if (!isMountedRef.current) return
            setTurnSnapshot(snap)
            setIsThinking(snap.state === 'thinking')
          },
          onStillThinkingNudge: () => {
            if (clientRef.current?.isConnected()) {
              clientRef.current.sendText('Please answer my last question.', true)
            }
          },
          onReconnectAndResend: (lastText) => {
            void (async () => {
              const activeClient = clientRef.current
              if (!activeClient) return
              if (activeClient.reconnectWithResumption) {
                await activeClient.reconnectWithResumption().catch(() => {})
              }
              if (lastText && clientRef.current?.isConnected()) {
                clientRef.current.sendText(lastText, true)
              }
            })()
          },
          onNoAnswerTimeout: () => {
            if (isMountedRef.current) {
              setNoAnswerError(true)
            }
          },
          onSocketSilenceReconnect: () => {
            void clientRef.current?.reconnectWithResumption?.().catch(() => {})
          },
          onModelSpeakingForceIdle: () => {
            if (!isMountedRef.current) return
            isPlayingAudioRef.current = false
            mixerRef.current.setPlaybackState(false, 0)
            setIsSpeaking(false)
            const done = transcriptRef.current.completeModelTurn()
            setCaptions(transcriptRef.current.getTurns())
            if (done) {
              const payload = buildCaptionBroadcast({
                id: done.id,
                speaker: done.who,
                lang: done.speakerLang || resolvedLang,
                text: done.text,
                ts: done.ts,
                kind: 'output',
              })
              if (payload) roomHostRef.current?.broadcastData(payload as unknown as Record<string, unknown>, true)
            }
          },
        },
        win?.__relayWatchdogTimings,
      )
      turnCtrlRef.current = turnCtrl

      const handleMixedSourcePcm = (sourceId: string, pcm: ArrayBuffer) => {
        const now = Date.now()
        const res = mixerRef.current.processSourceFrame(sourceId, pcm, now)
        if (res.activeSourceIds.length > 0) {
          lastGateActiveAtRef.current = now
        }
        if (res.anySpeechStarted) {
          turnCtrl.onUserSpeechStart()
        }
        for (const frame of res.framesToSend) {
          client.sendAudio(frame)
        }
        if (res.anySpeechEnded) {
          lastEndedSpeechMsRef.current = res.endedSpeechDurationMs
          const committed = transcriptRef.current.commitUserTurn(res.endedSpeechDurationMs)
          if (committed && isMountedRef.current) {
            setCaptions(transcriptRef.current.getTurns())
            const payload = buildCaptionBroadcast({
              id: committed.id,
              speaker: committed.who,
              lang: committed.speakerLang || resolvedLang,
              text: committed.text,
              ts: committed.ts,
              kind: 'input',
            })
            if (payload) roomHostRef.current?.broadcastData(payload as unknown as Record<string, unknown>, true)
          }
          turnCtrl.onUserSpeechEnd(committed?.text || null)
        }
      }

      try {
        // Start & connect the 24 kHz playback worklet BEFORE connecting the Live session
        await audioManager.start(
          (pcm) => {
            // In Scan mode, only stream mic while LiveSheet is open
            if (modeRef.current === 'scan' && !isLiveSheetOpenRef.current) {
              return
            }
            if (micModeRef.current === 'vad' && isMutedRef.current) {
              return
            }
            handleMixedSourcePcm('host', pcm)
          },
          {
            audioCtx: sharedAudioCtxRef.current,
            audioStream: activeStreamRef.current,
            onPlaybackStateChange: (playing) => {
              isPlayingAudioRef.current = playing
              mixerRef.current.setPlaybackState(playing, audioManager.getPlaybackLevel())
              if (isMountedRef.current) {
                setIsSpeaking(playing)
                if (playing) setShowSoundBanner(false)
              }
            },
            onPlaybackLevel: (rms) => {
              mixerRef.current.setPlaybackState(isPlayingAudioRef.current, rms)
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

        // If a LiveKit room is already open, publish Gemini's 24 kHz audio track as "gemini"
        if (roomHostRef.current?.isInRoom()) {
          const geminiTrack = audioManager.createGeminiBroadcastTrack()
          if (geminiTrack) {
            mixerRef.current.setGeminiOutputTrackId(geminiTrack.id)
            void roomHostRef.current.publishGeminiAudioTrack(geminiTrack).catch(() => {})
          }
        }

        // Output audio (24 kHz) — speaking indicator follows actual playback from worklet
        client.onAudio = (pcm) => {
          idleGuardRef.current?.recordActivity()
          setNoAnswerError(false)
          turnCtrl.onModelOutput(true)
          audioManager.playAudio(pcm)
        }

        // Interrupted — FALSE BARGE-IN GUARD: only stop Gemini if local/guest gate saw >=200ms speech in last 400ms
        client.onInterrupted = () => {
          if (!mixerRef.current.shouldAcceptServerInterrupt(Date.now())) {
            console.info('[relay] ignored false server interrupt (local gate closed or <200ms)')
            return
          }
          audioManager.flush()
          isPlayingAudioRef.current = false
          mixerRef.current.setPlaybackState(false, 0)
          setIsSpeaking(false)
          turnCtrl.onRealInterrupt()
          const cut = transcriptRef.current.interruptModelTurn()
          setCaptions(transcriptRef.current.getTurns())
          if (cut) {
            const payload = buildCaptionBroadcast({
              id: cut.id,
              speaker: cut.who,
              lang: resolvedLang,
              text: cut.text,
              ts: cut.ts,
              kind: 'output',
            })
            if (payload) roomHostRef.current?.broadcastData(payload as unknown as Record<string, unknown>, true)
          }
        }

        // Input captions — buffered in TranscriptAssembler; labeled with active speaker; dropped when gate closed
        client.onInputText = (text: string) => {
          turnCtrl.recordServerMessage()
          const now = Date.now()
          const gateActive =
            mixerRef.current.isAnyGateOpen() ||
            now - lastGateActiveAtRef.current <= 1200
          const activeSpk = speakerTrackerRef.current?.getCurrentSpeaker()
          const accepted = transcriptRef.current.pushInputFragment(text, {
            gateActive,
            speaker: activeSpk?.name || 'You',
            lang: activeSpk?.lang || resolvedLang,
          })
          if (accepted) {
            idleGuardRef.current?.recordActivity()
            setIdlePromptOpen(false)
          }
        }

        // Output captions — streamed live via TranscriptAssembler
        client.onOutputText = (text: string) => {
          idleGuardRef.current?.recordActivity()
          setNoAnswerError(false)
          turnCtrl.onModelOutput(false)
          transcriptRef.current.pushOutputFragment(text, lastEndedSpeechMsRef.current || 500)
          setCaptions(transcriptRef.current.getTurns())
        }

        client.onTurnComplete = () => {
          turnCtrl.onTurnComplete()
          const done = transcriptRef.current.completeModelTurn()
          setCaptions(transcriptRef.current.getTurns())
          if (done) {
            const payload = buildCaptionBroadcast({
              id: done.id,
              speaker: done.who,
              lang: done.speakerLang || resolvedLang,
              text: done.text,
              ts: done.ts,
              kind: 'output',
            })
            if (payload) roomHostRef.current?.broadcastData(payload as unknown as Record<string, unknown>, true)
          }
          if (!isPlayingAudioRef.current) {
            setIsSpeaking(false)
          }
        }

        client.onGenerationComplete = () => {
          turnCtrl.recordServerMessage()
          const done = transcriptRef.current.completeModelTurn()
          setCaptions(transcriptRef.current.getTurns())
          if (done) {
            const payload = buildCaptionBroadcast({
              id: done.id,
              speaker: done.who,
              lang: done.speakerLang || resolvedLang,
              text: done.text,
              ts: done.ts,
              kind: 'output',
            })
            if (payload) roomHostRef.current?.broadcastData(payload as unknown as Record<string, unknown>, true)
          }
          if (!isPlayingAudioRef.current) {
            setIsSpeaking(false)
          }
        }

        client.onUsingFallback = (fbModel) => {
          setIsUsingFallback(true)
          setFallbackModelName(fbModel)
        }

        client.onReconnecting = () => {
          setIsReconnecting(true)
          turnCtrl.onReconnecting()
          setSessionState((prev) => transitionRelayState(prev, { type: 'RECONNECTING' }))
        }

        client.onReconnected = () => {
          setIsReconnecting(false)
          setIsLive(true)
          turnCtrl.onReconnected()
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
            ? buildRoomSystemPrompt(relayLang)
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
        turnCtrl.setSocketActive(true)
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

  // Broadcast a small JPEG thumbnail (<= 150 KB) of a newly pinned page to the room
  const broadcastPinnedPage = useCallback((page: CapturedPage, pageNum: number) => {
    if (!roomHostRef.current?.isInRoom()) return
    void (async () => {
      try {
        const img = new Image()
        img.src = page.dataUrl
        await new Promise<void>((resolve, reject) => {
          img.onload = () => resolve()
          img.onerror = () => reject(new Error('pin thumb load failed'))
        })
        const { targetWidth, targetHeight } = calculateLongEdgeDimensions(
          img.naturalWidth || page.width,
          img.naturalHeight || page.height,
          480,
        )
        const c = document.createElement('canvas')
        c.width = targetWidth
        c.height = targetHeight
        const ctx = c.getContext('2d')
        if (!ctx) return
        ctx.drawImage(img, 0, 0, targetWidth, targetHeight)
        const thumb = c.toDataURL('image/jpeg', 0.62)
        // Enforce <= 150 KB cap for data channel safety
        if (thumb.length <= 150_000) {
          roomHostRef.current?.broadcastData({ type: 'pin', pin: page.id, pageNumber: pageNum, thumb }, true)
        }
      } catch {
        // ignore thumbnail errors
      }
    })()
  }, [])

  const applyHandoffResult = useCallback((res: CameraHandoffTransitionResult) => {
    if (!res.changed) return
    setHandoffState(res.state)
    handoffStateRef.current = res.state
    const code = roomHostRef.current?.getRoomCode()
    const hostKey = roomHostRef.current?.getHostKey()

    if (res.grantGuestId && code && hostKey) {
      const guestName = res.state.kind === 'guestCamera' ? res.state.guestName : 'Guest'
      void updateRelayGuestPermission({
        hostKey,
        code,
        identity: res.grantGuestId,
        canPublishCamera: true,
      }).then(() => {
        roomHostRef.current?.broadcastData(
          {
            type: 'camera_grant',
            identity: res.grantGuestId,
            activeCameraLabel: `${guestName}'s camera`,
          },
          true,
        )
      }).catch(() => {})
    }

    if (res.revokeGuestId && code && hostKey) {
      void updateRelayGuestPermission({
        hostKey,
        code,
        identity: res.revokeGuestId,
        canPublishCamera: false,
      }).catch(() => {})
      roomHostRef.current?.broadcastData(
        { type: 'camera_revoke', activeCameraLabel: "Host's camera" },
        true,
      )
      if (activeGuestVideoTrackRef.current && remoteGuestVideoRef.current) {
        activeGuestVideoTrackRef.current.detach(remoteGuestVideoRef.current)
      }
      activeGuestVideoTrackRef.current = null
    }

    if (res.geminiNote && clientRef.current?.isConnected()) {
      clientRef.current.sendText(res.geminiNote, false)
    }
  }, [])

  const handleRoomActiveChange = useCallback(
    (info: { active: boolean; code: string | null; hostKey: string | null; memberCount: number; members: RoomMemberInfo[] }) => {
      const guests = info.members.filter((m) => m.role === 'guest')
      setGuestCount(guests.length)
      info.members.forEach((m) => participantsSetRef.current.add(m.name))
      if (info.active && audioManagerRef.current && roomHostRef.current) {
        const geminiTrack = audioManagerRef.current.createGeminiBroadcastTrack()
        if (geminiTrack) {
          mixerRef.current.setGeminiOutputTrackId(geminiTrack.id)
          void roomHostRef.current.publishGeminiAudioTrack(geminiTrack).catch(() => {})
        }
      }
    },
    [],
  )

  const handleGuestJoined = useCallback((member: RoomMemberInfo) => {
    participantsSetRef.current.add(member.name)
    setRoomPrivacyShown(true)
  }, [])

  const handleGuestLeft = useCallback(
    (identity: string) => {
      audioManagerRef.current?.detachRemoteAudioTrack(identity)
      mixerRef.current.removeSource(identity)
      const res = transitionCameraHandoff(
        handoffStateRef.current,
        { type: 'GUEST_LEFT', guestId: identity },
        { allowGuestCamera: allowGuestCameraRef.current, hostCameraOff: videoPausedRef.current },
      )
      applyHandoffResult(res)
    },
    [applyHandoffResult],
  )

  const handleRemoteAudioTrack = useCallback(
    (identity: string, name: string, track: MediaStreamTrack | null) => {
      if (!track) {
        audioManagerRef.current?.detachRemoteAudioTrack(identity)
        mixerRef.current.removeSource(identity)
        return
      }
      const added = mixerRef.current.addSource({ id: identity, name, trackId: track.id })
      if (!added) return
      audioManagerRef.current?.attachRemoteAudioTrack(identity, track, (pcm) => {
        const now = Date.now()
        const res = mixerRef.current.processSourceFrame(identity, pcm, now)
        if (res.activeSourceIds.length > 0) {
          lastGateActiveAtRef.current = now
        }
        if (res.anySpeechStarted) {
          turnCtrlRef.current?.onUserSpeechStart()
        }
        for (const frame of res.framesToSend) {
          clientRef.current?.sendAudio(frame)
        }
        if (res.anySpeechEnded) {
          lastEndedSpeechMsRef.current = res.endedSpeechDurationMs
          const committed = transcriptRef.current.commitUserTurn(res.endedSpeechDurationMs)
          if (committed && isMountedRef.current) {
            setCaptions(transcriptRef.current.getTurns())
            const payload = buildCaptionBroadcast({
              id: committed.id,
              speaker: committed.who,
              lang: committed.speakerLang || resolvedLang,
              text: committed.text,
              ts: committed.ts,
              kind: 'input',
            })
            if (payload) roomHostRef.current?.broadcastData(payload as unknown as Record<string, unknown>, true)
          }
          turnCtrlRef.current?.onUserSpeechEnd(committed?.text || null)
        }
      })
    },
    [resolvedLang],
  )

  const handleRemoteVideoTrack = useCallback((_identity: string, _name: string, track: RemoteTrack | null) => {
    activeGuestVideoTrackRef.current = track
    const el = remoteGuestVideoRef.current
    if (!el) return
    if (!track) {
      el.srcObject = null
      return
    }
    track.attach(el)
    el.muted = true
    el.playsInline = true
    el.autoplay = true
    void el.play().catch(() => {})
  }, [])

  const handleRoomDataMessage = useCallback(
    (payload: Record<string, unknown>, sender: RoomMemberInfo | null) => {
      if (!sender) return
      if (payload.type === 'camera_request') {
        const guestName = typeof payload.name === 'string' && payload.name.trim() ? payload.name.trim() : sender.name
        const res = transitionCameraHandoff(
          handoffStateRef.current,
          { type: 'GUEST_REQUEST', guestId: sender.identity, guestName },
          { allowGuestCamera: allowGuestCameraRef.current, hostCameraOff: videoPausedRef.current },
        )
        applyHandoffResult(res)
      } else if (payload.type === 'camera_release') {
        const res = transitionCameraHandoff(
          handoffStateRef.current,
          { type: 'GUEST_RELEASE', guestId: sender.identity },
          { allowGuestCamera: allowGuestCameraRef.current, hostCameraOff: videoPausedRef.current },
        )
        applyHandoffResult(res)
      }
    },
    [applyHandoffResult],
  )

  const handleFreezeAndAsk = useCallback(() => {
    idleGuardRef.current?.recordActivity()
    const prevDetent = sheetDetent
    if (isLiveSheetOpen && sheetDetent !== 'collapsed') {
      setSheetDetent('collapsed')
    }
    captureCurrentPage((page, pageNum) => {
      showToast((t.relayPageAdded || 'Page {n} added').replace('{n}', String(pageNum)))
      broadcastPinnedPage(page, pageNum)
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
  }, [broadcastPinnedPage, captureCurrentPage, isLiveSheetOpen, sheetDetent, showToast, t.relayPageAdded])

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
        broadcastPinnedPage(page, pageNum)
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
  }, [broadcastPinnedPage, captureCurrentPage, sheetDetent, showToast, t.relayMaxPagesReached, t.relayPageAdded])

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
  const orbState = deriveGeminiOrbState({
    isSpeaking: isSpeaking || turnSnapshot.state === 'modelSpeaking',
    isThinking: isThinking || turnSnapshot.state === 'thinking',
    isLive,
  })
  const statusLabel =
    isReconnecting || turnSnapshot.state === 'reconnecting'
      ? t.relayStatusReconnecting
      : isLive
        ? t.relayStatusLive
        : t.relayStatusConnecting
  const statusDotClass =
    isReconnecting || turnSnapshot.state === 'reconnecting'
      ? 'rc-status-dot-reconnecting'
      : isLive
        ? 'rc-status-dot-live'
        : 'rc-status-dot-connecting'
  const orbLabel =
    turnSnapshot.state === 'userSpeaking'
      ? t.relayListeningYou || 'Listening to you…'
      : turnSnapshot.state === 'thinking' && turnSnapshot.stillThinking
        ? t.relayStillThinking || 'Still thinking…'
        : orbState === 'speaking'
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
        data-turn-state={turnSnapshot.state}
        data-frames-sent={framesSent}
        data-video-paused={videoPaused ? 'true' : 'false'}
      >
        {/* Video Viewport (Host camera + full-screen Guest camera during handoff) */}
        <video
          ref={videoRef}
          data-testid="relay-camera-video"
          className="rc-video"
          playsInline
          muted
          autoPlay
          style={{
            transform: isFront ? 'scaleX(-1)' : 'none',
            opacity: handoffState.kind === 'guestCamera' ? 0 : mode === 'live' && videoPaused ? 0.35 : 1,
            transition: 'opacity 0.2s ease',
          }}
        />
        {handoffState.kind === 'guestCamera' && (
          <video
            ref={remoteGuestVideoRef}
            data-testid="relay-active-guest-video"
            className="rc-video"
            playsInline
            muted
            autoPlay
            style={{ zIndex: 2 }}
          />
        )}
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
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
              <RoomHost
                ref={roomHostRef}
                lang={resolvedLang}
                getMediaStream={() => activeStreamRef.current}
                t={t}
                onRoomActiveChange={handleRoomActiveChange}
                onGuestJoined={handleGuestJoined}
                onGuestLeft={handleGuestLeft}
                onRemoteAudioTrack={handleRemoteAudioTrack}
                onRemoteVideoTrack={handleRemoteVideoTrack}
                onActiveSpeakersChanged={(speakers) => speakerTrackerRef.current?.updateActiveSpeakers(speakers)}
                onDataMessage={handleRoomDataMessage}
                onAllowGuestCameraChange={(allowed) => {
                  allowGuestCameraRef.current = allowed
                }}
              />
              {roomPrivacyShown && guestCount > 0 && (
                <span
                  data-testid="relay-room-privacy-banner"
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    padding: '4px 10px',
                    borderRadius: 12,
                    background: 'rgba(14,14,14,0.78)',
                    border: '1px solid rgba(255,255,255,0.2)',
                    color: '#F5F4F2',
                    fontSize: 11.5,
                    fontWeight: 600,
                  }}
                >
                  {t.relayRoomPrivacyBanner || 'Everyone in the room can see the camera'}
                </span>
              )}
              {handoffState.kind === 'guestCamera' && (
                <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span
                    data-testid="relay-active-camera-chip"
                    style={{
                      padding: '5px 12px',
                      borderRadius: 999,
                      background: '#E3B660',
                      color: '#1B1B1B',
                      fontSize: 12.5,
                      fontWeight: 700,
                    }}
                  >
                    {(t.relayShowingCamera || "{name}'s camera").replace('{name}', handoffState.guestName)}
                  </span>
                  <button
                    type="button"
                    data-testid="relay-take-back-camera-btn"
                    onClick={() => {
                      const res = transitionCameraHandoff(
                        handoffStateRef.current,
                        { type: 'HOST_TAKE_BACK' },
                        { allowGuestCamera: allowGuestCameraRef.current, hostCameraOff: videoPausedRef.current },
                      )
                      applyHandoffResult(res)
                    }}
                    style={{
                      minHeight: 44,
                      padding: '0 12px',
                      borderRadius: 999,
                      border: '1.5px solid #F5F4F2',
                      background: 'rgba(27,27,27,0.88)',
                      color: '#F5F4F2',
                      fontSize: 12.5,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t.relayTakeBackCamera || 'Take back camera'}
                  </button>
                </div>
              )}
              {handoffState.kind === 'requested' && (
                <div
                  data-testid="relay-camera-request-banner"
                  style={{
                    pointerEvents: 'auto',
                    background: '#F4F5F2',
                    color: '#1B1B1B',
                    borderRadius: 16,
                    border: '2px solid #1B1B1B',
                    padding: '10px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 8,
                    maxWidth: 250,
                  }}
                >
                  <div style={{ fontSize: 13, fontWeight: 700 }}>
                    {(t.relayCameraRequestText || '{name} wants to show their camera').replace('{name}', handoffState.guestName)}
                  </div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button
                      type="button"
                      data-testid="relay-camera-allow-btn"
                      onClick={() => {
                        const res = transitionCameraHandoff(
                          handoffStateRef.current,
                          { type: 'HOST_ALLOW' },
                          { allowGuestCamera: allowGuestCameraRef.current, hostCameraOff: videoPausedRef.current },
                        )
                        applyHandoffResult(res)
                      }}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 999,
                        border: 0,
                        background: '#214D47',
                        color: '#F5F4F2',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {t.relayAllowCamera || 'Allow'}
                    </button>
                    <button
                      type="button"
                      data-testid="relay-camera-deny-btn"
                      onClick={() => {
                        const res = transitionCameraHandoff(
                          handoffStateRef.current,
                          { type: 'HOST_DENY' },
                          { allowGuestCamera: allowGuestCameraRef.current, hostCameraOff: videoPausedRef.current },
                        )
                        applyHandoffResult(res)
                      }}
                      style={{
                        flex: 1,
                        minHeight: 44,
                        borderRadius: 999,
                        border: '1.5px solid #1B1B1B',
                        background: 'transparent',
                        color: '#1B1B1B',
                        fontSize: 13,
                        fontWeight: 700,
                        cursor: 'pointer',
                      }}
                    >
                      {t.relayNotNow || 'Not now'}
                    </button>
                  </div>
                </div>
              )}
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
                <div style={{ pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <button
                    type="button"
                    data-testid="relay-pinned-badge"
                    onClick={() => openPageViewer(pages.length - 1)}
                    aria-label={(t.relayOpenPageN || 'Open page {n}').replace('{n}', String(pages.length))}
                    style={{
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
                  <button
                    type="button"
                    data-testid="relay-fill-form-chip"
                    onClick={() => {
                      openFormFill(
                        pages.map((p) => p.dataUrl),
                        { isInRoom: roomHostRef.current?.isInRoom() ?? false },
                      )
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      minHeight: 44,
                      padding: '4px 12px',
                      borderRadius: 22,
                      background: '#E3B660',
                      border: '1.5px solid #1B1B1B',
                      color: '#1B1B1B',
                      fontSize: 13,
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    {t.relayFillAForm || 'Fill a form'}
                  </button>
                </div>
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

        {/* Watchdog 20s No-Answer Card with Retry */}
        {noAnswerError && !relayError && (
          <div
            role="alert"
            data-testid="relay-no-answer-card"
            style={{
              position: 'absolute',
              inset: 0,
              zIndex: 68,
              background: 'rgba(14, 14, 14, 0.78)',
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
                background: '#F4F5F2',
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
                {t.relayNoAnswerTitle || 'Gemini did not answer'}
              </h2>
              <p style={{ margin: 0, fontSize: 15, lineHeight: 1.45, color: '#3D3B37' }}>
                {t.relayNoAnswerBody || 'Gemini did not answer. Try again.'}
              </p>
              <button
                type="button"
                data-testid="relay-no-answer-retry"
                onClick={() => {
                  setNoAnswerError(false)
                  turnCtrlRef.current?.resetToIdle()
                  void clientRef.current?.reconnectWithResumption?.().catch(() => {})
                }}
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
            </div>
          </div>
        )}

        {/* Dev Debug Overlay (?debug=1 only) */}
        {debugEnabled && debugGateMetrics && (
          <RelayDebugOverlay turn={turnSnapshot} gate={debugGateMetrics} />
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
            setNoAnswerError(false)
            transcriptRef.current.addTypedUserTurn(text)
            setCaptions(transcriptRef.current.getTurns())
            turnCtrlRef.current?.onUserTextSent(text)
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
