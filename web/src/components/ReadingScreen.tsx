import { useState, useEffect } from 'react'
import { getDictionary } from '../i18n'

interface ReadingScreenProps {
  files: File[]
  lang: string
  langName: string
  error: string | null
  onRetry: () => void
  onCancel: () => void
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

  const steps = [
    { label: t.stepReading || 'Reading the notice' },
    { label: t.stepChecking || 'Checking against the document' },
    {
      label:
        t.stepWriting?.replace('{lang}', langName) ||
        `Writing in ${langName}`,
    },
  ]

  return (
    <div className="flex-1 flex flex-col items-center justify-center p-6 gap-7 animate-card-in">
      {/* Animated Document Scanner Mockup */}
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

      {/* Title & Document Count */}
      <div className="text-center flex flex-col gap-1.5 max-w-[340px]">
        <h2 className="font-heading font-bold text-[22px] sm:text-[24px] text-ink leading-tight truncate">
          {docTitle}
        </h2>
        <p className="text-[14px] text-muted">{fileLabel}</p>
      </div>

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

      {/* Error state card if API fails */}
      {error && (
        <div className="w-full bg-[#FFF4DE] border border-[#F4DDB0] rounded-card p-5 flex flex-col gap-3.5 text-[#5A3500] animate-card-in">
          <div className="flex items-start gap-3">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5 text-[#B42318]"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <div className="flex-1 flex flex-col gap-1">
              <span className="text-[15px] font-bold">
                {t.errorTitle || 'Could not read notice'}
              </span>
              <p className="text-[14px] leading-relaxed text-[#5A3500]">
                {error}
              </p>
            </div>
          </div>

          <div className="flex gap-2.5 pt-2">
            <button
              type="button"
              onClick={onRetry}
              className="flex-1 h-11 rounded-full bg-brand text-white font-bold text-[14px] flex items-center justify-center hover:opacity-95 transition-opacity"
            >
              {t.retry || 'Try again'}
            </button>
            <button
              type="button"
              onClick={onCancel}
              className="flex-1 h-11 rounded-full border border-line bg-surface text-ink font-bold text-[14px] flex items-center justify-center hover:bg-soft transition-colors"
            >
              {t.goBack || 'Go back'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
