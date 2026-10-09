import { useState, useEffect, useRef } from 'react'
import type { ExplainResponse } from '../types'
import Sheet from './Sheet'
import {
  PlayIcon,
  PauseIcon,
  ReplayIcon,
  CloseIcon,
  AlertTriangleIcon,
} from './icons'
import {
  buildQuickSummaryScript,
  buildSpokenText,
  splitIntoUtteranceChunks,
  findVoiceForLanguage,
  logTargetVoices,
} from '../utils/speech'
import { speakText } from '../api'

interface ListenSheetProps {
  isOpen: boolean
  onClose: () => void
  result: ExplainResponse
  lang: string
  t: Record<string, string>
}

// 1-sample silent WAV data URI to unlock iOS audio context synchronously
const SILENT_WAV_URI =
  'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA'

export default function ListenSheet({
  isOpen,
  onClose,
  result,
  lang,
  t,
}: ListenSheetProps) {
  const [mode, setMode] = useState<'quick' | 'full'>('quick')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [engine, setEngine] = useState<'server' | 'device' | null>(null)
  const [usingDeviceNote, setUsingDeviceNote] = useState(false)
  const [noVoiceWarning, setNoVoiceWarning] = useState(false)

  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [speed, setSpeed] = useState<number>(1.0)
  const [gender, setGender] = useState<'female' | 'male'>(() => {
    try {
      return (localStorage.getItem('sarvam.voice') as 'female' | 'male') || 'female'
    } catch {
      return 'female'
    }
  })

  // Script chunks
  const [chunks, setChunks] = useState<string[]>([])

  // Audio elements & Web Audio refs
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const currentBlobUrlRef = useRef<string | null>(null)
  const prefetchedBlobsRef = useRef<Map<number, Blob>>(new Map())
  const activeControllerRef = useRef<AbortController | null>(null)

  // Device voice speech synthesis refs
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([])
  const isSpeakingRef = useRef<boolean>(false)

  // Visualizer bar values (32 bars)
  const [barHeights, setBarHeights] = useState<number[]>(() => new Array(32).fill(12))

  // Initialize audio element once
  useEffect(() => {
    if (!audioElRef.current) {
      const audio = new Audio()
      audio.preload = 'auto'
      audioElRef.current = audio
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      synthRef.current = window.speechSynthesis
      const loadVoices = () => {
        const v = window.speechSynthesis.getVoices()
        availableVoicesRef.current = v
        logTargetVoices(v)
      }
      loadVoices()
      window.speechSynthesis.onvoiceschanged = loadVoices
    }

    return () => {
      stopAllAudio()
    }
  }, [])

  // Stop audio on pagehide or unmount
  useEffect(() => {
    const handlePageHide = () => stopAllAudio()
    window.addEventListener('pagehide', handlePageHide)
    return () => {
      window.removeEventListener('pagehide', handlePageHide)
      stopAllAudio()
    }
  }, [])

  // Stop audio on language change
  useEffect(() => {
    stopAllAudio()
  }, [lang])

  // Prepare chunks when result or mode changes
  useEffect(() => {
    const script =
      mode === 'quick'
        ? buildQuickSummaryScript(result, lang)
        : buildSpokenText(result)
    const sentences = splitIntoUtteranceChunks(script, 160)
    setChunks(sentences.length > 0 ? sentences : [script])
    setCurrentChunkIndex(0)
    setPlaybackProgress(0)
    stopAllAudio()
  }, [result, mode, lang])

  // Stop all audio helper
  const stopAllAudio = () => {
    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
      activeControllerRef.current = null
    }
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current.removeAttribute('src')
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current)
      currentBlobUrlRef.current = null
    }
    prefetchedBlobsRef.current.clear()
    if (synthRef.current) {
      synthRef.current.cancel()
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    isSpeakingRef.current = false
    setIsPlaying(false)
    setIsBuffering(false)
  }

  // Handle Sheet Close
  const handleClose = () => {
    stopAllAudio()
    onClose()
  }

  // Setup Web Audio Analyser once
  const initWebAudio = () => {
    if (!audioElRef.current) return
    try {
      if (!audioContextRef.current) {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext
        audioContextRef.current = new AudioCtx()
      }
      if (audioContextRef.current.state === 'suspended') {
        audioContextRef.current.resume()
      }
      if (!sourceNodeRef.current && audioContextRef.current) {
        analyserRef.current = audioContextRef.current.createAnalyser()
        analyserRef.current.fftSize = 64
        sourceNodeRef.current = audioContextRef.current.createMediaElementSource(
          audioElRef.current
        )
        sourceNodeRef.current.connect(analyserRef.current)
        analyserRef.current.connect(audioContextRef.current.destination)
      }
    } catch {
      // AudioContext policy fallback
    }
  }

  // Animation loop for waveform
  const startVisualizer = (isServer: boolean) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)

    const updateWaveform = () => {
      if (!isPlaying) {
        // Gentle idle wave when paused
        setBarHeights((prev) =>
          prev.map((_, i) => 10 + Math.sin(Date.now() / 300 + i * 0.3) * 4)
        )
      } else if (isServer && analyserRef.current) {
        const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(dataArray)
        const heights: number[] = []
        for (let i = 0; i < 32; i++) {
          const bin = dataArray[i % dataArray.length] || 0
          heights.push(Math.max(8, (bin / 255) * 44))
        }
        setBarHeights(heights)
      } else {
        // Simulated voice wave for device synthesis
        setBarHeights((prev) =>
          prev.map((_, i) => 12 + Math.abs(Math.sin(Date.now() / 150 + i * 0.4)) * 32)
        )
      }

      animFrameRef.current = requestAnimationFrame(updateWaveform)
    }

    animFrameRef.current = requestAnimationFrame(updateWaveform)
  }

  // Play chunk sequentially
  const playChunk = async (chunkIdx: number) => {
    if (chunkIdx >= chunks.length) {
      stopAllAudio()
      setCurrentChunkIndex(0)
      setPlaybackProgress(1)
      return
    }

    setCurrentChunkIndex(chunkIdx)
    setPlaybackProgress(chunkIdx / chunks.length)
    setIsBuffering(true)

    const text = chunks[chunkIdx]

    // 1. Try Server TTS via POST /api/speak
    try {
      const controller = new AbortController()
      activeControllerRef.current = controller

      let blob: Blob
      if (prefetchedBlobsRef.current.has(chunkIdx)) {
        blob = prefetchedBlobsRef.current.get(chunkIdx)!
        prefetchedBlobsRef.current.delete(chunkIdx)
      } else {
        blob = await speakText({
          text,
          lang,
          voice: gender,
          rate: speed,
          signal: controller.signal,
        })
      }

      setEngine('server')
      setUsingDeviceNote(false)
      setIsBuffering(false)

      if (currentBlobUrlRef.current) {
        URL.revokeObjectURL(currentBlobUrlRef.current)
      }
      const blobUrl = URL.createObjectURL(blob)
      currentBlobUrlRef.current = blobUrl

      const audio = audioElRef.current
      if (!audio) return

      audio.src = blobUrl
      audio.playbackRate = speed
      initWebAudio()
      await audio.play()
      setIsPlaying(true)
      startVisualizer(true)

      // Set mediaSession
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Sarvam Audio',
          artist: result.title || 'Document',
        })
        navigator.mediaSession.setActionHandler('play', () => audio.play())
        navigator.mediaSession.setActionHandler('pause', () => audio.pause())
      }

      // Prefetch next chunk in background
      if (chunkIdx + 1 < chunks.length) {
        speakText({
          text: chunks[chunkIdx + 1],
          lang,
          voice: gender,
          rate: speed,
        })
          .then((b) => prefetchedBlobsRef.current.set(chunkIdx + 1, b))
          .catch(() => {})
      }

      audio.onended = () => {
        playChunk(chunkIdx + 1)
      }
    } catch {
      // 2. Server audio failed or took > 8s: Fallback to device voice
      setEngine('device')
      setUsingDeviceNote(true)
      setIsBuffering(false)

      if (!synthRef.current) {
        setNoVoiceWarning(true)
        return
      }

      const voice = findVoiceForLanguage(availableVoicesRef.current, lang)
      if (!voice) {
        setNoVoiceWarning(true)
        return
      }

      setNoVoiceWarning(false)
      synthRef.current.cancel()

      const utter = new SpeechSynthesisUtterance(text)
      utter.voice = voice
      utter.lang = voice.lang
      utter.rate = speed

      utter.onstart = () => {
        setIsPlaying(true)
        isSpeakingRef.current = true
        startVisualizer(false)
      }

      utter.onend = () => {
        isSpeakingRef.current = false
        playChunk(chunkIdx + 1)
      }

      utter.onerror = () => {
        isSpeakingRef.current = false
        stopAllAudio()
      }

      synthRef.current.speak(utter)
    }
  }

  // Handle Play/Pause
  const handleTogglePlay = () => {
    // Unlock audio context on user gesture (iOS Safari requirement)
    if (!audioElRef.current) {
      audioElRef.current = new Audio()
    }
    audioElRef.current.src = SILENT_WAV_URI
    audioElRef.current.play().catch(() => {})

    if (isPlaying) {
      if (engine === 'server' && audioElRef.current) {
        audioElRef.current.pause()
      } else if (engine === 'device' && synthRef.current) {
        synthRef.current.pause()
      }
      setIsPlaying(false)
    } else {
      if (engine === 'server' && audioElRef.current?.src && audioElRef.current.src !== SILENT_WAV_URI) {
        audioElRef.current.play().then(() => setIsPlaying(true))
      } else if (engine === 'device' && synthRef.current?.paused) {
        synthRef.current.resume()
        setIsPlaying(true)
      } else {
        playChunk(currentChunkIndex)
      }
    }
  }

  const handleReplay10s = () => {
    if (engine === 'server' && audioElRef.current) {
      audioElRef.current.currentTime = Math.max(0, audioElRef.current.currentTime - 10)
    } else {
      // Go back one chunk
      const prev = Math.max(0, currentChunkIndex - 1)
      playChunk(prev)
    }
  }

  const handleSpeedSelect = (s: number) => {
    setSpeed(s)
    if (audioElRef.current) {
      audioElRef.current.playbackRate = s
    }
  }

  const handleGenderToggle = (g: 'female' | 'male') => {
    setGender(g)
    try {
      localStorage.setItem('sarvam.voice', g)
    } catch {}
    // If playing, restart chunk with new voice
    if (isPlaying) {
      stopAllAudio()
      setTimeout(() => playChunk(currentChunkIndex), 100)
    }
  }

  const currentSentence = chunks[currentChunkIndex] || ''
  const nextSentence = chunks[currentChunkIndex + 1] || ''

  return (
    <Sheet
      isOpen={isOpen}
      onClose={handleClose}
      title={t.listenBtnLabel || 'Listen'}
      maxHeight="max-h-[92vh]"
    >
      <div className="flex flex-col gap-5 pt-1">
        {/* Top Header Mode Switcher */}
        <div className="flex items-center justify-between">
          <div className="bg-[#F0F0EB] p-1 rounded-xl flex items-center">
            <button
              type="button"
              onClick={() => {
                setMode('quick')
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'quick'
                  ? 'bg-white text-[#15171A] shadow-sm'
                  : 'text-[#5E636B] hover:text-[#15171A]'
              }`}
            >
              {t.quickSummary || 'Quick summary'}
            </button>
            <button
              type="button"
              onClick={() => {
                setMode('full')
              }}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
                mode === 'full'
                  ? 'bg-white text-[#15171A] shadow-sm'
                  : 'text-[#5E636B] hover:text-[#15171A]'
              }`}
            >
              {t.fullDetails || 'Full details'}
            </button>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="p-2 text-[#5E636B] hover:text-[#15171A] rounded-full hover:bg-[#F0F0EB] transition-colors"
            aria-label={t.close || 'Close'}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Device voice subtle note or warning banner */}
        {usingDeviceNote && (
          <div className="text-center text-xs text-[#5E636B] bg-[#FBF7EF] py-1 px-3 rounded-md border border-[#F1EBDD]">
            {t.usingDeviceVoice || 'Using device voice'}
          </div>
        )}
        {noVoiceWarning && (
          <div className="bg-[#FFF4DE] border border-[#F4DDB0] rounded-xl p-3 flex items-center gap-2 text-xs text-[#5A3500]">
            <AlertTriangleIcon className="w-4 h-4 text-[#C2410C] shrink-0" />
            <span>{t.noVoiceError || 'No voice for this language on this device'}</span>
          </div>
        )}

        {/* 32-Bar Animated Waveform */}
        <div className="w-full h-16 bg-[#FBF7EF] border border-[#F1EBDD] rounded-2xl p-3 flex items-center justify-between gap-1 overflow-hidden">
          {barHeights.map((h, i) => {
            const playedRatio = Math.max(playbackProgress, currentChunkIndex / Math.max(1, chunks.length))
            const isPlayed = i / 32 <= playedRatio

            return (
              <div
                key={i}
                className="flex-1 rounded-full transition-all duration-75"
                style={{
                  height: `${h}px`,
                  background: isPlayed
                    ? 'linear-gradient(180deg, #5B52D6 0%, #C2410C 100%)'
                    : '#D8D4EF',
                  opacity: isPlayed ? 1 : 0.45,
                }}
              />
            )
          })}
        </div>

        {/* Live Captions */}
        <div className="flex flex-col gap-1.5 min-h-[90px] justify-center px-1">
          <p className="text-base font-medium text-[#15171A] leading-relaxed">
            {currentSentence}
          </p>
          {nextSentence && (
            <p className="text-xs text-[#5E636B]/60 line-clamp-1 leading-normal">
              {nextSentence}
            </p>
          )}
        </div>

        {/* Player Controls */}
        <div className="flex flex-col gap-4 pt-1">
          {/* Main Controls Row */}
          <div className="flex items-center justify-center gap-6">
            {/* Replay 10s */}
            <button
              type="button"
              onClick={handleReplay10s}
              className="btn-press p-3 text-[#5E636B] hover:text-[#15171A] hover:bg-[#F0F0EB] rounded-full transition-colors"
              aria-label={t.replay10s || 'Replay 10 seconds'}
            >
              <ReplayIcon className="w-6 h-6" />
            </button>

            {/* Big Play/Pause Button */}
            <button
              type="button"
              onClick={handleTogglePlay}
              className="btn-press w-16 h-16 rounded-full bg-[#1E1838] text-white flex items-center justify-center shadow-lg hover:bg-[#2F2656] transition-colors"
              aria-label={isPlaying ? t.pause || 'Pause' : t.play || 'Play'}
            >
              {isBuffering ? (
                <div className="w-6 h-6 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : isPlaying ? (
                <PauseIcon className="w-7 h-7" />
              ) : (
                <PlayIcon className="w-7 h-7 ml-0.5" />
              )}
            </button>

            {/* Voice Gender Toggle */}
            <div className="flex items-center bg-[#F0F0EB] p-1 rounded-xl">
              <button
                type="button"
                onClick={() => handleGenderToggle('female')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  gender === 'female' ? 'bg-white text-[#15171A] shadow-sm' : 'text-[#5E636B]'
                }`}
              >
                {t.voiceFemale || 'Female'}
              </button>
              <button
                type="button"
                onClick={() => handleGenderToggle('male')}
                className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors ${
                  gender === 'male' ? 'bg-white text-[#15171A] shadow-sm' : 'text-[#5E636B]'
                }`}
              >
                {t.voiceMale || 'Male'}
              </button>
            </div>
          </div>

          {/* Speed Chips Row */}
          <div className="flex items-center justify-center gap-2 pt-1">
            <span className="text-xs text-[#5E636B] mr-1">{t.speed || 'Speed'}:</span>
            {[0.9, 1.0, 1.15].map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => handleSpeedSelect(s)}
                className={`px-3 py-1 rounded-lg text-xs font-semibold transition-colors ${
                  speed === s
                    ? 'bg-[#1E1838] text-white'
                    : 'bg-[#F0F0EB] text-[#5E636B] hover:text-[#15171A]'
                }`}
              >
                {s}x
              </button>
            ))}
          </div>
        </div>
      </div>
    </Sheet>
  )
}
