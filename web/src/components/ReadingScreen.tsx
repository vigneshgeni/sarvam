import { useState, useEffect } from 'react'
import { getDictionary, SUPPORTED_LANGS } from '../i18n'
import type { AppErrorInfo } from '../types'
import { pickReadingVariant, type ReadingLetter } from '../design/catalog'
import { useOverlayRestore } from '../design/contracts'
import { useReadingStage } from '../hooks/useReadingStage'
import { readingCountCopy } from '../utils/readingCopy'
import ReadingArt from './v3/ReadingArt'

interface ReadingScreenProps {
  files: File[]
  lang: string
  langName: string
  error: AppErrorInfo | null
  onRetry: () => void
  onCancel: () => void
  multiReportProgress?: { ready: number; total: number } | null
  arrived?: boolean
}

function ProgressRing({ percent, still }: { percent: number; still: boolean }) {
  const radius = 26
  const turn = 2 * Math.PI * radius
  const shown = Math.max(0, Math.min(100, percent))
  return (
    <div className="relative h-[72px] w-[72px] shrink-0" aria-label={`${shown}%`}>
      <svg width="72" height="72" viewBox="0 0 72 72" aria-hidden="true">
        <circle cx="36" cy="36" r={radius} fill="none" stroke="#E2E5E0" strokeWidth="6" />
        <circle
          cx="36"
          cy="36"
          r={radius}
          fill="none"
          stroke="#034F46"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={turn}
          strokeDashoffset={turn * (1 - shown / 100)}
          transform="rotate(-90 36 36)"
          style={still ? undefined : { transition: 'stroke-dashoffset 180ms linear' }}
        />
      </svg>
      <span className="pointer-events-none absolute inset-0 flex items-center justify-center font-sans text-[15px] font-bold tabular-nums text-[#1A1A1A]">
        {shown}%
      </span>
    </div>
  )
}

function ErrorView({
  error,
  t,
  onRetry,
  onCancel,
}: {
  error: AppErrorInfo
  t: Record<string, string>
  onRetry: () => void
  onCancel: () => void
}) {
  const [secondsLeft, setSecondsLeft] = useState<number>(error.retryAfter || 0)

  useEffect(() => {
    if (!error.retryAfter || error.retryAfter <= 0) return

    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval)
          return 0
        }
        return prev - 1
      })
    }, 1000)

    return () => clearInterval(interval)
  }, [error.retryAfter])

  return (
    <div className="w-full flex flex-col items-center gap-5 animate-card-in">
      {/* Error Icon */}
      <div className="w-16 h-16 rounded-full bg-[#FFF4DE] border border-[#F4DDB0] flex items-center justify-center text-[#B42318]">
        <svg
          width="32"
          height="32"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>

      <div className="text-center flex flex-col gap-1.5 max-w-[340px]">
        <h3 className="font-heading font-bold text-[20px] text-ink leading-tight">
          {error.statusCode === 429
            ? t.tooManyRequests || 'Too many requests'
            : t.errorTitle || 'Could not read document'}
        </h3>
        <p className="text-[14.5px] text-muted leading-relaxed">
          {error.messageLocal || error.message}
        </p>
      </div>

      {/* Countdown pill if 429 Retry-After */}
      {secondsLeft > 0 && (
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-[#FFF4DE] border border-[#F4DDB0] text-warn-ink text-[13px] font-semibold">
          <svg
            className="sv-spin w-4 h-4"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <circle cx="12" cy="12" r="10" strokeOpacity="0.25" />
            <path d="M12 2a10 10 0 0 1 10 10" />
          </svg>
          <span>
            {(t.retryIn || 'Try again in {seconds}s').replace('{seconds}', String(secondsLeft))}
          </span>
        </div>
      )}

      {/* Buttons */}
      <div className="w-full flex flex-col gap-2.5 pt-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={secondsLeft > 0}
          className="sv-press w-full h-14 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] text-[#1A1A1A] font-bold text-[17px] disabled:opacity-50 flex items-center justify-center gap-2"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
          </svg>
          <span>{t.retry || 'Try again'}</span>
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="btn-press w-full py-3 rounded-full text-muted hover:text-ink font-semibold text-[14px] transition-colors"
        >
          {t.goBack || 'Go back'}
        </button>
      </div>
    </div>
  )
}

export default function ReadingScreen({
  files,
  lang,
  langName,
  error,
  onRetry,
  onCancel,
  multiReportProgress,
  arrived,
}: ReadingScreenProps) {
  useOverlayRestore()
  const reading = useReadingStage({ files, targetLanguage: lang, arrived })
  const [reduceMotion, setReduceMotion] = useState(false)
  useEffect(() => {
    const media = window.matchMedia('(prefers-reduced-motion: reduce)')
    const read = () =>
      setReduceMotion(media.matches || document.documentElement.getAttribute('data-reduce-motion') === 'true')
    read()
    media.addEventListener('change', read)
    return () => media.removeEventListener('change', read)
  }, [])
  const [variant] = useState<ReadingLetter>(() =>
    pickReadingVariant({
      photo: files.some((f) => f.type.startsWith('image/') || /\.(jpe?g|png|heic|webp)$/i.test(f.name)),
      fileCount: files.length,
      language: lang,
    })
  )
  const [takingLonger, setTakingLonger] = useState<boolean>(false)
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0)

  const t = getDictionary(lang)
  const currentLangObj = SUPPORTED_LANGS.find((l) => l.id === lang) || SUPPORTED_LANGS[0]
  const nativeLangName = currentLangObj.label || langName

  // Reset progress state when error clears (e.g. on retry) or document changes
  useEffect(() => {
    if (!error) {
      setTakingLonger(false)
      setElapsedSeconds(0)
    }
  }, [error, files, lang])

  // Track elapsed time. The 90 second reassurance stays with the longer notices.
  useEffect(() => {
    if (error) return

    const interval = setInterval(() => {
      setElapsedSeconds((s) => s + 1)
    }, 1000)

    const tLonger = setTimeout(() => {
      setTakingLonger(true)
    }, 90000)

    return () => {
      clearInterval(interval)
      clearTimeout(tLonger)
    }
  }, [error, files, lang])

  const countCopy = readingCountCopy(files, t)
  const fileLabel = countCopy.subtitle

  // Step labels use natural native language phrasing
  let stepWritingLabel =
    t.stepWriting?.replace('{lang}', nativeLangName) ||
    `Writing in ${nativeLangName}`
  if (lang === 'ta') {
    stepWritingLabel = 'தமிழில் எழுதுகிறோம்'
  } else if (lang === 'hi') {
    stepWritingLabel = 'हिंदी में लिख रहे हैं'
  }

  const steps = [
    { label: t.stepReading || 'Reading your document' },
    { label: t.stepChecking || 'Checking against the document' },
    { label: stepWritingLabel },
  ]

  const step = reading.stage === 'checking' ? 1 : reading.stage === 'writing' ? 2 : 0
  const showTakingLonger = !error && takingLonger

  const progressiveNoticeText = (() => {
    if (elapsedSeconds >= 75) {
      return (
        t.reassuranceFinalizing ||
        'Almost ready, finalizing your explanation...'
      )
    }
    if (elapsedSeconds >= 45) {
      return (
        t.reassuranceAnalyzing ||
        'Still analyzing text and details... Please wait a moment'
      )
    }
    return (
      t.reassuranceText ||
      'Still reading... Documents with complex tables or multiple pages take a little longer'
    )
  })()

  const pageCount = Math.max(files.length, 1)
  return (
    <div className="sv-screen-in flex-1 flex flex-col gap-6 px-5 pt-5 pb-7 min-h-[80vh] justify-between">
      {!error && (
        <div className="flex items-center justify-between">
          <button type="button" aria-label="Back" onClick={onCancel} className="sv-press w-12 h-12 box-border rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
          <span className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#CFE5E0] text-[13px] font-bold">
            {t.processingSecurely || 'Processing securely'}
          </span>
        </div>
      )}
      {!error && <ReadingArt variant={variant} pages={pageCount} />}

      {/* Title & Document Count */}
      {!error && (
        <div className="text-center flex flex-col gap-1">
          <h2 className="sv-display m-0 text-[32px] tracking-[-0.3px] text-[#1A1A1A] leading-tight truncate">
            {countCopy.heading}
          </h2>
          <p className="m-0 text-[15px] text-[#575B58]">{fileLabel}</p>
          {multiReportProgress && (
            <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-brand-soft text-brand font-semibold text-[13px] rounded-full mx-auto mt-1">
              <span>
                {(countCopy.photos
                  ? t.readingPhotosProgress || 'Photo {ready} of {total} ready'
                  : t.reportsProgress || 'Report {ready} of {total} ready')
                  .replace('{ready}', String(multiReportProgress.ready))
                  .replace('{total}', String(multiReportProgress.total))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stepper Card */}
      {!error && (
        <div className="flex w-full items-center gap-3 border-[1.5px] border-[#1A1A1A] rounded-[32px] px-[18px] pt-1.5 pb-4">
          <div className="min-w-0 flex-1">
          {steps.map((st, i) => {
            const isDone = step > i
            const isActive = step === i
            const isPending = step < i

            return (
              <div
                key={i}
                className="flex items-center gap-3.5 min-h-[56px] py-1"
              >
                <span className="w-7 h-7 shrink-0 flex items-center justify-center">
                  {isDone && (
                    <span className="w-[30px] h-[30px] rounded-full bg-[#034F46] flex items-center justify-center">
                      <svg
                        width="15"
                        height="15"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#FFFFFF"
                        strokeWidth="3"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12l4 4 10-10" />
                      </svg>
                    </span>
                  )}
                  {isActive && (
                    <span className="spin w-[30px] h-[30px] box-border rounded-full border-[3.5px] border-[#F8D9CB] border-t-[#D9603B] border-r-[#D9603B]" />
                  )}
                  {isPending && (
                    <span className="w-[30px] h-[30px] box-border rounded-full border-2 border-dashed border-[#A4A9A4]" />
                  )}
                </span>
                <span
                  className={`text-[15px] font-semibold transition-colors ${
                    isPending ? 'text-muted' : 'text-ink'
                  }`}
                >
                  {st.label}
                </span>
              </div>
            )
          })}
          </div>
          <ProgressRing percent={reading.percent} still={reduceMotion} />
        </div>
      )}
      {!error && reading.almost && (
        <p className="m-0 text-center text-[15px] font-semibold text-[#575B58]">{t.almostThere || 'Almost there…'}</p>
      )}

      {/* Honest Progressive Reassurance Notice */}
      {showTakingLonger && (
        <div className="w-full bg-[#FBF7EF] border border-[#F1EBDD] rounded-card p-4 flex items-start gap-3 text-ink/80 animate-card-in">
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0 mt-0.5 text-[#B45309]"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <div className="flex-1 flex flex-col gap-1">
            <span className="text-[13.5px] leading-relaxed font-medium">
              {progressiveNoticeText}
            </span>
            <span className="text-[12px] text-muted tabular-nums">
              {elapsedSeconds}s · {t.processingSecurely || 'Processing securely'}
            </span>
          </div>
        </div>
      )}

      {/* Cancel button: always visible during reading across all screen widths down to 360px */}
      {!error && (
        <div className="w-full flex justify-center pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="sv-press h-12 px-7 rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent text-[#1A1A1A] font-bold text-[16px] flex items-center justify-center"
            aria-label={t.cancel || t.goBack || 'Cancel'}
          >
            {t.cancel || t.goBack || 'Cancel'}
          </button>
        </div>
      )}

      {/* Dedicated Error View if API fails */}
      {error && (
        <ErrorView
          key={`${error.statusCode}-${error.retryAfter || 0}-${error.messageLocal}`}
          error={error}
          t={t}
          onRetry={onRetry}
          onCancel={onCancel}
        />
      )}
    </div>
  )
}
