import { useState, useEffect } from 'react'
import { SUPPORTED_LANGS, getDictionary, getLocalisedDocType } from '../i18n'
import type { ExplainResponse, AppErrorInfo, MultiReportCard } from '../types'
import { formatDate } from '../utils/date'
import {
  CalendarIcon,
  SparklesIcon,
  EyeIcon,
  CheckIcon,
  AlertTriangleIcon,
  ShareIcon,
  PlayIcon,
  MessageSquareIcon,
  A11ySlidersIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
} from './icons'
import Sheet from './Sheet'
import GlanceCard from './GlanceCard'
import PlacesContactsCard from './PlacesContactsCard'
import MedicineCard from './MedicineCard'
import FeedbackBlock from '../features/feedback/FeedbackBlock'
import ListenSheet from './ListenSheet'
import AskSheet from './AskSheet'
import { generateIcs, downloadIcs, hashString, type CalendarEventInput } from '../utils/ics'
import { buildSharedText, shareToWhatsApp, shareToEmail, copyToClipboard } from '../utils/share'

interface ResultScreenProps {
  result: ExplainResponse
  files: File[]
  lang: string
  isTranslating?: boolean
  translateError?: AppErrorInfo | null
  reReadInLang?: string | null
  translateFailedLang?: string | null
  onChangeLanguage: (newLang: string) => void
  onRetryTranslate?: () => void
  onDismissTranslateError?: () => void
  onGoHome: () => void
  onA11yClick: () => void
  multiReports?: MultiReportCard[]
  onRetrySingleReport?: (index: number) => void
}

export default function ResultScreen({
  result: initialResult,
  files,
  lang,
  isTranslating = false,
  translateError = null,
  reReadInLang = null,
  translateFailedLang = null,
  onChangeLanguage,
  onRetryTranslate,
  onDismissTranslateError,
  onGoHome,
  onA11yClick,
  multiReports,
  onRetrySingleReport,
}: ResultScreenProps) {
  const [selectedReportIndex, setSelectedReportIndex] = useState<number | null>(null)

  const result =
    multiReports &&
    selectedReportIndex !== null &&
    multiReports[selectedReportIndex]?.result
      ? multiReports[selectedReportIndex].result!
      : initialResult

  const contentLang = result.language || (lang === 'auto' ? 'en' : lang)
  const t = getDictionary(contentLang)
  const currentLangObj = SUPPORTED_LANGS.find((l) => l.id === lang) || SUPPORTED_LANGS[1]

  // Action done state
  const [doneActions, setDoneActions] = useState<Record<number, boolean>>({})
  // Open quote accordions
  const [openActionQuotes, setOpenActionQuotes] = useState<Record<number, boolean>>({})
  const [openWarningQuotes, setOpenWarningQuotes] = useState<Record<number, boolean>>({})
  const [openFactQuotes, setOpenFactQuotes] = useState<Record<number, boolean>>({})

  // Key facts disclosure (show first 5, then "Show all")
  const [showAllFacts, setShowAllFacts] = useState<boolean>(false)

  // Sheets state
  const [isListenOpen, setIsListenOpen] = useState(false)
  const [isAskOpen, setIsAskOpen] = useState(false)
  const [isShareOpen, setIsShareOpen] = useState(false)

  // Share state
  const [hidePersonal, setHidePersonal] = useState(true)
  const [copySuccess, setCopySuccess] = useState(false)

  // Top bar scroll hairline
  const [isScrolled, setIsScrolled] = useState(false)
  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 12)
    }
    window.addEventListener('scroll', handleScroll, { passive: true })
    return () => window.removeEventListener('scroll', handleScroll)
  }, [])

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

  // Quote checker drawer (scrolls into view or displays original text)
  const handleCheckOriginal = (quote?: string, page?: number) => {
    if (!quote) return
    alert(`Page ${page || 1}: "${quote}"`)
  }

  // Actions done calculation
  const totalActions = result.actions?.length || 0
  const completedActionsCount = Object.values(doneActions).filter(Boolean).length

  // Calendar export handlers
  const handleAddActionToCalendar = (act: any, idx: number) => {
    if (!act.due_date && !act.recurrence) return
    const isRecurring = !!act.recurrence
    const todayStr = new Date().toISOString().slice(0, 10)
    const startDate = act.due_date || todayStr

    const descParts: string[] = []
    if (act.date_status === 'calculated') descParts.push('Calculated date.')
    if (act.quote) descParts.push(`Quote: "${act.quote}"`)
    descParts.push('Sarvam Document Reader.')

    const events: CalendarEventInput[] = [
      {
        uid: hashString(`${result.title}-act-${idx}`),
        title: act.text,
        description: descParts.join(' '),
        startDate: startDate,
        isAllDay: true,
        rrule: isRecurring ? 'FREQ=MONTHLY' : undefined,
        alarmTrigger: 'PT9H',
      },
    ]

    const ics = generateIcs(events)
    downloadIcs(`action-${idx + 1}.ics`, ics)
  }

  const handleAddAllDates = () => {
    if (!result.actions) return
    const validActions = result.actions.filter(
      (a) => a.date_status !== 'passed' && (a.due_date || a.recurrence)
    )
    if (validActions.length === 0) return

    const events: CalendarEventInput[] = validActions.map((act, idx) => {
      const todayStr = new Date().toISOString().slice(0, 10)
      const startDate = act.due_date || todayStr
      return {
        uid: hashString(`${result.title}-act-all-${idx}`),
        title: act.text,
        description: act.date_status === 'calculated' ? 'Calculated date.' : undefined,
        startDate: startDate,
        isAllDay: true,
        alarmTrigger: 'PT9H',
      }
    })

    const ics = generateIcs(events)
    downloadIcs('all-actions.ics', ics)
  }

  const sharedText = buildSharedText(result, contentLang, hidePersonal)

  const handleCopyShared = async () => {
    const ok = await copyToClipboard(sharedText)
    if (ok) {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const factsToDisplay = showAllFacts
    ? result.facts || []
    : (result.facts || []).slice(0, 5)

  // Multi-Reports Overview Card List
  if (multiReports && multiReports.length > 1 && selectedReportIndex === null) {
    return (
      <div className="flex-1 flex flex-col justify-between animate-card-in pb-16">
        <div className="flex flex-col gap-4">
          {/* Top Bar */}
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onGoHome}
              aria-label="Back to home"
              className="btn-press w-11 h-11 rounded-full border border-[#E6E6E1] bg-white text-[#15171A] flex items-center justify-center hover:bg-[#F0F0EB] transition-colors shrink-0"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
            <h1 className="font-heading font-bold text-xl text-[#15171A]">
              {(t.reportsCount || '{count} reports').replace(
                '{count}',
                String(multiReports.length)
              )}
            </h1>
          </div>

          {/* Cards List */}
          <div className="flex flex-col gap-3">
            {multiReports.map((card, i) => (
              <div
                key={card.id || i}
                onClick={() => {
                  if (card.status === 'ready' && card.result) {
                    setSelectedReportIndex(i)
                  }
                }}
                className={`p-4 rounded-2xl border transition-all flex items-center justify-between gap-3 ${
                  card.status === 'ready'
                    ? 'bg-white border-[#E6E6E1] cursor-pointer hover:border-[#5B52D6] shadow-sm'
                    : 'bg-[#FFF4DE] border-[#F4DDB0]'
                }`}
              >
                <div>
                  <h3 className="font-bold text-sm text-[#15171A]">
                    {card.title || card.fileName}
                  </h3>
                  <p className="text-xs text-[#5E636B]">{card.fileName}</p>
                </div>
                {card.status === 'ready' ? (
                  <ChevronRightIcon className="w-5 h-5 text-[#5E636B]" />
                ) : (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation()
                      onRetrySingleReport?.(i)
                    }}
                    className="px-3 py-1 bg-[#146B4E] text-white text-xs font-semibold rounded-lg"
                  >
                    {t.retry || 'Retry'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col justify-between pb-28">
      {/* Translucent Sticky Top Bar with Backdrop Blur & Scroll Hairline (WEB-5) */}
      <div
        className={`sticky top-0 z-40 bg-white/85 backdrop-blur-md px-4 py-2.5 flex items-center justify-between gap-2 transition-shadow ${
          isScrolled ? 'border-b border-[#E6E6E1] shadow-xs' : ''
        }`}
      >
        <button
          type="button"
          onClick={onGoHome}
          aria-label="Back"
          className="btn-press w-10 h-10 rounded-full border border-[#E6E6E1] bg-white text-[#15171A] flex items-center justify-center hover:bg-[#F0F0EB] transition-colors shrink-0"
        >
          <ChevronRightIcon className="w-5 h-5 rotate-180" />
        </button>

        {/* Language selector dropdown */}
        <label className="flex-1 max-w-[200px] relative h-10 rounded-full border border-[#E6E6E1] bg-white flex items-center gap-1.5 px-3 pr-7 text-xs font-semibold text-[#15171A] min-w-0 cursor-pointer hover:border-[#5B52D6] transition-colors">
          <span className="truncate">{currentLangObj.label}</span>
          <ChevronDownIcon className="absolute right-2.5 w-4 h-4 text-[#5E636B]" />
          <select
            aria-label="Change language"
            value={lang}
            onChange={(e) => onChangeLanguage(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          >
            {SUPPORTED_LANGS.map((l) => (
              <option key={l.id} value={l.id} disabled={l.disabled}>
                {l.label} {l.badge ? `(${l.badge})` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* Accessibility Button (WEB-10) */}
        <button
          type="button"
          onClick={onA11yClick}
          aria-label={t.makeEasierToRead || 'Make it easier to read'}
          className="btn-press w-10 h-10 rounded-full border border-[#E6E6E1] bg-white text-[#15171A] flex items-center justify-center hover:bg-[#F0F0EB] transition-colors shrink-0"
        >
          <A11ySlidersIcon className="w-5 h-5" />
        </button>
      </div>

      <div className="flex flex-col gap-5 px-4 pt-3 max-w-[430px] mx-auto w-full">
        {/* Back to all reports button if viewing a report from multi-report set */}
        {multiReports && multiReports.length > 1 && (
          <button
            type="button"
            onClick={() => setSelectedReportIndex(null)}
            className="inline-flex items-center gap-1 text-xs font-semibold text-[#146B4E] hover:underline"
          >
            <ChevronRightIcon className="w-4 h-4 rotate-180" />
            <span>{t.backToReports || 'Back to all reports'}</span>
          </button>
        )}

        {/* Translating Shimmer Banner */}
        {isTranslating && (
          <div className="bg-[#FBF7EF] border border-[#F1EBDD] text-[#7A2E1B] px-3.5 py-2.5 rounded-2xl flex items-center gap-2.5 text-xs font-semibold animate-card-in">
            <span className="sv-spin w-4 h-4 rounded-full border-2 border-[#C2410C]/30 border-t-[#C2410C] shrink-0" />
            <span>{t.translating || 'Translating...'}</span>
          </div>
        )}

        {/* Explain Fallback Note (WEB-2) */}
        {reReadInLang && (
          <div className="bg-[#FBF7EF] border border-[#F1EBDD] text-[#5A3500] px-3 py-2 rounded-xl text-xs flex items-center gap-2">
            <SparklesIcon className="w-4 h-4 text-[#9A6700] shrink-0" />
            <span>
              {(t.reReadInLang || 'Re-read in {lang} (details may differ slightly)').replace(
                '{lang}',
                reReadInLang.toUpperCase()
              )}
            </span>
          </div>
        )}

        {/* Translate Error Banner */}
        {translateError && (
          <div className="bg-[#FFF4DE] border border-[#F4DDB0] text-[#5A3500] p-3 rounded-2xl flex items-center justify-between gap-2 text-xs">
            <span>{translateError.messageLocal}</span>
            {onDismissTranslateError && (
              <button
                type="button"
                onClick={onDismissTranslateError}
                className="btn-press px-2.5 py-1 bg-white border border-[#F4DDB0] font-bold rounded-lg text-xs"
              >
                {t.dismiss || 'Dismiss'}
              </button>
            )}
          </div>
        )}

        {/* Translate Fail Banner (WEB-2) */}
        {translateFailedLang && (
          <div className="bg-[#FFF4DE] border border-[#F4DDB0] text-[#5A3500] p-3 rounded-2xl flex items-center justify-between gap-2 text-xs">
            <span>
              {(t.translateFailBanner || "Couldn't translate to {lang}. Showing English.").replace(
                '{lang}',
                translateFailedLang.toUpperCase()
              )}
            </span>
            {onRetryTranslate && (
              <button
                type="button"
                onClick={onRetryTranslate}
                className="btn-press px-2.5 py-1 bg-white border border-[#F4DDB0] font-bold rounded-lg text-xs"
              >
                {t.retry || 'Try again'}
              </button>
            )}
          </div>
        )}

        {/* Document Language Note if auto detected (WEB-3) */}
        {lang === 'auto' && result.document_language && result.document_language !== 'en' && (
          <div className="text-xs text-[#5E636B] bg-[#F0F0EB] px-3 py-1.5 rounded-xl w-fit">
            {(t.docInLanguage || 'Document is in {lang}').replace(
              '{lang}',
              result.document_language.toUpperCase()
            )}
          </div>
        )}

        {/* WEB-6: AT A GLANCE CARD */}
        {result.glance && (
          <GlanceCard
            glance={result.glance}
            docType={result.doc_type || (result.document_type as string)}
            reportDateIso={result.report_date_iso}
            lang={contentLang}
            t={t}
            onCheckOriginal={handleCheckOriginal}
          />
        )}

        {/* Document Title Header if no glance card */}
        {!result.glance && (
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-bold uppercase tracking-wider text-[#146B4E]">
              {getLocalisedDocType(contentLang, result.doc_type || (result.document_type as string))}
            </span>
            <h1 className="font-heading font-bold text-2xl text-[#15171A] leading-tight">
              {result.title}
            </h1>
          </div>
        )}

        {/* WEB-7: PLACES AND CONTACTS CARD */}
        {(result.places || result.contacts) && (
          <PlacesContactsCard
            places={result.places}
            contacts={result.contacts}
            t={t}
            onCheckOriginal={handleCheckOriginal}
          />
        )}

        {/* WEB-8: MEDICINE REMINDERS CARD */}
        {result.medicines && result.medicines.length > 0 && (
          <MedicineCard
            medicines={result.medicines}
            resultId={result.title || 'med-doc'}
            t={t}
            onCheckOriginal={handleCheckOriginal}
          />
        )}

        {/* 1. WHAT YOU NEED TO DO */}
        {result.actions && result.actions.length > 0 && (
          <section className="bg-white border border-[#E6E6E1] rounded-[22px] p-5 flex flex-col gap-3 shadow-sm animate-card-in stagger-1">
            {/* Header with 28px icon tile & Progress Ring (WEB-5) */}
            <div className="flex items-center justify-between pb-1">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#ECEBFA] text-[#5B52D6] flex items-center justify-center shrink-0">
                  <CheckIcon className="w-4 h-4" />
                </div>
                <h2 className="text-sm font-bold text-[#15171A]">
                  {t.actionsTitle || 'What you need to do'}
                </h2>
              </div>

              {/* Progress Ring ("1 of 2 done") */}
              <div className="flex items-center gap-1.5 text-xs font-semibold text-[#5B52D6] bg-[#ECEBFA] px-2.5 py-1 rounded-full">
                <span>
                  {(t.actionsDoneCount || '{done} of {total} done')
                    .replace('{done}', String(completedActionsCount))
                    .replace('{total}', String(totalActions))}
                </span>
              </div>
            </div>

            {/* Actions List */}
            <div className="flex flex-col divide-y divide-[#F0F0EB]">
              {result.actions.map((act, i) => {
                const isDone = !!doneActions[i]
                const isQuoteOpen = !!openActionQuotes[i]
                const isPassed = act.date_status === 'passed'

                return (
                  <div key={i} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1">
                    <div className="flex items-start gap-3">
                      {/* Checkbox with Animated Tick (WEB-4, WEB-5) */}
                      <button
                        type="button"
                        onClick={() => toggleActionDone(i)}
                        className={`w-6 h-6 rounded-lg border-2 mt-0.5 flex items-center justify-center shrink-0 transition-colors btn-press ${
                          isDone
                            ? 'bg-[#146B4E] border-[#146B4E]'
                            : 'bg-white border-[#D8D8D2]'
                        }`}
                        aria-label={`Mark done: ${act.text}`}
                      >
                        {isDone && (
                          <svg
                            width="14"
                            height="14"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="#FFFFFF"
                            strokeWidth="3.2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            className="animate-tick-draw"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                        )}
                      </button>

                      {/* Action Text */}
                      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
                        <span
                          className={`text-base font-medium leading-relaxed text-[#15171A] transition-opacity ${
                            isDone ? 'line-through opacity-50' : ''
                          }`}
                        >
                          {act.text}
                        </span>

                        {/* Chips row */}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {act.due_date && (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                                isPassed
                                  ? 'bg-[#FDECEA] text-[#B42318]'
                                  : 'bg-[#E8F1FB] text-[#1D5FA8]'
                              }`}
                            >
                              <CalendarIcon className="w-3.5 h-3.5" />
                              {formatDate(act.due_date, contentLang)}
                            </span>
                          )}

                          {act.date_status === 'calculated' && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#F1ECFB] text-[#6D45C9]">
                              {t.calculatedChip || 'Calculated'}
                            </span>
                          )}

                          {/* Add to Calendar button (.ics) (WEB-8) */}
                          {!isPassed && (act.due_date || act.recurrence) && (
                            <button
                              type="button"
                              onClick={() => handleAddActionToCalendar(act, i)}
                              className="btn-press text-[11px] font-semibold text-[#5B52D6] bg-[#ECEBFA] hover:bg-[#D8D4EF] px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors"
                            >
                              <CalendarIcon className="w-3 h-3" />
                              {t.addToCalendar || 'Add to calendar'}
                            </button>
                          )}

                          {/* Evidence check original */}
                          {act.quote && (
                            <button
                              type="button"
                              onClick={() => toggleActionQuote(i)}
                              className="btn-press inline-flex items-center gap-1 text-[11px] font-semibold text-[#475A7A] bg-[#EAEFF7] hover:bg-[#DCE5F2] px-2 py-0.5 rounded-md transition-colors"
                            >
                              <EyeIcon className="w-3 h-3" />
                              {t.checkAgainstOriginal || 'Check original'}
                            </button>
                          )}
                        </div>

                        {/* Accordion Quote Box */}
                        {isQuoteOpen && act.quote && (
                          <div className="mt-2 p-2.5 bg-[#FBF7EF] border-l-2 border-[#5B52D6] rounded-r-xl text-xs text-[#15171A]">
                            <span className="font-semibold text-[#5E636B]">
                              Page {act.page}:
                            </span>
                            <p className="italic mt-0.5">“{act.quote}”</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Add all dates button (WEB-8) */}
            <div className="pt-2 flex justify-between items-center border-t border-[#F0F0EB]">
              <button
                type="button"
                onClick={handleAddAllDates}
                className="btn-press inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B52D6] hover:underline"
              >
                <CalendarIcon className="w-4 h-4" />
                {t.addAllDates || 'Add all dates (.ics)'}
              </button>
            </div>
          </section>
        )}

        {/* 2. IN SIMPLE WORDS (Indigo Tint per WEB-5) */}
        {result.summary && result.summary.length > 0 && (
          <section className="bg-[#ECEBFA] border border-[#D8D4EF] rounded-[22px] p-5 flex flex-col gap-3 shadow-sm animate-card-in stagger-2">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#5B52D6] text-white flex items-center justify-center shrink-0">
                <SparklesIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-[#1E1838]">
                {t.summaryTitle || 'In simple words'}
              </h2>
            </div>

            <div className="flex flex-col gap-2">
              {result.summary.map((line, i) => (
                <p key={i} className="text-base text-[#1E1838] leading-relaxed">
                  {line}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* 3. WATCH OUT (Left accent bar with light amber tint per WEB-5) */}
        {result.warnings && result.warnings.length > 0 && (
          <section className="bg-[#FFF4DE] border-l-4 border-[#C2410C] rounded-r-[22px] rounded-l-md p-5 flex flex-col gap-3 shadow-sm animate-card-in stagger-3">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#C2410C]/20 text-[#C2410C] flex items-center justify-center shrink-0">
                <AlertTriangleIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-[#5A3500]">
                {t.riskTitle || 'Watch out'}
              </h2>
            </div>

            <div className="flex flex-col divide-y divide-[#F4DDB0]/60">
              {result.warnings.map((warn, i) => {
                const isQuoteOpen = !!openWarningQuotes[i]
                return (
                  <div key={i} className="py-2.5 first:pt-1 last:pb-1 flex flex-col gap-1.5">
                    <p className="text-base font-medium text-[#5A3500] leading-relaxed">
                      {warn.text}
                    </p>

                    {warn.quote && (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleWarningQuote(i)}
                          className="btn-press inline-flex items-center gap-1 text-[11px] font-semibold text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md"
                        >
                          <EyeIcon className="w-3 h-3" />
                          {t.checkAgainstOriginal || 'Check original'}
                        </button>
                      </div>
                    )}

                    {isQuoteOpen && warn.quote && (
                      <div className="mt-1.5 p-2 bg-white/80 rounded-xl text-xs text-[#5A3500]">
                        <span className="font-semibold">Page {warn.page}:</span> “{warn.quote}”
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </section>
        )}

        {/* 4. KEY FACTS (First 5 + Show all disclosure per WEB-5) */}
        {result.facts && result.facts.length > 0 && (
          <section className="bg-white border border-[#E6E6E1] rounded-[22px] p-5 flex flex-col gap-3 shadow-sm animate-card-in stagger-4">
            <div className="flex items-center gap-2.5">
              <div className="w-7 h-7 rounded-lg bg-[#F0F0EB] text-[#15171A] flex items-center justify-center shrink-0">
                <SparklesIcon className="w-4 h-4" />
              </div>
              <h2 className="text-sm font-bold text-[#15171A]">
                {t.factsTitle || 'Key facts'}
              </h2>
            </div>

            <div className="flex flex-col divide-y divide-[#F0F0EB]">
              {factsToDisplay.map((fact, i) => {
                const isQuoteOpen = !!openFactQuotes[i]

                return (
                  <div key={i} className="py-2.5 first:pt-1 last:pb-1 flex flex-col gap-1.5">
                    <div className="flex items-start gap-2.5">
                      <div className="w-6 h-6 rounded-md bg-[#FBF7EF] border border-[#F1EBDD] text-[#9A6700] flex items-center justify-center shrink-0 mt-0.5">
                        <span className="text-[11px] font-mono font-bold">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-base text-[#15171A] leading-relaxed">
                          {fact.text}
                        </p>
                        {fact.quote && (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => toggleFactQuote(i)}
                              className="btn-press inline-flex items-center gap-1 text-[11px] font-semibold text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md"
                            >
                              <EyeIcon className="w-3 h-3" />
                              {t.checkAgainstOriginal || 'Check original'}
                            </button>
                          </div>
                        )}
                        {isQuoteOpen && fact.quote && (
                          <div className="mt-1.5 p-2 bg-[#FBF7EF] rounded-xl text-xs text-[#15171A]">
                            <span className="font-semibold text-[#5E636B]">
                              Page {fact.page}:
                            </span>{' '}
                            “{fact.quote}”
                          </div>
                        )}
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>

            {/* Show all / Show less toggle */}
            {result.facts.length > 5 && (
              <div className="pt-1 text-center border-t border-[#F0F0EB]">
                <button
                  type="button"
                  onClick={() => setShowAllFacts(!showAllFacts)}
                  className="btn-press text-xs font-bold text-[#5B52D6] hover:underline py-1"
                >
                  {showAllFacts
                    ? t.showLess || 'Show less'
                    : (t.showAll || 'Show all ({count})').replace(
                        '{count}',
                        String(result.facts.length)
                      )}
                </button>
              </div>
            )}
          </section>
        )}

        {/* Disclaimer Note */}
        <p className="text-xs text-[#5E636B] leading-relaxed text-center px-4 pt-1">
          {t.disclaimer ||
            'Sarvam explains your document. It does not replace your doctor, insurer or government office.'}
        </p>
        <FeedbackBlock result={result} lang={contentLang} files={files} />
      </div>

      {/* Frosted Bottom Action Bar (WEB-5) */}
      <div className="fixed bottom-0 inset-x-0 z-40 bg-white/90 backdrop-blur-md border-t border-[#E6E6E1] py-3 px-4 shadow-lg flex items-center justify-center">
        <div className="w-full max-w-[430px] flex items-center gap-3">
          {/* Listen Button (Primary Filled Indigo) */}
          <button
            type="button"
            onClick={() => setIsListenOpen(true)}
            className="btn-press flex-1 h-12 bg-[#1E1838] text-white rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#2F2656] shadow-md transition-colors"
          >
            <PlayIcon className="w-4 h-4 ml-0.5" />
            <span>{t.listenBtnLabel || 'Listen'}</span>
          </button>

          {/* Ask Button (Outlined) */}
          <button
            type="button"
            onClick={() => setIsAskOpen(true)}
            className="btn-press flex-1 h-12 bg-white border-2 border-[#1E1838] text-[#1E1838] rounded-full font-bold text-sm flex items-center justify-center gap-2 hover:bg-[#F0F0EB] transition-colors"
          >
            <MessageSquareIcon className="w-4 h-4" />
            <span>{t.askBtnLabel || 'Ask'}</span>
          </button>

          {/* Share Button (Icon button) */}
          <button
            type="button"
            onClick={() => setIsShareOpen(true)}
            aria-label={t.share || 'Share'}
            className="btn-press w-12 h-12 bg-white border border-[#E6E6E1] rounded-full text-[#15171A] flex items-center justify-center hover:bg-[#F0F0EB] transition-colors shrink-0"
          >
            <ShareIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Listen Sheet (WEB-9) */}
      <ListenSheet
        isOpen={isListenOpen}
        onClose={() => setIsListenOpen(false)}
        result={result}
        lang={contentLang}
        t={t}
      />

      {/* Ask Sheet (WEB-12) */}
      <AskSheet
        isOpen={isAskOpen}
        onClose={() => setIsAskOpen(false)}
        result={result}
        files={files}
        lang={contentLang}
        t={t}
        onSpeakAnswer={(_text) => {
          setIsAskOpen(false)
          setIsListenOpen(true)
        }}
      />

      {/* Share Sheet (WEB-4 Sheet) */}
      <Sheet
        isOpen={isShareOpen}
        onClose={() => setIsShareOpen(false)}
        title={t.shareTitle || 'Share or save'}
        maxHeight="max-h-[90vh]"
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex items-center justify-between pb-1">
            <h2 className="text-base font-bold text-[#15171A]">
              {t.shareTitle || 'Share or save'}
            </h2>
            <button
              type="button"
              onClick={() => setIsShareOpen(false)}
              className="p-1.5 text-[#5E636B] hover:text-[#15171A] rounded-full"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Hide personal details toggle */}
          <label className="flex items-center justify-between p-3.5 bg-[#FBF7EF] border border-[#F1EBDD] rounded-2xl cursor-pointer">
            <div className="flex flex-col">
              <span className="text-xs font-bold text-[#15171A]">
                {t.hidePersonalDetails || 'Hide personal details'}
              </span>
              <span className="text-[11px] text-[#5E636B]">
                {hidePersonal
                  ? 'Names, numbers and IDs redacted'
                  : 'Showing full details'}
              </span>
            </div>
            <input
              type="checkbox"
              checked={hidePersonal}
              onChange={(e) => setHidePersonal(e.target.checked)}
              className="w-5 h-5 rounded text-[#5B52D6] focus:ring-0"
            />
          </label>

          {/* Live Preview */}
          <div className="flex flex-col gap-1">
            <span className="text-[11px] font-bold uppercase text-[#5E636B]">
              {t.sharePreview || 'Preview of shared text'}
            </span>
            <pre className="max-h-36 overflow-y-auto p-3 bg-neutral-50 border border-[#E6E6E1] rounded-xl text-xs font-mono leading-relaxed text-[#15171A] whitespace-pre-wrap select-all">
              {sharedText}
            </pre>
          </div>

          {/* Share Action Buttons */}
          <div className="flex flex-col gap-2 pt-1">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => shareToWhatsApp(sharedText)}
                className="btn-press h-11 rounded-xl bg-[#25D366] text-white font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#20ba5a]"
              >
                {t.shareViaWhatsApp || 'WhatsApp'}
              </button>
              <button
                type="button"
                onClick={() => shareToEmail(result.title, sharedText)}
                className="btn-press h-11 rounded-xl border border-[#E6E6E1] bg-white text-[#15171A] font-bold text-xs flex items-center justify-center gap-2 hover:bg-[#F0F0EB]"
              >
                {t.shareViaEmail || 'Email'}
              </button>
            </div>

            <button
              type="button"
              onClick={handleCopyShared}
              className={`btn-press w-full h-11 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-colors ${
                copySuccess
                  ? 'bg-[#146B4E] text-white'
                  : 'bg-white border border-[#E6E6E1] text-[#15171A] hover:bg-[#F0F0EB]'
              }`}
            >
              <CopyIcon className="w-4 h-4" />
              <span>{copySuccess ? t.copied || 'Copied!' : t.copyText || 'Copy text'}</span>
            </button>
          </div>
        </div>
      </Sheet>
    </div>
  )
}
