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
  splitIntoSentences,
  findVoiceForLanguage,
  logTargetVoices,
} from '../utils/speech'
import { speakText } from '../api'
import { resolveLang, LANG_LABELS } from '../i18n'

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

// In-memory cache for synthesized audio Blobs across the entire session: cacheKey -> Blob
export const audioBlobCache = new Map<string, Blob>()

const BAR_COUNT = 35
const RESTING_BARS = Array.from({ length: BAR_COUNT }, (_, index) =>
  8 + Math.round((Math.sin(index * 1.7) + 1) * 2)
)

function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '00:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

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

  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
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

  // Sentences for live captions
  const [sentences, setSentences] = useState<string[]>([])
  const sentencesRef = useRef<string[]>([])
  const [activeSentenceIndex, setActiveSentenceIndex] = useState(0)

  // Audio elements & Web Audio refs
  const audioElRef = useRef<HTMLAudioElement | null>(null)
  const audioContextRef = useRef<AudioContext | null>(null)
  const analyserRef = useRef<AnalyserNode | null>(null)
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null)
  const animFrameRef = useRef<number | null>(null)
  const currentBlobUrlRef = useRef<string | null>(null)
  const activeControllerRef = useRef<AbortController | null>(null)
  const visualizerActiveRef = useRef(false)
  const playbackSessionRef = useRef(0)

  // Device voice speech synthesis refs
  const synthRef = useRef<SpeechSynthesis | null>(null)
  const availableVoicesRef = useRef<SpeechSynthesisVoice[]>([])
  const isSpeakingRef = useRef<boolean>(false)
  const deviceVoiceIntervalRef = useRef<number | null>(null)

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

  // Prepare script sentences and start synthesis as soon as Listen sheet opens or mode/lang/result changes
  useEffect(() => {
    const rawScript =
      mode === 'quick'
        ? buildQuickSummaryScript(result, concreteLang)
        : buildSpokenText(result)
    const split = splitIntoSentences(rawScript)
    const scriptSentences = split.length > 0 ? split : [rawScript]
    setSentences(scriptSentences)
    sentencesRef.current = scriptSentences
    setActiveSentenceIndex(0)
    setCurrentTime(0)
    setDuration(0)
    setPlaybackProgress(0)
    setSeekPreview(null)
    stopAllAudio()

    if (isOpen && concreteLang !== 'or') {
      setIsBuffering(true)
      if (audioElRef.current) {
        audioElRef.current.src = SILENT_WAV_URI
        audioElRef.current.play().catch(() => {})
      }
      startPlaybackSession(0)
    }
  }, [result, mode, concreteLang, isOpen])

  // Stop all audio helper
  const stopAllAudio = () => {
    playbackSessionRef.current += 1
    if (activeControllerRef.current) {
      activeControllerRef.current.abort()
      activeControllerRef.current = null
    }
    if (deviceVoiceIntervalRef.current) {
      clearInterval(deviceVoiceIntervalRef.current)
      deviceVoiceIntervalRef.current = null
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
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'none'
    }
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

  // Audio levels animation
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
        // Playback indicator pulse when speech synthesis is active
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

  // Compute which sentence is playing based on progress
  const updateSentenceFromTime = (cur: number, total: number, sList?: string[]) => {
    const list = sList && sList.length ? sList : sentencesRef.current
    if (!list.length || total <= 0) return
    const ratio = Math.min(0.999, Math.max(0, cur / total))
    const totalChars = list.reduce((acc, s) => acc + s.length, 0) || 1
    let accumulated = 0
    for (let i = 0; i < list.length; i++) {
      accumulated += list[i].length
      if (ratio <= accumulated / totalChars) {
        setActiveSentenceIndex(i)
        return
      }
    }
    setActiveSentenceIndex(Math.max(0, list.length - 1))
  }

  // Setup MediaSession API (Addendum Task 4.3)
  const setupMediaSession = (audio: HTMLAudioElement) => {
    if (!('mediaSession' in navigator)) return
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: result.title || result.report_title || t.listenBtnLabel || 'Document',
        artist: 'Sarvam',
        album: LANG_LABELS[concreteLang] || 'Sarvam Audio',
        artwork: [
          { src: '/icon-96.png', sizes: '96x96', type: 'image/png' },
          { src: '/icon-128.png', sizes: '128x128', type: 'image/png' },
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-256.png', sizes: '256x256', type: 'image/png' },
          { src: '/icon-384.png', sizes: '384x384', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      })

      navigator.mediaSession.setActionHandler('play', () => {
        handlePlay()
      })
      navigator.mediaSession.setActionHandler('pause', () => {
        handlePause()
      })
      navigator.mediaSession.setActionHandler('stop', () => {
        stopAllAudio()
      })
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (details.seekTime != null) {
          seekToSeconds(details.seekTime)
        }
      })
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const delta = details.seekOffset || 10
        seekToSeconds(Math.max(0, (audio.currentTime || 0) - delta))
      })
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const delta = details.seekOffset || 10
        seekToSeconds(Math.min(audio.duration || 0, (audio.currentTime || 0) + delta))
      })
    } catch {
      // MediaSession error handling
    }
  }

  const updateMediaPositionState = (cur: number, dur: number, rate: number) => {
    if (!('mediaSession' in navigator) || !('setPositionState' in navigator.mediaSession)) return
    if (!Number.isFinite(dur) || dur <= 0) return
    try {
      navigator.mediaSession.setPositionState({
        duration: dur,
        playbackRate: rate || 1.0,
        position: Math.min(cur, dur),
      })
    } catch {}
  }

  // Starts continuous playback
  const startPlaybackSession = async (startPosRatio = 0) => {
    const session = ++playbackSessionRef.current
    setIsBuffering(true)

    const rawScript =
      mode === 'quick'
        ? buildQuickSummaryScript(result, concreteLang)
        : buildSpokenText(result)
    const speechScript = prepareTextForSpeech(rawScript, concreteLang)
    const docId = result.title || result.report_title || 'doc'
    const cacheKey = `${docId}-${mode}-${concreteLang}-${selectedGenderRef.current}`

    const controller = new AbortController()
    activeControllerRef.current = controller

    try {
      let blob: Blob
      if (audioBlobCache.has(cacheKey)) {
        blob = audioBlobCache.get(cacheKey)!
      } else {
        blob = await speakText({
          text: speechScript,
          lang: concreteLang,
          voice: selectedGenderRef.current,
          rate: 1,
          signal: controller.signal,
        })
        if (controller.signal.aborted || playbackSessionRef.current !== session) return
        audioBlobCache.set(cacheKey, blob)
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
          setDuration(audio.duration)
          if (startPosRatio > 0) {
            audio.currentTime = Math.min(audio.duration - 0.05, audio.duration * startPosRatio)
            setCurrentTime(audio.currentTime)
            setPlaybackProgress(audio.currentTime / audio.duration)
          }
        }
      }

      audio.ontimeupdate = () => {
        if (playbackSessionRef.current !== session) return
        const cur = audio.currentTime
        const dur = audio.duration
        setCurrentTime(cur)
        if (Number.isFinite(dur) && dur > 0) {
          setDuration(dur)
          setPlaybackProgress(cur / dur)
          updateSentenceFromTime(cur, dur, sentencesRef.current)
          updateMediaPositionState(cur, dur, audio.playbackRate)
        }
      }

      audio.onended = () => {
        if (playbackSessionRef.current !== session) return
        setIsPlaying(false)
        visualizerActiveRef.current = false
        setCurrentTime(audio.duration || 0)
        setPlaybackProgress(1)
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'none'
        }
      }

      audio.src = blobUrl
      initWebAudio()
      await audio.play()
      if (playbackSessionRef.current !== session) return

      visualizerActiveRef.current = true
      setIsPlaying(true)
      startVisualizer(true)
      setupMediaSession(audio)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing'
      }
    } catch {
      if (controller.signal.aborted || playbackSessionRef.current !== session) return
      // Fallback to device voice
      fallbackToDeviceVoice(rawScript, startPosRatio, session)
    }
  }

  // Fallback to SpeechSynthesis
  const fallbackToDeviceVoice = (text: string, startPosRatio: number, session: number) => {
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

    const approximate = Math.floor(text.length * startPosRatio)
    const nextSpace = startPosRatio > 0 ? text.indexOf(' ', approximate) : -1
    const previousSpace = startPosRatio > 0 ? text.lastIndexOf(' ', approximate) : -1
    const startAt = nextSpace >= 0 ? nextSpace + 1 : Math.max(0, previousSpace + 1)
    const remainingText = text.slice(startAt)

    const utter = new SpeechSynthesisUtterance(remainingText)
    utter.voice = voice
    utter.lang = voice.lang
    utter.rate = selectedSpeedRef.current

    // Estimate duration: ~150 words per minute (2.5 words per sec)
    const wordCount = text.split(/\s+/).length
    const estimatedTotal = Math.max(5, wordCount / 2.5)
    setDuration(estimatedTotal)

    utter.onstart = () => {
      if (playbackSessionRef.current !== session) return
      visualizerActiveRef.current = true
      setIsPlaying(true)
      isSpeakingRef.current = true
      startVisualizer(false)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing'
      }

      // Interval to update elapsed time during device speech
      const startStamp = Date.now() - (startPosRatio * estimatedTotal * 1000)
      if (deviceVoiceIntervalRef.current) clearInterval(deviceVoiceIntervalRef.current)
      deviceVoiceIntervalRef.current = window.setInterval(() => {
        if (playbackSessionRef.current !== session || !isSpeakingRef.current) {
          if (deviceVoiceIntervalRef.current) clearInterval(deviceVoiceIntervalRef.current)
          return
        }
        const elapsed = (Date.now() - startStamp) / 1000
        setCurrentTime(Math.min(estimatedTotal, elapsed))
        const p = Math.min(1, elapsed / estimatedTotal)
        setPlaybackProgress(p)
        updateSentenceFromTime(elapsed, estimatedTotal, sentences)
      }, 200)
    }

    utter.onend = () => {
      if (playbackSessionRef.current !== session) return
      if (deviceVoiceIntervalRef.current) clearInterval(deviceVoiceIntervalRef.current)
      visualizerActiveRef.current = false
      isSpeakingRef.current = false
      setIsPlaying(false)
      setCurrentTime(estimatedTotal)
      setPlaybackProgress(1)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'none'
      }
    }

    utter.onerror = () => {
      if (playbackSessionRef.current !== session) return
      if (deviceVoiceIntervalRef.current) clearInterval(deviceVoiceIntervalRef.current)
      visualizerActiveRef.current = false
      isSpeakingRef.current = false
      setIsPlaying(false)
      stopAllAudio()
    }

    synthRef.current.speak(utter)
  }

  const handlePlay = () => {
    if (concreteLang === 'or') return
    if (engine === 'server' && audioElRef.current && currentBlobUrlRef.current) {
      audioElRef.current.playbackRate = selectedSpeedRef.current
      audioElRef.current.play().then(() => {
        visualizerActiveRef.current = true
        setIsPlaying(true)
        startVisualizer(true)
        if ('mediaSession' in navigator) {
          navigator.mediaSession.playbackState = 'playing'
        }
      }).catch(() => {})
    } else if (engine === 'device' && synthRef.current?.paused) {
      synthRef.current.resume()
      visualizerActiveRef.current = true
      setIsPlaying(true)
      startVisualizer(false)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.playbackState = 'playing'
      }
    } else {
      if (audioElRef.current) {
        audioElRef.current.src = SILENT_WAV_URI
        audioElRef.current.play().catch(() => {})
      }
      startPlaybackSession(playbackProgress < 0.99 ? playbackProgress : 0)
    }
  }

  const handlePause = () => {
    if (engine === 'server' && audioElRef.current) {
      audioElRef.current.pause()
    } else if (engine === 'device' && synthRef.current) {
      synthRef.current.pause()
    }
    visualizerActiveRef.current = false
    setIsPlaying(false)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.playbackState = 'paused'
    }
  }

  const handleTogglePlay = () => {
    if (isBuffering) return
    initWebAudio()
    if (isPlaying) {
      handlePause()
    } else {
      handlePlay()
    }
  }

  const seekToSeconds = (targetSec: number) => {
    const audio = audioElRef.current
    if (engine === 'server' && audio && Number.isFinite(audio.duration) && audio.duration > 0) {
      const clamped = Math.min(audio.duration - 0.05, Math.max(0, targetSec))
      audio.currentTime = clamped
      setCurrentTime(clamped)
      setPlaybackProgress(clamped / audio.duration)
      updateSentenceFromTime(clamped, audio.duration, sentences)
      updateMediaPositionState(clamped, audio.duration, audio.playbackRate)
      return
    }

    // If starting fresh or on device voice
    const totalD = duration > 0 ? duration : 30
    const ratio = Math.min(0.99, Math.max(0, targetSec / totalD))
    setCurrentTime(targetSec)
    setPlaybackProgress(ratio)
    stopAllAudio()
    startPlaybackSession(ratio)
  }

  const handleSeek = (progressRatio: number) => {
    const clamped = Math.min(0.999, Math.max(0, progressRatio))
    const total = duration > 0 ? duration : 30
    seekToSeconds(clamped * total)
  }

  const handleReplay10s = () => {
    const target = Math.max(0, currentTime - 10)
    seekToSeconds(target)
  }

  const handleSpeedSelect = (s: number) => {
    setSpeed(s)
    selectedSpeedRef.current = s
    if (audioElRef.current) {
      audioElRef.current.playbackRate = s
    }
    if (engine === 'server' && audioElRef.current) {
      updateMediaPositionState(audioElRef.current.currentTime, audioElRef.current.duration, s)
    }
  }

  const handleGenderToggle = (g: 'female' | 'male') => {
    if (g === gender) return
    const hadPlayback = isPlaying || currentBlobUrlRef.current !== null || isBuffering
    setGender(g)
    selectedGenderRef.current = g
    try {
      localStorage.setItem('sarvam.voice', g)
    } catch {}
    stopAllAudio()
    setCurrentTime(0)
    setPlaybackProgress(0)
    setSeekPreview(null)
    setActiveSentenceIndex(0)
    if (hadPlayback && isOpen && concreteLang !== 'or') {
      startPlaybackSession(0)
    }
  }

  const currentSentence = sentences[activeSentenceIndex] || ''
  const nextSentence = sentences[activeSentenceIndex + 1] || ''
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
      case 'mr':
        return `${percentVal} टक्के`
      case 'bn':
        return `${percentVal} শতাংশ`
      case 'or':
        return `${percentVal} ପ୍ରତିଶତ`
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
                if (mode !== 'quick') setMode('quick')
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
                if (mode !== 'full') setMode('full')
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
        {concreteLang === 'or' ? (
          <div className="bg-[#FFF4DE] border border-[#F4DDB0] rounded-xl p-3 flex items-center gap-2 text-xs text-[#5A3500]">
            <AlertTriangleIcon className="w-4 h-4 text-[#C2410C] shrink-0" />
            <span>{t.odiaAudioUnavailable || 'ଓଡ଼ିଆ ଭାଷା ପାଇଁ ଅଡିଓ ଏପର୍ଯ୍ୟନ୍ତ ଉପଲବ୍ଧ ନାହିଁ।'}</span>
          </div>
        ) : (
          <>
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
          </>
        )}

        {/* The bars show audio activity; the track below shows position. */}
        <div className="rounded-[22px] bg-[#F3F6F1] px-4 pt-4 pb-2">
          <div className="flex items-center justify-between gap-3 text-[11px] font-semibold tracking-wide text-[#52665C]">
            <span className="truncate">{result.title || t.listenBtnLabel || 'Listen'}</span>
            <span className="shrink-0 tabular-nums">
              {isBuffering
                ? (t.preparingAudio || 'Preparing audio...')
                : `${formatTime(currentTime)} / ${formatTime(duration)}`}
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
              disabled={isBuffering || concreteLang === 'or'}
              className="btn-press focus-ring flex h-16 w-16 items-center justify-center rounded-full bg-[#183E32] text-white shadow-[0_8px_20px_rgba(24,62,50,0.14)] transition-colors hover:bg-[#245A49] disabled:opacity-40 disabled:cursor-not-allowed"
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

            {/* Stop Button */}
            <button
              type="button"
              onClick={() => {
                stopAllAudio()
                setCurrentTime(0)
                setPlaybackProgress(0)
                setSeekPreview(null)
                setActiveSentenceIndex(0)
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
