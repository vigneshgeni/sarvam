import { useState, useEffect } from 'react'
import {
  startScanActivity,
  updateScanProgress,
  markScanReady,
  markScanFailed,
  markScanPasswordNeeded,
  endScanActivity,
  startListenActivity,
  updateListenPlayback,
  finishListenActivity,
  getShowDocNameOnLockScreen,
  setShowDocNameOnLockScreen,
} from './liveActivity.js'
import { isNative } from './isNative.js'

interface DebugHarnessProps {
  isOpen: boolean
  onClose: () => void
}

export default function DebugHarness({ isOpen, onClose }: DebugHarnessProps) {
  const [progress, setProgress] = useState(62)
  const [stage, setStage] = useState('Checking against the document')
  const [secondsRemaining, setSecondsRemaining] = useState(15)
  const [language, setLanguage] = useState('en')
  const [voice, setVoice] = useState<'female' | 'male'>('female')
  const [currentTime, setCurrentTime] = useState(45)
  const [duration] = useState(90)
  const [isPlaying, setIsPlaying] = useState(false)
  const [docTitle] = useState('image.jpg')
  const [showDocName, setShowDocName] = useState(() => getShowDocNameOnLockScreen())

  useEffect(() => {
    // Listen for hash change to toggle harness
    const handleHash = () => {
      if (window.location.hash === '#debug') {
        // can be handled by parent
      }
    }
    window.addEventListener('hashchange', handleHash)
    return () => window.removeEventListener('hashchange', handleHash)
  }, [])

  if (!isOpen) return null

  const getLanguageLabel = (l: string) => {
    switch (l) {
      case 'ta':
        return 'தமிழ் · ' + (voice === 'female' ? 'Female' : 'Male')
      case 'hi':
        return 'हिंदी · ' + (voice === 'female' ? 'Female' : 'Male')
      case 'te':
        return 'తెలుగు · ' + (voice === 'female' ? 'Female' : 'Male')
      case 'ml':
        return 'മലയാളം · ' + (voice === 'female' ? 'Female' : 'Male')
      case 'kn':
        return 'ಕನ್ನಡ · ' + (voice === 'female' ? 'Female' : 'Male')
      case 'mr':
        return 'मराठी · ' + (voice === 'female' ? 'Female' : 'Male')
      case 'bn':
        return 'বাংলা · ' + (voice === 'female' ? 'Female' : 'Male')
      case 'or':
        return 'ଓଡ଼ିଆ'
      default:
        return 'English'
    }
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col items-center justify-end p-4 text-white font-sans animate-fade-in backdrop-blur-sm">
      <div className="w-full max-w-[420px] bg-[#1C1F1E] border border-white/20 rounded-3xl p-5 shadow-2xl flex flex-col gap-4 max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div>
            <h2 className="text-lg font-bold text-[#E9B44C]">Live Activity Debug Harness</h2>
            <p className="text-xs text-white/60">Zero-quota offline simulation ({isNative() ? 'Native Shell' : 'Web/PWA'})</p>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-sm font-bold"
          >
            ✕
          </button>
        </div>

        {/* Privacy Default Setting */}
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-2xl p-3">
          <div>
            <div className="text-xs font-semibold text-white">Show document name on Lock Screen</div>
            <div className="text-[11px] text-white/50">Privacy default: Off ("Your document")</div>
          </div>
          <button
            onClick={() => {
              const next = !showDocName
              setShowDocName(next)
              setShowDocNameOnLockScreen(next)
            }}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-colors ${
              showDocName ? 'bg-[#E9B44C] text-black' : 'bg-white/10 text-white/70 border border-white/20'
            }`}
          >
            {showDocName ? 'ON' : 'OFF (Default)'}
          </button>
        </div>

        {/* Section 1: Scanning Controls */}
        <div className="flex flex-col gap-2">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">1. Scanning Simulation</span>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={async () => {
                await startScanActivity({
                  docId: 'debug-sample',
                  fileName: docTitle,
                  fileCount: 1,
                  language,
                })
              }}
              className="py-2 px-3 rounded-xl bg-[#224F48] hover:bg-[#2A625A] text-xs font-semibold text-white border border-white/10"
            >
              Start Scan
            </button>
            <button
              onClick={async () => {
                await endScanActivity('debug-sample')
              }}
              className="py-2 px-3 rounded-xl bg-red-950/60 hover:bg-red-900/60 text-xs font-semibold text-red-200 border border-red-500/20"
            >
              Cancel / End
            </button>
          </div>

          <div className="flex flex-col gap-1.5 mt-1">
            <div className="flex justify-between text-xs text-white/80">
              <span>Progress: {progress}%</span>
              <span>{secondsRemaining}s left</span>
            </div>
            <div className="text-[11px] text-white/60 truncate">
              Stage: {stage}
            </div>
            <div className="flex gap-1.5">
              {[0, 17, 62, 95, 100].map((val) => (
                <button
                  key={val}
                  onClick={async () => {
                    setProgress(val)
                    let stg = 'Reading your document'
                    if (val >= 80) stg = 'Writing in ' + getLanguageLabel(language)
                    else if (val >= 40) stg = 'Checking against the document'
                    if (val === 100) stg = 'Ready'
                    setStage(stg)
                    const rem = Math.max(0, Math.round((100 - val) * 0.25))
                    setSecondsRemaining(rem)
                    await updateScanProgress({
                      docId: 'debug-sample',
                      progress: val,
                      stageText: stg,
                      secondsRemaining: rem,
                    })
                  }}
                  className={`flex-1 py-1.5 rounded-lg text-xs font-bold ${
                    progress === val ? 'bg-[#E9B44C] text-black' : 'bg-white/10 text-white/80'
                  }`}
                >
                  {val}%
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-1.5 mt-1">
            <button
              onClick={async () => {
                setProgress(100)
                setStage('Ready')
                await markScanReady({
                  docId: 'debug-sample',
                  title: 'Laboratory Report',
                  language,
                  languageLabel: getLanguageLabel(language),
                })
              }}
              className="py-2 rounded-xl bg-[#E9B44C] text-black font-bold text-xs"
            >
              Ready
            </button>
            <button
              onClick={async () => {
                await markScanFailed({
                  docId: 'debug-sample',
                  errorMessage: 'Service is busy',
                })
              }}
              className="py-2 rounded-xl bg-orange-950/70 text-orange-200 font-semibold text-xs border border-orange-500/20"
            >
              Failed (429)
            </button>
            <button
              onClick={async () => {
                await markScanPasswordNeeded({
                  docId: 'debug-sample',
                })
              }}
              className="py-2 rounded-xl bg-blue-950/70 text-blue-200 font-semibold text-xs border border-blue-500/20"
            >
              Password
            </button>
          </div>
        </div>

        {/* Section 2: Listen Controls */}
        <div className="flex flex-col gap-2 border-t border-white/10 pt-3">
          <span className="text-xs font-bold uppercase tracking-wider text-white/50">2. Listen Simulation</span>

          {/* Language Selection */}
          <div className="flex flex-col gap-1">
            <label className="text-xs text-white/60">Language & Voice:</label>
            <div className="flex gap-2">
              <select
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                className="flex-1 bg-black/40 border border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-white"
              >
                <option value="en">English</option>
                <option value="ta">Tamil (தமிழ்)</option>
                <option value="hi">Hindi (हिंदी)</option>
                <option value="te">Telugu (తెలుగు)</option>
                <option value="ml">Malayalam (മലയാളം)</option>
                <option value="kn">Kannada (ಕನ್ನಡ)</option>
                <option value="mr">Marathi (मराठी)</option>
                <option value="bn">Bengali (বাংলা)</option>
                <option value="or">Odia (ଓଡ଼ିଆ - Disabled)</option>
              </select>

              <select
                value={voice}
                onChange={(e) => setVoice(e.target.value as 'female' | 'male')}
                className="bg-black/40 border border-white/20 rounded-xl px-2.5 py-1.5 text-xs text-white"
              >
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2 mt-1">
            <button
              onClick={async () => {
                setIsPlaying(true)
                await startListenActivity({
                  docId: 'debug-sample',
                  title: 'Laboratory Report',
                  language,
                  languageLabel: getLanguageLabel(language),
                  voiceGender: voice,
                  duration,
                  currentTime,
                })
              }}
              className="py-2 rounded-xl bg-[#224F48] text-white font-semibold text-xs border border-white/10"
            >
              Start Listen (90s)
            </button>

            <button
              onClick={async () => {
                const nextPlaying = !isPlaying
                setIsPlaying(nextPlaying)
                await updateListenPlayback({
                  currentTime,
                  duration,
                  isPlaying: nextPlaying,
                })
              }}
              className={`py-2 rounded-xl font-bold text-xs ${
                isPlaying ? 'bg-[#E9B44C] text-black' : 'bg-white/20 text-white'
              }`}
            >
              {isPlaying ? 'Pause' : 'Play / Resume'}
            </button>
          </div>

          <div className="flex gap-2">
            <button
              onClick={async () => {
                const newPos = Math.max(0, currentTime - 10)
                setCurrentTime(newPos)
                await updateListenPlayback({
                  currentTime: newPos,
                  duration,
                  isPlaying,
                })
              }}
              className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium"
            >
              -10s
            </button>
            <button
              onClick={async () => {
                setCurrentTime(45)
                await updateListenPlayback({
                  currentTime: 45,
                  duration,
                  isPlaying,
                })
              }}
              className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium"
            >
              0:45 (PDF match)
            </button>
            <button
              onClick={async () => {
                const newPos = Math.min(duration, currentTime + 10)
                setCurrentTime(newPos)
                await updateListenPlayback({
                  currentTime: newPos,
                  duration,
                  isPlaying,
                })
              }}
              className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium"
            >
              +10s
            </button>
            <button
              onClick={async () => {
                setIsPlaying(false)
                await finishListenActivity()
              }}
              className="flex-1 py-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-xs font-medium"
            >
              Finish
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
