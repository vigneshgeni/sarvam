import { useState, useEffect } from 'react'
import { LANGUAGES, getDictionary } from '../i18n'
import type { ExplainResponse, AppErrorInfo } from '../types'
import { formatDate, buildCalculatedChipText } from '../utils/date'

interface ResultScreenProps {
  result: ExplainResponse
  files: File[]
  lang: string
  isTranslating?: boolean
  translateError?: AppErrorInfo | null
  onChangeLanguage: (newLang: string) => void
  onRetryTranslate?: () => void
  onDismissTranslateError?: () => void
  onGoHome: () => void
  onA11yClick: () => void
}

function TranslateErrorCard({
  error,
  t,
  onRetry,
  onDismiss,
}: {
  error: AppErrorInfo
  t: Record<string, string>
  onRetry?: () => void
  onDismiss?: () => void
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
    <div className="bg-[#FFF4DE] border border-[#F4DDB0] rounded-card p-4 flex flex-col gap-3 text-[#5A3500] animate-card-in shadow-sm">
      <div className="flex items-start gap-2.5">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0 mt-0.5 text-[#B42318]"
        >
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <div className="flex-1 min-w-0 flex flex-col gap-0.5">
          <span className="text-[14px] font-bold">
            {t.errorTitle || 'Could not read notice'}
          </span>
          <p className="text-[13px] leading-relaxed m-0">
            {error.messageLocal}
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            disabled={secondsLeft > 0}
            className={`h-9 px-4 rounded-full font-bold text-[13px] flex items-center justify-center transition-all ${
              secondsLeft > 0
                ? 'bg-soft text-muted cursor-not-allowed border border-line'
                : 'bg-brand text-white hover:opacity-95'
            }`}
          >
            {secondsLeft > 0
              ? (t.retryIn || 'Try again in {seconds}s').replace(
                  '{seconds}',
                  String(secondsLeft)
                )
              : t.retry || 'Try again'}
          </button>
        )}
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="h-9 px-3 rounded-full border border-line bg-surface text-ink text-[13px] font-semibold hover:bg-soft transition-colors"
          >
            {t.dismiss || 'Dismiss'}
          </button>
        )}
      </div>
    </div>
  )
}

function EvidenceChip({
  evidence,
  hasQuote = false,
  isOpen,
  onToggle,
  t,
}: {
  evidence: string
  hasQuote?: boolean
  isOpen: boolean
  onToggle: () => void
  t: Record<string, string>
}) {
  const isMatched = evidence === 'matched'
  const isCalculated = evidence === 'calculated'
  const label = isMatched
    ? t.found || 'Found in your document'
    : isCalculated
    ? t.calculated || 'Calculated'
    : t.checkOriginal || 'Check against original'

  const content = (
    <>
      {isMatched && (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="3"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <polyline points="20 6 9 17 4 12" />
        </svg>
      )}
      {!isMatched && !isCalculated && (
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
      {isCalculated && (
        <svg
          width="13"
          height="13"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="shrink-0"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 14 14" />
        </svg>
      )}
      <span className="truncate">{label}</span>
      {hasQuote && (
        <svg
          width="12"
          height="12"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          className={`shrink-0 transition-transform ${isOpen ? 'rotate-180' : ''}`}
        >
          <path d="M6 9l6 6 6-6" />
        </svg>
      )}
    </>
  )

  const chipClassName = `inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg text-[12.5px] font-semibold border transition-colors shrink-0 max-w-full ${
    isMatched
      ? 'bg-brand-soft text-brand border-brand/20'
      : isCalculated
      ? 'bg-[#E6EEFB] text-[#1D4ED8] border-[#1D4ED8]/20'
      : 'bg-soft text-muted border-line hover:text-ink'
  }`

  if (!hasQuote) {
    return <span className={chipClassName}>{content}</span>
  }

  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={isOpen}
      className={chipClassName}
    >
      {content}
    </button>
  )
}

function QuoteAccordion({
  page,
  quote,
  evidence,
  t,
}: {
  page?: number
  quote: string
  evidence: string
  t: Record<string, string>
}) {
  const isCheckOriginal = evidence === 'check_original'
  const pageText = page
    ? t.pageLabel?.replace('{page}', String(page)) ||
      `${t.pageWord || 'Page'} ${page}`
    : t.pageWord || 'Page'

  return (
    <div className="w-full mt-2 bg-soft border border-line rounded-xl p-3 flex flex-col gap-2 text-[13px] animate-card-in">
      {/* Line 1: Localised Page label */}
      <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
        {pageText}
      </div>

      {/* Line 2: Red "compare with your paper" note on separate line */}
      {isCheckOriginal && (
        <div className="text-[11.5px] font-semibold text-[#B42318] leading-tight">
          {t.comparePaper || 'Please compare with your paper'}
        </div>
      )}

      {/* Line 3: Original quote box labelled in UI language, verbatim quote in original language */}
      <div className="flex flex-col gap-1 pt-0.5">
        <span className="text-[11px] font-semibold text-muted">
          {t.originalText || 'Original text from your document'}:
        </span>
        <blockquote className="m-0 italic font-mono text-[12.5px] leading-relaxed text-ink/90 bg-surface/80 p-2.5 rounded-lg border border-line/50 break-words">
          "{quote}"
        </blockquote>
      </div>
    </div>
  )
}

export default function ResultScreen({
  result,
  files,
  lang,
  isTranslating = false,
  translateError = null,
  onChangeLanguage,
  onRetryTranslate,
  onDismissTranslateError,
  onGoHome,
  onA11yClick,
}: ResultScreenProps) {
  // During language switch, keep the previous language's labels together with previous content
  // until new content arrives (show translating banner), so screen never mixes two languages
  const contentLang = result.language || lang
  const t = getDictionary(contentLang)
  const currentLangObj = LANGUAGES.find((l) => l.id === lang) || LANGUAGES[0]

  // Track checked / completed actions
  const [doneActions, setDoneActions] = useState<Record<number, boolean>>({})
  // Track open quote/passage accordions for actions, warnings, and facts
  const [openActionQuotes, setOpenActionQuotes] = useState<Record<number, boolean>>({})
  const [openWarningQuotes, setOpenWarningQuotes] = useState<Record<number, boolean>>({})
  const [openFactQuotes, setOpenFactQuotes] = useState<Record<number, boolean>>({})

  const toggleActionDone = (index: number) => {
    setDoneActions((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  const toggleActionQuote = (index: number) => {
    setOpenActionQuotes((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  const toggleWarningQuote = (index: number) => {
    setOpenWarningQuotes((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  const toggleFactQuote = (index: number) => {
    setOpenFactQuotes((prev) => ({ ...prev, [index]: !prev[index] }))
  }

  // Format document type badge
  const docTypeBadge =
    result.doc_type?.replace(/_/g, ' ').toUpperCase() || 'DOCUMENT'

  // Format evidence summary line per Section 5 & requirement B
  const summary = result.evidence_summary || {
    matched: 0,
    check_original: 0,
    calculated: 0,
  }
  const totalPoints =
    (summary.matched || 0) +
    (summary.check_original || 0) +
    (summary.calculated || 0)

  const renderEvidenceSummary = () => {
    if (totalPoints === 0) return null

    // If all items are check_original (e.g. photo input)
    if (summary.matched === 0 && summary.check_original > 0) {
      if (contentLang === 'ta') {
        return `${summary.check_original} தகவல்களும் அசல் ஆவணத்துடன் சரிபார்க்கப்பட வேண்டும் (புகைப்படம்)`
      }
      if (contentLang === 'hi') {
        return `सभी ${summary.check_original} बातें मूल दस्तावेज़ से जाँची जानी हैं (फ़ोटो)`
      }
      return `All ${summary.check_original} points to check against original (photo)`
    }

    // PDF or mixed: show exact count (renamed to "found in your document")
    if (contentLang === 'ta') {
      const parts = [`${totalPoints} தகவல்களில் ${summary.matched} உங்கள் ஆவணத்தில் உள்ளது`]
      if (summary.check_original > 0) {
        parts.push(`${summary.check_original} அசல் ஆவணத்துடன் சரிபார்க்கப்பட வேண்டும்`)
      }
      if (summary.calculated > 0) {
        parts.push(`${summary.calculated} கணக்கிடப்பட்டது`)
      }
      return parts.join(' · ')
    }

    if (contentLang === 'hi') {
      const parts = [`${totalPoints} में से ${summary.matched} बातें आपके दस्तावेज़ में मिलीं`]
      if (summary.check_original > 0) {
        parts.push(`${summary.check_original} मूल दस्तावेज़ से जाँचें`)
      }
      if (summary.calculated > 0) {
        parts.push(`${summary.calculated} गणना की गई`)
      }
      return parts.join(' · ')
    }

    // Default English
    const parts = [`${summary.matched} of ${totalPoints} points found in your document`]
    if (summary.check_original > 0) {
      parts.push(`${summary.check_original} to check against original`)
    }
    if (summary.calculated > 0) {
      parts.push(`${summary.calculated} calculated`)
    }
    return parts.join(' · ')
  }

  return (
    <div className="flex-1 flex flex-col justify-between animate-card-in">
      <div className="flex flex-col gap-4">
        {/* Top Header Bar */}
        <div className="flex items-center gap-2.5">
          {/* Back to Home Button */}
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Back to home"
            className="w-11 h-11 rounded-full border border-line bg-surface text-ink flex items-center justify-center hover:bg-soft transition-colors active:scale-95 shrink-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>

          {/* Language Selector Dropdown */}
          <label className="flex-1 relative h-11 rounded-full border border-line bg-surface flex items-center gap-2 px-3.5 pr-8 text-[15px] font-semibold text-ink min-w-0 cursor-pointer hover:border-muted/40 transition-colors">
            {isTranslating ? (
              <span className="sv-spin w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand shrink-0" />
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-brand"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="2" y1="12" x2="22" y2="12" />
                <path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
              </svg>
            )}
            <span className="truncate">{currentLangObj.label}</span>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="absolute right-3.5 shrink-0 text-muted"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
            <select
              aria-label="Explanation language"
              value={lang}
              onChange={(e) => onChangeLanguage(e.target.value)}
              className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
            >
              {LANGUAGES.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.label}
                </option>
              ))}
            </select>
          </label>

          {/* Accessibility settings button */}
          <button
            type="button"
            onClick={onA11yClick}
            aria-label={t.a11yTitle}
            className="w-11 h-11 rounded-full border border-line bg-surface text-ink flex items-center justify-center hover:bg-soft transition-colors active:scale-95 shrink-0"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="4.5" r="1.8" />
              <path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M9 21l3-6.5 3 6.5" />
            </svg>
          </button>
        </div>

        {/* Inline Translation Loading Indicator (stays with previous language labels until new content arrives) */}
        {isTranslating && (
          <div className="bg-brand-soft border border-brand/20 text-brand px-3.5 py-2.5 rounded-xl flex items-center gap-2.5 text-[13.5px] font-semibold animate-card-in">
            <span className="sv-spin w-4 h-4 rounded-full border-2 border-brand/30 border-t-brand shrink-0" />
            <span>{t.translating || 'Translating notice...'}</span>
          </div>
        )}

        {/* Translation Error Card with 429 countdown and Retry button */}
        {translateError && (
          <TranslateErrorCard
            key={`${translateError.statusCode}-${translateError.retryAfter || 0}-${translateError.messageLocal}`}
            error={translateError}
            t={t}
            onRetry={onRetryTranslate}
            onDismiss={onDismissTranslateError}
          />
        )}

        {/* Document Header & Evidence Summary */}
        <div className="flex flex-col gap-2 pt-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[12px] font-bold tracking-[0.08em] uppercase text-brand">
              {docTypeBadge}
            </span>
            {result.report_date && (
              <span className="text-[12px] font-medium text-muted bg-soft px-2.5 py-0.5 rounded-full border border-line/60">
                {formatDate(result.report_date, contentLang)}
              </span>
            )}
          </div>

          <h1 className="font-heading font-bold text-[25px] sm:text-[27px] text-ink leading-[1.2] tracking-tight">
            {result.title}
          </h1>

          {result.report_title && result.report_title !== result.title && (
            <p className="text-[14px] text-muted font-medium m-0">
              {result.report_title}
            </p>
          )}

          {/* Evidence summary line */}
          {totalPoints > 0 && (
            <div className="flex items-center gap-2 text-[13.5px] font-semibold text-brand pt-1">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
                <path d="M9 12l2 2 4-4" />
              </svg>
              <span>{renderEvidenceSummary()}</span>
            </div>
          )}

          {/* Processed Files Badges */}
          {files.length > 0 && (
            <div className="flex gap-2 overflow-x-auto no-scrollbar pt-1">
              {files.map((file, i) => {
                const isPdf =
                  file.name.endsWith('.pdf') || file.type === 'application/pdf'
                return (
                  <span
                    key={i}
                    className="shrink-0 flex items-center gap-2 h-9 px-2.5 rounded-xl border border-line bg-surface max-w-[240px]"
                  >
                    <span
                      className={`h-6 px-1.5 rounded text-[10px] font-bold flex items-center justify-center ${
                        isPdf
                          ? 'bg-[#FDECEA] text-[#B42318]'
                          : 'bg-brand-soft text-brand'
                      }`}
                    >
                      {isPdf ? 'PDF' : 'IMG'}
                    </span>
                    <span className="text-[12.5px] font-semibold text-ink truncate">
                      {file.name}
                    </span>
                  </span>
                )
              })}
            </div>
          )}
        </div>

        {/* ========================================================
            ORDER:
            1. What you need to do
            2. In simple words
            3. Watch out
            4. Key facts
            5. Conflicts if any
            6. Disclaimer
            7. Bottom bar Listen + Share
           ======================================================== */}

        {/* 1. WHAT YOU NEED TO DO */}
        {result.actions && result.actions.length > 0 && (
          <section className="bg-surface border border-line rounded-card p-5 flex flex-col gap-3 shadow-sm animate-card-in">
            <h2 className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted m-0">
              {t.actionsTitle || 'What you need to do'}
            </h2>

            <div className="flex flex-col divide-y divide-line/70">
              {result.actions.map((act, i) => {
                const isDone = !!doneActions[i]
                const isQuoteOpen = !!openActionQuotes[i]

                const isRecurring =
                  act.date_status === 'recurring' || !!act.recurrence
                const isPassed = !isRecurring && act.date_status === 'passed'
                const isCalculated =
                  !isRecurring && act.date_status === 'calculated'
                const isUpcoming =
                  !isRecurring && act.date_status === 'upcoming' && !!act.due_date

                return (
                  <div key={i} className="flex flex-col gap-2.5 py-3 first:pt-1 last:pb-1">
                    <div className="flex items-start gap-3">
                      {/* Checkbox toggle */}
                      <button
                        type="button"
                        onClick={() => toggleActionDone(i)}
                        aria-label={`${t.markDone || 'Mark as done'}: ${act.text}`}
                        aria-pressed={isDone}
                        className="w-6 h-6 rounded-lg border-2 mt-0.5 flex items-center justify-center shrink-0 transition-colors active:scale-90"
                        style={{
                          borderColor: isDone ? '#146B4E' : '#C9CAC3',
                          backgroundColor: isDone ? '#146B4E' : '#FFFFFF',
                        }}
                      >
                        {isDone && (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="3"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d="M5 12l4 4 10-10" />
                          </svg>
                        )}
                      </button>

                      {/* Action text & chips */}
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <span
                          className={`text-[16px] leading-[1.45] text-ink font-medium ${
                            isDone ? 'line-through opacity-50' : ''
                          }`}
                        >
                          {act.text}
                        </span>

                        {/* Chips Row: on its own line below text, wrapping cleanly at 360px without overlapping */}
                        <div className="w-full flex flex-wrap items-center gap-2 pt-0.5">
                          {/* Recurring actions */}
                          {isRecurring && (
                            <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#F0FDF4] text-[#166534] border border-[#BBF7D0] text-[12.5px] font-semibold">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="shrink-0"
                              >
                                <path d="M21.5 2v6h-6M2.5 22v-6h6M2 11.5a10 10 0 0 1 18.8-4.3M22 12.5a10 10 0 0 1-18.8 4.2" />
                              </svg>
                              <span>{act.recurrence || t.recurring || 'Recurring schedule'}</span>
                            </span>
                          )}

                          {/* Passed date: uses localised date */}
                          {isPassed && (
                            <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-[#FDECEA] text-[#B42318] text-[12.5px] font-bold">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2.2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="shrink-0"
                              >
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                              <span>
                                {t.datePassed || 'Date has passed'}
                                {act.due_date ? ` · ${formatDate(act.due_date, contentLang)}` : ''}
                              </span>
                            </span>
                          )}

                          {/* Calculated deadline: built in UI language from deadline_days, wrapping on its own line without overlap */}
                          {isCalculated && (
                            <span className="inline-flex items-center gap-1.5 min-h-[32px] px-2.5 py-1 rounded-lg bg-[#E6EEFB] text-[#1D4ED8] text-[12.5px] font-bold max-w-full break-words">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="shrink-0"
                              >
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              <span className="break-words">
                                {buildCalculatedChipText(
                                  act.due_date,
                                  act.deadline_days,
                                  t,
                                  contentLang
                                )}
                              </span>
                            </span>
                          )}

                          {/* Upcoming deadline: localised */}
                          {isUpcoming && (
                            <span className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-lg bg-soft text-ink text-[12.5px] font-semibold">
                              <svg
                                width="14"
                                height="14"
                                viewBox="0 0 24 24"
                                fill="none"
                                stroke="currentColor"
                                strokeWidth="2"
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                className="shrink-0"
                              >
                                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                                <line x1="16" y1="2" x2="16" y2="6" />
                                <line x1="8" y1="2" x2="8" y2="6" />
                                <line x1="3" y1="10" x2="21" y2="10" />
                              </svg>
                              <span>{formatDate(act.due_date, contentLang)}</span>
                            </span>
                          )}

                          {/* Evidence Chip */}
                          <EvidenceChip
                            evidence={act.evidence || 'check_original'}
                            hasQuote={Boolean(act.quote)}
                            isOpen={isQuoteOpen}
                            onToggle={() => act.quote && toggleActionQuote(i)}
                            t={t}
                          />
                        </div>

                        {/* Source Passage Accordion (revealed on tap) */}
                        {isQuoteOpen && act.quote && (
                          <QuoteAccordion
                            page={act.page}
                            quote={act.quote}
                            evidence={act.evidence || 'check_original'}
                            t={t}
                          />
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 2. IN SIMPLE WORDS */}
        {result.summary && result.summary.length > 0 && (
          <section className="bg-surface border border-line rounded-card p-5 flex flex-col gap-2.5 shadow-sm animate-card-in">
            <h2 className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted m-0">
              {t.summaryTitle || 'In simple words'}
            </h2>
            <div className="text-[16px] sm:text-[17px] leading-[1.55] font-medium text-ink flex flex-col gap-2">
              {result.summary.map((para, i) => (
                <p key={i} className="m-0">
                  {para}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* 3. WATCH OUT (Steady amber card, NO animation) */}
        {result.warnings && result.warnings.length > 0 && (
          <section className="bg-[#FFF4DE] border border-[#F4DDB0] rounded-card p-5 flex gap-3.5 text-[#5A3500] shadow-sm animate-card-in">
            <svg
              width="24"
              height="24"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <div className="flex-1 flex flex-col gap-2">
              <h2 className="text-[12px] font-bold tracking-[0.08em] uppercase text-[#5A3500] m-0">
                {t.riskTitle || 'Watch out'}
              </h2>
              <div className="flex flex-col gap-3">
                {result.warnings.map((warn, i) => {
                  const isQuoteOpen = !!openWarningQuotes[i]
                  return (
                    <div key={i} className="flex flex-col gap-2">
                      <p className="text-[15px] sm:text-[16px] leading-[1.45] font-medium m-0">
                        {warn.text}
                      </p>

                      {/* Evidence chip (found / check against original / calculated) */}
                      {(warn.evidence || warn.quote) && (
                        <div>
                          <EvidenceChip
                            evidence={warn.evidence || 'check_original'}
                            hasQuote={Boolean(warn.quote)}
                            isOpen={isQuoteOpen}
                            onToggle={() => warn.quote && toggleWarningQuote(i)}
                            t={t}
                          />
                          {isQuoteOpen && warn.quote && (
                            <QuoteAccordion
                              page={warn.page}
                              quote={warn.quote}
                              evidence={warn.evidence || 'check_original'}
                              t={t}
                            />
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </section>
        )}

        {/* 4. KEY FACTS */}
        {result.facts && result.facts.length > 0 && (
          <section className="bg-surface border border-line rounded-card p-5 flex flex-col gap-3 shadow-sm animate-card-in">
            <h2 className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted m-0">
              {t.factsTitle || 'Key facts'}
            </h2>

            <div className="flex flex-col divide-y divide-line/70">
              {result.facts.map((fact, i) => {
                const isQuoteOpen = !!openFactQuotes[i]
                return (
                  <div key={i} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1">
                    <div className="flex items-start gap-3">
                      <span className="w-2 h-2 rounded-full bg-brand mt-2 shrink-0" />
                      <div className="flex-1 min-w-0 flex flex-col gap-2">
                        <span className="text-[15.5px] leading-[1.45] text-ink font-medium">
                          {fact.text}
                        </span>

                        {/* Evidence chip (found / check against original / calculated) */}
                        {(fact.evidence || fact.quote) && (
                          <div>
                            <EvidenceChip
                              evidence={fact.evidence || 'check_original'}
                              hasQuote={Boolean(fact.quote)}
                              isOpen={isQuoteOpen}
                              onToggle={() => fact.quote && toggleFactQuote(i)}
                              t={t}
                            />
                            {isQuoteOpen && fact.quote && (
                              <QuoteAccordion
                                page={fact.page}
                                quote={fact.quote}
                                evidence={fact.evidence || 'check_original'}
                                t={t}
                              />
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 5. CONFLICTS IF ANY */}
        {result.conflicts && result.conflicts.length > 0 && (
          <section className="bg-[#FFF4DE] border border-[#F4DDB0] rounded-card p-5 flex flex-col gap-2.5 text-[#5A3500] shadow-sm animate-card-in">
            <div className="flex items-center gap-2">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="text-[#B42318]"
              >
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
              <h2 className="text-[13px] font-bold text-[#B42318] m-0">
                {t.conflictsTitle || 'Conflicting details in document'}
              </h2>
            </div>
            <p className="text-[13.5px] leading-relaxed text-[#5A3500] m-0">
              {t.conflictsDesc ||
                'This document gives conflicting dates or details — check with the office.'}
            </p>
            <ul className="m-0 pl-5 text-[14px] leading-relaxed flex flex-col gap-1">
              {result.conflicts.map((conf, i) => (
                <li key={i}>{conf}</li>
              ))}
            </ul>
          </section>
        )}

        {/* 6. DISCLAIMER LINE */}
        <p className="text-[12.5px] leading-relaxed text-muted px-1 m-0">
          {t.disclaimer ||
            'Sarvam explains your document. It does not replace your doctor, insurer or government office.'}
        </p>
      </div>

      {/* 7. BOTTOM BAR: LISTEN + SHARE (no action yet) */}
      <div className="sticky bottom-0 -mx-5 px-5 pt-3 pb-5 mt-6 border-t border-line bg-bg flex gap-2.5">
        {/* Listen Button (violet outline) */}
        <button
          type="button"
          onClick={() => {
            console.log('Listen clicked (action coming in Step 6)')
          }}
          className="flex-1 h-14 rounded-full border-[1.5px] border-voice bg-voice-soft text-[#3B2E96] font-bold text-[16px] flex items-center justify-center gap-2 hover:bg-voice-soft/80 transition-colors active:scale-95"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
            <path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
          <span>{t.listen || 'Listen'}</span>
        </button>

        {/* Share Button (green) */}
        <button
          type="button"
          onClick={() => {
            console.log('Share clicked (action coming in Step 7)')
          }}
          className="flex-1 h-14 rounded-full bg-brand text-white font-bold text-[16px] flex items-center justify-center gap-2 hover:opacity-95 transition-transform active:scale-95 shadow-sm"
        >
          <svg
            width="19"
            height="19"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
            <polyline points="16 6 12 2 8 6" />
            <line x1="12" y1="2" x2="12" y2="15" />
          </svg>
          <span>{t.share || 'Share'}</span>
        </button>
      </div>
    </div>
  )
}
