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
  prepareTextForSpeech,
  splitIntoUtteranceChunks,
  findVoiceForLanguage,
  logTargetVoices,
} from '../utils/speech'
import { speakText } from '../api'
import { resolveLang } from '../i18n'

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

const BAR_COUNT = 35
const RESTING_BARS = Array.from({ length: BAR_COUNT }, (_, index) =>
  8 + Math.round((Math.sin(index * 1.7) + 1) * 2)
)

export default function ListenSheet({
  isOpen,
  onClose,
  result,
  lang,
  t,
}: ListenSheetProps) {
  const concreteLang = resolveLang(lang)
  const [mode, setMode] = useState<'quick' | 'full'>('quick')
  const [isPlaying, setIsPlaying] = useState(false)
  const [isBuffering, setIsBuffering] = useState(false)
  const [engine, setEngine] = useState<'server' | 'device' | null>(null)
  const [usingDeviceNote, setUsingDeviceNote] = useState(false)
  const [noVoiceWarning, setNoVoiceWarning] = useState(false)

  const [currentChunkIndex, setCurrentChunkIndex] = useState(0)
  const [playbackProgress, setPlaybackProgress] = useState(0)
  const [seekPreview, setSeekPreview] = useState<number | null>(null)
  const [speed, setSpeed] = useState<number>(1.0)
  const selectedSpeedRef = useRef(1.0)
  const [gender, setGender] = useState<'female' | 'male'>(() => {
    try {
      return (localStorage.getItem('sarvam.voice') as 'female' | 'male') || 'female'
    } catch {
      return 'female'
    }
  })
  const selectedGenderRef = useRef(gender)

  // Script chunks
  const [chunks, setChunks] = useState<string[]>([])

  // Audio elements & Web Audio refs
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const currentBlobUrlRef = useRef<string | null>(null)
  const cachedBlobsRef = useRef<Map<number, Blob>>(new Map())
  const chunkDurationsRef = useRef<Map<number, number>>(new Map())
  const activeControllerRef = useRef<AbortController | null>(null)
  const visualizerActiveRef = useRef(false)
  const playbackSessionRef = useRef(0)

  // Device voice speech synthesis refs
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([])
  const isSpeakingRef = useRef<boolean>(false)

  const [barHeights, setBarHeights] = useState<number[]>(RESTING_BARS)

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
  }, [concreteLang])

  // Prepare chunks when result or mode changes
  useEffect(() => {
    const script =
      mode === 'quick'
        ? buildQuickSummaryScript(result, concreteLang)
        : buildSpokenText(result)
    const speechScript = prepareTextForSpeech(script, concreteLang)
    const sentences = splitIntoUtteranceChunks(speechScript, 160)
    setChunks(sentences.length > 0 ? sentences : [speechScript])
    setCurrentChunkIndex(0)
    setPlaybackProgress(0)
    setSeekPreview(null)
    stopAllAudio()
  }, [result, mode, concreteLang])

  // Stop all audio helper
  const stopAllAudio = (keepCachedAudio = false) => {
    playbackSessionRef.current += 1
    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
      activeControllerRef.current = null
    }
    if (audioElRef.current) {
      audioElRef.current.pause()
      audioElRef.current.onended = null
      audioElRef.current.ontimeupdate = null
      audioElRef.current.onloadedmetadata = null
      audioElRef.current.removeAttribute('src')
    }
    if (currentBlobUrlRef.current) {
      URL.revokeObjectURL(currentBlobUrlRef.current)
      currentBlobUrlRef.current = null
    }
    if (!keepCachedAudio) {
      cachedBlobsRef.current.clear()
      chunkDurationsRef.current.clear()
    }
    if (synthRef.current) {
      synthRef.current.cancel()
    }
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current)
      animFrameRef.current = null
    }
    visualizerActiveRef.current = false
    isSpeakingRef.current = false
    setBarHeights(RESTING_BARS)
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
        analyserRef.current.fftSize = 256
        analyserRef.current.smoothingTimeConstant = 0.75
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

  // Audio levels animate in place. Progress is displayed on a separate track.
  const startVisualizer = (isServer: boolean) => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current)
    const reduceMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.dataset.reduceMotion === 'true'
    if (reduceMotion) {
      setBarHeights(RESTING_BARS)
      return
    }

    let previous = [...RESTING_BARS]
    let lastFrame = 0
    const updateWaveform = (now: number) => {
      animFrameRef.current = requestAnimationFrame(updateWaveform)
      if (now - lastFrame < 40) return
      lastFrame = now

      if (!visualizerActiveRef.current) {
        previous = previous.map((height, index) =>
          height + (RESTING_BARS[index] - height) * 0.3
        )
      } else if (isServer && analyserRef.current) {
        const data = new Uint8Array(analyserRef.current.frequencyBinCount)
        analyserRef.current.getByteFrequencyData(data)
        previous = previous.map((height, index) => {
          const distance = Math.abs(index - (BAR_COUNT - 1) / 2)
          const bin = Math.min(data.length - 1, 2 + Math.round(distance * 0.8) + (index % 4))
          const level = data[bin] / 255
          const target = 8 + Math.pow(level, 0.8) * 48
          return height + (target - height) * 0.42
        })
      } else {
        // The browser does not expose speechSynthesis audio samples. This is
        // a playback indicator, not a claim to reflect measured voice levels.
        previous = previous.map((height, index) => {
          const pulse =
            Math.abs(Math.sin(now / 165 + index * 0.74)) * 0.7 +
            Math.abs(Math.sin(now / 310 - index * 0.37)) * 0.3
          const center = 1 - Math.abs(index - (BAR_COUNT - 1) / 2) / BAR_COUNT
          const target = 8 + pulse * center * 39
          return height + (target - height) * 0.36
        })
      }
      setBarHeights([...previous])
    }
    animFrameRef.current = requestAnimationFrame(updateWaveform)
  }

  // Chunks have different lengths, so use their known audio durations for a
  // 10-second rewind. Text length is a fallback when a chunk has not loaded.
  const estimatedDuration = (index: number) =>
    chunkDurationsRef.current.get(index) ?? Math.max(2, chunks[index].length / 14)

  // Play one part, optionally starting partway through it after a seek.
  const playChunk = async (chunkIdx: number, seekFraction = 0) => {
    if (chunkIdx >= chunks.length) {
      stopAllAudio()
      setCurrentChunkIndex(0)
      setPlaybackProgress(1)
      return
    }

    const startFraction = Math.min(0.99, Math.max(0, seekFraction))
    setCurrentChunkIndex(chunkIdx)
    setPlaybackProgress((chunkIdx + startFraction) / chunks.length)
    setIsBuffering(true)

    const text = chunks[chunkIdx]
    const session = playbackSessionRef.current

    // 1. Try Server TTS via POST /api/speak
    const controller = new AbortController()
    try {
      activeControllerRef.current = controller

      let blob: Blob
      if (cachedBlobsRef.current.has(chunkIdx)) {
        blob = cachedBlobsRef.current.get(chunkIdx)!
      } else {
        blob = await speakText({
          text,
          lang: concreteLang,
          voice: selectedGenderRef.current,
          rate: 1,
          signal: controller.signal,
        })
        if (controller.signal.aborted || playbackSessionRef.current !== session) return
        cachedBlobsRef.current.set(chunkIdx, blob)
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

      audio.playbackRate = selectedSpeedRef.current
      audio.onloadedmetadata = () => {
        if (playbackSessionRef.current !== session) return
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          chunkDurationsRef.current.set(chunkIdx, audio.duration)
          if (startFraction > 0) {
            audio.currentTime = Math.min(audio.duration - 0.05, audio.duration * startFraction)
          }
        }
      }
      audio.ontimeupdate = () => {
        if (playbackSessionRef.current !== session) return
        const fraction = Number.isFinite(audio.duration) && audio.duration > 0
          ? audio.currentTime / audio.duration
          : 0
        setPlaybackProgress((chunkIdx + fraction) / chunks.length)
      }
      audio.src = blobUrl
      initWebAudio()
      await audio.play()
      if (playbackSessionRef.current !== session) return
      visualizerActiveRef.current = true
      setIsPlaying(true)
      startVisualizer(true)

      // Set mediaSession
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = new MediaMetadata({
          title: 'Sarvam Audio',
          artist: result.title || 'Document',
        })
        navigator.mediaSession.setActionHandler('play', () => {
          audio.play().then(() => {
            visualizerActiveRef.current = true
            setIsPlaying(true)
            startVisualizer(true)
          }).catch(() => {})
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          audio.pause()
          visualizerActiveRef.current = false
          setIsPlaying(false)
        })
      }

      // Prefetch next chunk in background
      if (chunkIdx + 1 < chunks.length && !cachedBlobsRef.current.has(chunkIdx + 1)) {
        speakText({
          text: chunks[chunkIdx + 1],
          lang: concreteLang,
          voice: selectedGenderRef.current,
          rate: 1,
        })
          .then((blob) => {
            if (playbackSessionRef.current === session) {
              cachedBlobsRef.current.set(chunkIdx + 1, blob)
            }
          })
          .catch(() => {})
      }

      audio.onended = () => {
        if (playbackSessionRef.current === session) playChunk(chunkIdx + 1)
      }
    } catch {
      if (controller.signal.aborted || playbackSessionRef.current !== session) return
      // 2. Server audio failed or took > 8s: Fallback to device voice
      setEngine('device')
      setUsingDeviceNote(true)
      setIsBuffering(false)

      if (!synthRef.current) {
        setNoVoiceWarning(true)
        return
      }

      const voice = findVoiceForLanguage(availableVoicesRef.current, concreteLang)
      if (!voice) {
        setNoVoiceWarning(true)
        return
      }

      setNoVoiceWarning(false)
      synthRef.current.cancel()

      const approximate = Math.floor(text.length * startFraction)
      const nextSpace = startFraction > 0 ? text.indexOf(' ', approximate) : -1
      const previousSpace = startFraction > 0 ? text.lastIndexOf(' ', approximate) : -1
      const startAt = nextSpace >= 0 ? nextSpace + 1 : Math.max(0, previousSpace + 1)
      const remainingText = text.slice(startAt)
      const utter = new SpeechSynthesisUtterance(remainingText)
      utter.voice = voice
      utter.lang = voice.lang
      utter.rate = selectedSpeedRef.current

      utter.onstart = () => {
        if (playbackSessionRef.current !== session) return
        visualizerActiveRef.current = true
        setIsPlaying(true)
        isSpeakingRef.current = true
        startVisualizer(false)
      }

      utter.onboundary = (event) => {
        if (playbackSessionRef.current !== session) return
        setPlaybackProgress(
          (chunkIdx + Math.min(1, (startAt + event.charIndex) / Math.max(1, text.length))) /
            chunks.length
        )
      }

      utter.onend = () => {
        if (playbackSessionRef.current !== session) return
        visualizerActiveRef.current = false
        isSpeakingRef.current = false
        playChunk(chunkIdx + 1)
      }

      utter.onerror = () => {
        if (playbackSessionRef.current !== session) return
        isSpeakingRef.current = false
        stopAllAudio()
      }

      synthRef.current.speak(utter)
    }
  }

  // Handle Play/Pause
  const handleTogglePlay = () => {
    if (isBuffering) return
    if (!audioElRef.current) {
      audioElRef.current = new Audio()
    }
    initWebAudio()

    if (isPlaying) {
      if (engine === 'server' && audioElRef.current) {
        audioElRef.current.pause()
      } else if (engine === 'device' && synthRef.current) {
        synthRef.current.pause()
      }
      visualizerActiveRef.current = false
      setIsPlaying(false)
    } else {
      if (engine === 'server' && currentBlobUrlRef.current) {
        audioElRef.current.play().then(() => {
          visualizerActiveRef.current = true
          setIsPlaying(true)
          startVisualizer(true)
        }).catch(() => {})
      } else if (engine === 'device' && synthRef.current?.paused) {
        synthRef.current.resume()
        visualizerActiveRef.current = true
        setIsPlaying(true)
        startVisualizer(false)
      } else {
        // Unlock the media element only when starting a fresh session.
        audioElRef.current.src = SILENT_WAV_URI
        audioElRef.current.play().catch(() => {})
        playChunk(currentChunkIndex)
      }
    }
  }

  const jumpTo = (chunkIdx: number, fraction: number) => {
    if (!chunks.length) return
    const index = Math.min(chunks.length - 1, Math.max(0, chunkIdx))
    const position = Math.min(0.99, Math.max(0, fraction))
    const audio = audioElRef.current

    if (
      engine === 'server' &&
      index === currentChunkIndex &&
      currentBlobUrlRef.current &&
      audio && Number.isFinite(audio.duration) && audio.duration > 0
    ) {
      audio.currentTime = Math.min(audio.duration - 0.05, audio.duration * position)
      setPlaybackProgress((index + audio.currentTime / audio.duration) / chunks.length)
      audio.play().then(() => {
        visualizerActiveRef.current = true
        setIsPlaying(true)
        startVisualizer(true)
      }).catch(() => {})
      return
    }

    stopAllAudio(true)
    setCurrentChunkIndex(index)
    setPlaybackProgress((index + position) / chunks.length)
    playChunk(index, position)
  }

  const handleSeek = (progress: number) => {
    const scaled = Math.min(0.9999, Math.max(0, progress)) * chunks.length
    const index = Math.floor(scaled)
    jumpTo(index, scaled - index)
  }

  const handleReplay10s = () => {
    if (!chunks.length) return
    let index = currentChunkIndex
    const audio = audioElRef.current
    const fraction = Math.min(1, Math.max(0, playbackProgress * chunks.length - index))
    let position = engine === 'server' && audio && Number.isFinite(audio.duration)
      ? audio.currentTime
      : estimatedDuration(index) * fraction
    let remaining = 10

    while (remaining > position && index > 0) {
      remaining -= position
      index -= 1
      position = estimatedDuration(index)
    }
    const duration = estimatedDuration(index)
    jumpTo(index, Math.max(0, position - remaining) / duration)
  }

  const handleSpeedSelect = (s: number) => {
    setSpeed(s)
    selectedSpeedRef.current = s
    if (audioElRef.current) {
      audioElRef.current.playbackRate = s
    }
  }

  const handleGenderToggle = (g: 'female' | 'male') => {
    if (g === gender) return
    const hadPlayback = Boolean(
      currentBlobUrlRef.current || isSpeakingRef.current || isPlaying || isBuffering || playbackProgress > 0
    )
    setGender(g)
    selectedGenderRef.current = g
    try {
      localStorage.setItem('sarvam.voice', g)
    } catch {}
    stopAllAudio()
    setCurrentChunkIndex(0)
    setPlaybackProgress(0)
    setSeekPreview(null)
    if (hadPlayback) {
      if (audioElRef.current) {
        initWebAudio()
        audioElRef.current.src = SILENT_WAV_URI
        audioElRef.current.play().catch(() => {})
      }
      playChunk(0)
    }
  }

  const currentSentence = chunks[currentChunkIndex] || ''
  const nextSentence = chunks[currentChunkIndex + 1] || ''
  const visibleProgress = seekPreview ?? playbackProgress
  const percentVal = Math.round(visibleProgress * 100)
  const ariaValueText = (() => {
    switch (concreteLang) {
      case 'ta':
        return `${percentVal} சதவீதம்`
      case 'hi':
        return `${percentVal} प्रतिशत`
      case 'te':
        return `${percentVal} శాతం`
      case 'ml':
        return `${percentVal} ശതമാനം`
      case 'kn':
        return `${percentVal} ಪ್ರತಿಶತ`
      default:
        return `${percentVal}%`
    }
  })()

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
              aria-pressed={mode === 'quick'}
              className={`focus-ring px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
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
              aria-pressed={mode === 'full'}
              className={`focus-ring px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${
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
            className="focus-ring p-2 text-[#5E636B] hover:text-[#15171A] rounded-full hover:bg-[#F0F0EB] transition-colors"
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

        {/* The bars show audio activity; the track below shows position. */}
        <div className="rounded-[22px] bg-[#F3F6F1] px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-wide text-[#52665C]">
            <span className="truncate">{result.title || t.listenBtnLabel || 'Listen'}</span>
            <span className="shrink-0 tabular-nums">
              {String(Math.min(currentChunkIndex + 1, chunks.length)).padStart(2, '0')}
              <span className="px-1.5 text-[#9AADA2]">/</span>
              {String(chunks.length).padStart(2, '0')}
            </span>
          </div>

          <div className="flex h-24 items-center justify-center gap-[3px] overflow-hidden" aria-hidden="true">
            {barHeights.map((height, index) => (
              <span
                key={index}
                className="min-w-0 flex-1 rounded-full"
                style={{
                  height: `${height}px`,
                  backgroundColor: isPlaying ? '#245A49' : '#A5B9AC',
                  transition: 'background-color 160ms ease',
                }}
              />
            ))}
          </div>

          <div className="relative flex h-9 items-center">
            <div className="pointer-events-none absolute left-0 right-0 h-1 rounded-full bg-[#D8E2D9]">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, Math.max(0, visibleProgress * 100))}%`,
                  backgroundColor: 'var(--color-violet-text, #6D45C9)',
                }}
              />
            </div>
            <input
              type="range"
              min="0"
              max="1000"
              step="1"
              value={Math.round(visibleProgress * 1000)}
              onChange={(event) => setSeekPreview(Number(event.currentTarget.value) / 1000)}
              onPointerUp={(event) => {
                handleSeek(Number(event.currentTarget.value) / 1000)
                setSeekPreview(null)
              }}
              onKeyUp={(event) => {
                if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown'].includes(event.key)) {
                  handleSeek(Number(event.currentTarget.value) / 1000)
                  setSeekPreview(null)
                }
              }}
              onBlur={() => {
                if (seekPreview !== null) {
                  handleSeek(seekPreview)
                  setSeekPreview(null)
                }
              }}
              onPointerCancel={() => setSeekPreview(null)}
              className="voice-seek focus-ring relative w-full"
              aria-label={t.seekAudio || 'Seek audio'}
              aria-valuetext={ariaValueText}
            />
          </div>
        </div>

        {/* Live Captions */}
        <div className="flex min-h-[102px] flex-col justify-center gap-2 px-1" aria-live="polite">
          <p className="text-[17px] font-medium leading-[1.55] text-[#18372D]">
            {currentSentence}
          </p>
          {nextSentence && (
            <p className="line-clamp-1 text-sm leading-normal text-[#8A8792]">
              {nextSentence}
            </p>
          )}
        </div>

        {/* Player Controls */}
        <div className="flex flex-col gap-5 pt-1">
          {/* Main Controls Row */}
          <div className="flex items-center justify-center gap-9">
            {/* Replay 10s */}
            <button
              type="button"
              onClick={handleReplay10s}
              className="btn-press focus-ring flex h-12 w-12 items-center justify-center rounded-full text-[#625D70] hover:bg-[#F3F1F6] hover:text-[#1E1838] transition-colors"
              aria-label={t.replay10s || 'Replay 10 seconds'}
            >
              <ReplayIcon className="h-6 w-6" />
            </button>

            {/* Play/Pause */}
            <button
              type="button"
              onClick={handleTogglePlay}
              disabled={isBuffering}
              className="btn-press focus-ring flex h-16 w-16 items-center justify-center rounded-full bg-[#183E32] text-white shadow-[0_8px_20px_rgba(24,62,50,0.14)] transition-colors hover:bg-[#245A49] disabled:opacity-70"
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

            <button
              type="button"
              onClick={() => {
                stopAllAudio()
                setCurrentChunkIndex(0)
                setPlaybackProgress(0)
              }}
              className="btn-press focus-ring flex h-12 w-12 items-center justify-center rounded-full text-[#625D70] hover:bg-[#F3F1F6] hover:text-[#1E1838] transition-colors"
              aria-label={t.stop || 'Stop'}
            >
              <span className="h-4 w-4 rounded-[3px] bg-current" />
            </button>
          </div>

          <div className="flex flex-col gap-3 border-t border-[#EEECEF] pt-4">
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[#656077]">{t.voice || 'Voice'}</span>
              <div className="flex items-center rounded-xl bg-[#F3F2F0] p-1">
                {(['female', 'male'] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    onClick={() => handleGenderToggle(choice)}
                    aria-pressed={gender === choice}
                    className={`focus-ring rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors ${
                      gender === choice ? 'bg-white text-[#1E1838] shadow-sm' : 'text-[#656077]'
                    }`}
                  >
                    {choice === 'female' ? t.voiceFemale || 'Female' : t.voiceMale || 'Male'}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex items-center justify-between gap-3">
              <span className="text-xs font-medium text-[#656077]">{t.speed || 'Speed'}</span>
              <div className="flex items-center gap-1 rounded-xl bg-[#F3F2F0] p-1">
                {[0.9, 1.0, 1.15].map((value) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => handleSpeedSelect(value)}
                    aria-pressed={speed === value}
                    className={`focus-ring rounded-lg px-2.5 py-1.5 text-xs font-semibold transition-colors ${
                      speed === value ? 'bg-white text-[#1E1838] shadow-sm' : 'text-[#656077]'
                    }`}
                  >
                    {value}x
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </Sheet>
  )
}
