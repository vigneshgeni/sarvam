import { useState, useEffect } from 'react'
import { getDictionary, LANGUAGES } from '../i18n'
import type { AppErrorInfo } from '../types'

interface ReadingScreenProps {
  files: File[]
  lang: string
  langName: string
  error: AppErrorInfo | null
  onRetry: () => void
  onCancel: () => void
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
        <h2 className="font-heading font-bold text-[22px] text-ink leading-tight">
          {t.errorTitle || 'Could not read notice'}
        </h2>
        <p className="text-[14.5px] leading-relaxed text-[#5A3500] bg-[#FFF4DE] border border-[#F4DDB0] p-4 rounded-xl text-left">
          {error.messageLocal}
        </p>
      </div>

      {/* Action buttons with 429 countdown */}
      <div className="w-full flex flex-col gap-2.5 pt-2">
        <button
          type="button"
          onClick={onRetry}
          disabled={secondsLeft > 0}
          className={`w-full h-12 rounded-full font-bold text-[15px] flex items-center justify-center transition-all ${
            secondsLeft > 0
              ? 'bg-soft text-muted cursor-not-allowed border border-line'
              : 'bg-brand text-white hover:opacity-95 active:scale-[0.99] shadow-sm'
          }`}
        >
          {secondsLeft > 0
            ? (t.retryIn || 'Try again in {seconds}s').replace(
                '{seconds}',
                String(secondsLeft)
              )
            : t.retry || 'Try again'}
        </button>

        <button
          type="button"
          onClick={onCancel}
          className="w-full h-12 rounded-full border border-line bg-surface text-ink font-semibold text-[15px] flex items-center justify-center hover:bg-soft transition-colors active:scale-[0.99]"
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
}: ReadingScreenProps) {
  const t = getDictionary(lang)
  const [step, setStep] = useState<number>(0)
  const [takingLonger, setTakingLonger] = useState<boolean>(false)

  // Find native language label
  const currentLangObj = LANGUAGES.find((l) => l.id === lang) || LANGUAGES[0]
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

  // 15-second delay notice
  useEffect(() => {
    if (error) return

    const tLonger = setTimeout(() => {
      setTakingLonger(true)
    }, 15000)

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
      : t.readingTitle || 'Reading the notice'

  // Step labels use native language names
  const steps = [
    { label: t.stepReading || 'Reading the notice' },
    { label: t.stepChecking || 'Checking against the document' },
    {
      label:
        t.stepWriting?.replace('{lang}', nativeLangName) ||
        `Writing in ${nativeLangName}`,
    },
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

      {/* 15s Taking Longer Notice */}
      {showTakingLonger && (
        <div className="w-full bg-soft border border-line rounded-card p-4 flex items-start gap-3 text-ink/80 animate-card-in">
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
            {t.takingLonger ||
              'Taking longer than usual. Long documents can take up to a minute.'}
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
