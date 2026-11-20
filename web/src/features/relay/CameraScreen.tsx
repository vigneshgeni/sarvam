/**
 * CameraScreen — Full-screen Live Relay camera.
 *
 * Implements:
 * - Full-screen camera with flip button (facingMode user & environment)
 * - Preview mirrored only on front camera; Gemini frames unmirrored
 * - Host defaults to back camera (environment)
 * - Shutter with page stack (max 10, JPEG long edge 1600 px, in-memory)
 * - Thumbnail stack with coral count badge
 * - Mic mode toggle (open mic / hold to talk)
 * - LiveSheet integration over camera
 * - On Proceed: sends pinned pages + streams 1 fps at 768 px
 * - Friendly permission and connection error messages
 * - Clean production UI (no spike debug chips)
 */

import { useState, useRef, useCallback, useEffect } from 'react'
import { FirebaseLiveClient } from './live/FirebaseLiveClient.js'
import { LiveAudioManager } from './audio/LiveAudioManager.js'
import { stripSpeakerNotes } from './live/relayPrompt.js'
import { addPageToStack, calculateLongEdgeDimensions, type CapturedPage, MAX_PAGE_STACK_COUNT } from './pageStack.js'
import LiveSheet from './LiveSheet.js'
import type { CaptionTurn } from './RelaySpikeScreen.js'

interface CameraScreenProps {
  onClose: () => void
  lang?: string
}

export default function CameraScreen({ onClose }: CameraScreenProps) {
  // Camera state
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('environment')
  const [cameraReady, setCameraReady] = useState(false)
  const [cameraError, setCameraError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)

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
  const [sessionError, setSessionError] = useState<string | null>(null)

  // Audio / Mic controls
  const [micMode, setMicMode] = useState<'vad' | 'hold'>('vad')
  const [isMuted, setIsMuted] = useState(false)
  const [isHoldingTalk, setIsHoldingTalk] = useState(false)

  // DOM & Manager refs
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const clientRef = useRef<FirebaseLiveClient | null>(null)
  const audioManagerRef = useRef<LiveAudioManager | null>(null)
  const fpsIntervalRef = useRef<number | null>(null)

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

  // ── Camera Initialization & Flip ───────────────────────────────────

  const startCamera = useCallback(async (facing: 'user' | 'environment') => {
    setCameraError(null)
    setCameraReady(false)

    // Stop existing video tracks
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width: { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      })

      if (videoRef.current) {
        videoRef.current.srcObject = stream
        await videoRef.current.play()
        setCameraReady(true)
      }
    } catch (err: unknown) {
      console.error('[CameraScreen] getUserMedia failed', err)
      const errorName = (err as { name?: string })?.name || ''
      if (errorName === 'NotAllowedError' || errorName === 'PermissionDeniedError') {
        setCameraError('Camera access was denied. Please allow camera permissions in your browser settings.')
      } else if (errorName === 'NotFoundError' || errorName === 'DevicesNotFoundError') {
        setCameraError('No camera device found.')
      } else {
        setCameraError('Unable to start camera. Please verify device camera settings.')
      }
    }
  }, [])

  useEffect(() => {
    void startCamera(facingMode)
    return () => {
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream
        stream.getTracks().forEach((track) => track.stop())
      }
    }
  }, [facingMode, startCamera])

  const handleFlipCamera = () => {
    const nextFacing = facingMode === 'environment' ? 'user' : 'environment'
    setFacingMode(nextFacing)
  }

  // ── Audio & LiveClient Lifecycle ───────────────────────────────────

  const initLiveClient = useCallback(async () => {
    if (clientRef.current) return clientRef.current

    setIsConnecting(true)
    setSessionError(null)

    const client = new FirebaseLiveClient()
    clientRef.current = client

    const audioManager = new LiveAudioManager()
    audioManagerRef.current = audioManager

    // Forward mic audio respecting micMode & hold-to-talk
    await audioManager.start((pcm) => {
      if (micModeRef.current === 'vad') {
        if (!isMutedRef.current) {
          client.sendAudio(pcm)
        }
      } else {
        // Hold to talk
        if (isHoldingTalkRef.current) {
          client.sendAudio(pcm)
        }
      }
    })

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
          prev.map((c) => (c.id === turnId ? { ...c, isComplete: true, text: c.text ? `${c.text} ⚡` : '⚡' } : c)),
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
    }

    client.onReconnected = () => {
      setIsReconnecting(false)
    }

    try {
      await client.connect()
      setIsLive(true)
      setIsConnecting(false)
      setIsUsingFallback(client.getIsUsingFallback())
      setFallbackModelName(client.getActiveModel())
      return client
    } catch (err: unknown) {
      setIsConnecting(false)
      const raw = err instanceof Error ? err.message : String(err)
      console.error('[CameraScreen] Connect failed', err)
      setSessionError(`Live connection failed: ${raw}`)
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
          blob.arrayBuffer().then((buf) => {
            client.sendFrame(buf)
          })
        },
        'image/jpeg',
        0.7,
      )
    }, 1000)
  }, [])

  const handleProceed = useCallback(async () => {
    try {
      const client = await initLiveClient()
      setIsLiveSheetOpen(true)

      // Send each pinned page as a still
      for (let i = 0; i < pages.length; i++) {
        const p = pages[i]
        const buf = await p.blob.arrayBuffer()
        client.sendFrame(buf)
        client.sendText(`Pinned page ${i + 1}`, true)
      }

      // Start 1 fps video streaming loop over the live camera
      startFpsVideoLoop(client)
    } catch (err) {
      console.error('[CameraScreen] Proceed failed to start Live', err)
    }
  }, [initLiveClient, pages, startFpsVideoLoop])

  // ── Cleanup on Close ───────────────────────────────────────────────

  const handleClose = useCallback(async () => {
    if (fpsIntervalRef.current) {
      window.clearInterval(fpsIntervalRef.current)
      fpsIntervalRef.current = null
    }
    if (clientRef.current) {
      await clientRef.current.close()
      clientRef.current = null
    }
    if (audioManagerRef.current) {
      await audioManagerRef.current.stop()
      audioManagerRef.current = null
    }
    if (videoRef.current?.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream
      stream.getTracks().forEach((track) => track.stop())
      videoRef.current.srcObject = null
    }
    onClose()
  }, [onClose])

  useEffect(() => {
    return () => {
      void handleClose()
    }
  }, [handleClose])

  const hasPages = pages.length > 0
  const isFront = facingMode === 'user'

  return (
    <div
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
        playsInline
        muted
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
          onClick={handleClose}
          aria-label="Close camera"
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
          {hasPages ? `${pages.length} page${pages.length > 1 ? 's' : ''} · add more or Proceed` : 'Fit the page in the frame'}
        </span>

        {/* Flip Camera Button */}
        <button
          type="button"
          onClick={handleFlipCamera}
          aria-label="Flip camera"
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

      {/* Camera permission error banner */}
      {cameraError && (
        <div
          style={{
            position: 'relative',
            zIndex: 30,
            margin: '20px 16px',
            padding: 16,
            borderRadius: 16,
            background: 'rgba(229, 83, 61, 0.95)',
            color: '#fff',
            fontSize: 14,
            lineHeight: 1.4,
          }}
        >
          {cameraError}
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
        {/* Left: Thumbnail stack (when hasPages) OR Mic mode toggle (when noPages) */}
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
          onClick={handleCapture}
          disabled={!cameraReady || pages.length >= MAX_PAGE_STACK_COUNT}
          aria-label="Capture this page"
          style={{
            width: 76,
            height: 76,
            borderRadius: 38,
            border: '4px solid #F5F4F2',
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: pages.length >= MAX_PAGE_STACK_COUNT ? 'not-allowed' : 'pointer',
            opacity: pages.length >= MAX_PAGE_STACK_COUNT ? 0.4 : 1,
          }}
        >
          <span style={{ width: 60, height: 60, borderRadius: 30, background: '#F5F4F2' }} />
        </button>

        {/* Right: "End" (when noPages) OR "Proceed" (when hasPages) */}
        <div style={{ width: 92, display: 'flex', justifyContent: 'flex-end' }}>
          {hasPages ? (
            <button
              type="button"
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
              {isConnecting ? 'Starting…' : 'Proceed'}
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.6}>
                <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={handleClose}
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
              End
            </button>
          )}
        </div>
      </div>

      {/* LiveSheet Over Camera */}
      <LiveSheet
        isOpen={isLiveSheetOpen}
        isLive={isLive}
        isSpeaking={isSpeaking}
        isReconnecting={isReconnecting}
        isUsingFallback={isUsingFallback}
        fallbackModelName={fallbackModelName}
        captions={captions}
        errorMsg={sessionError || undefined}
        onSendText={(text) => {
          clientRef.current?.sendText(text, true)
        }}
        onEnd={handleClose}
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
