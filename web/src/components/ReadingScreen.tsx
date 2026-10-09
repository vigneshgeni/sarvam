import { useState, useEffect } from 'react'
import { getDictionary, SUPPORTED_LANGS } from '../i18n'
import type { AppErrorInfo } from '../types'

interface ReadingScreenProps {
  files: File[]
  lang: string
  langName: string
  error: AppErrorInfo | null
  onRetry: () => void
  onCancel: () => void
  multiReportProgress?: { ready: number; total: number } | null
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
          className="btn-press w-full py-3.5 rounded-full bg-brand text-white font-semibold text-[15px] hover:bg-[#0E5B37] disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-sm flex items-center justify-center gap-2"
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
}: ReadingScreenProps) {
  const [step, setStep] = useState<number>(0)
  const [takingLonger, setTakingLonger] = useState<boolean>(false)

  const t = getDictionary(lang)
  const currentLangObj = SUPPORTED_LANGS.find((l) => l.id === lang) || SUPPORTED_LANGS[0]
  const nativeLangName = currentLangObj.label || langName

  // Stepper progress simulation while waiting
  useEffect(() => {
    if (error) return

    const t1 = setTimeout(() => {
      setStep(1)
    }, 1800)

    const t2 = setTimeout(() => {
      setStep(2)
    }, 3600)

    return () => {
      clearTimeout(t1)
      clearTimeout(t2)
    }
  }, [error, files, lang])

  // 20-second delay notice per WEB-5
  useEffect(() => {
    if (error) return

    const tLonger = setTimeout(() => {
      setTakingLonger(true)
    }, 20000)

    return () => clearTimeout(tLonger)
  }, [error, files, lang])

  const fileCount = files.length
  const fileLabel =
    fileCount > 1
      ? t.readingSubtitlePlural?.replace('{count}', String(fileCount)) ||
        `${fileCount} documents · Processing securely`
      : t.readingSubtitle?.replace('{count}', String(fileCount)) ||
        `${fileCount} document · Processing securely`

  const docTitle =
    files.length === 1 && files[0].name
      ? files[0].name
      : t.readingTitle || 'Reading your document'

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

  const showTakingLonger = !error && takingLonger

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-7 animate-card-in">
      {/* Animated Document Scanner Mockup (only when active, not in error state) */}
      {!error && (
        <div className="relative w-44 h-52">
          <div className="absolute left-5 top-3 w-36 h-44 bg-soft rounded-xl transform rotate-6" />
          <div className="absolute left-2 top-1.5 w-36 h-48 bg-surface border border-line rounded-xl p-5 flex flex-col gap-2.5 overflow-hidden shadow-sm">
            <div className="h-2.5 w-3/5 bg-ink rounded" />
            <div className="h-1.5 bg-line rounded mt-2.5" />
            <div className="h-1.5 w-4/5 bg-line rounded" />
            <div className="h-1.5 bg-brand-soft rounded" />
            <div className="h-1.5 w-3/4 bg-line rounded" />
            <div className="h-1.5 bg-line rounded" />
            <div className="h-1.5 w-3/5 bg-brand-soft rounded" />
            <div className="sv-scan bg-brand" />
          </div>
        </div>
      )}

      {/* Title & Document Count */}
      {!error && (
        <div className="text-center flex flex-col gap-1.5 max-w-[340px]">
          <h2 className="font-heading font-bold text-[22px] sm:text-[24px] text-ink leading-tight truncate">
            {docTitle}
          </h2>
          <p className="text-[14px] text-muted">{fileLabel}</p>
          {multiReportProgress && (
            <div className="inline-flex items-center justify-center gap-1.5 px-3 py-1 bg-brand-soft text-brand font-semibold text-[13px] rounded-full mx-auto mt-1">
              <span>
                {(t.reportsProgress || 'Report {ready} of {total} ready')
                  .replace('{ready}', String(multiReportProgress.ready))
                  .replace('{total}', String(multiReportProgress.total))}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Stepper Card */}
      {!error && (
        <div className="w-full bg-surface border border-line rounded-card px-5 py-2 divide-y divide-line shadow-sm">
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
                    <span className="w-7 h-7 rounded-full bg-brand flex items-center justify-center">
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
                    <span className="sv-spin w-6 h-6 rounded-full border-[3px] border-brand-soft border-t-brand" />
                  )}
                  {isPending && (
                    <span className="w-5 h-5 rounded-full border-2 border-line" />
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
      )}

      {/* 20s Reassurance Notice (WEB-5) */}
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
            className="shrink-0 mt-0.5 text-muted"
          >
            <circle cx="12" cy="12" r="10" />
            <polyline points="12 6 12 12 16 14" />
          </svg>
          <span className="text-[13.5px] leading-relaxed">
            {t.reassuranceText ||
              'Still reading... Documents with complex tables or multiple pages take a little longer'}
          </span>
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
