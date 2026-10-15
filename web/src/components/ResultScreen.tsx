import { useState, useEffect } from 'react'
import { SUPPORTED_LANGS, getDictionary, resolveLang, LANG_LABELS } from '../i18n'
import type { ExplainResponse, AppErrorInfo, MultiReportCard } from '../types'
import { formatDate, isDatePassed } from '../utils/date'
import { presentActionDate } from '../utils/actionChips.mjs'
import { formatAmountsInText } from '../utils/currency'
import {
  CalendarIcon,
  SparklesIcon,
  EyeIcon,
  CheckIcon,
  AlertTriangleIcon,
  ShareIcon,
  PlayIcon,
  MessageSquareIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CloseIcon,
  CopyIcon,
} from './icons'
import Sheet from './Sheet'
import SummaryCard from './v3/SummaryCard'
import BlockRenderer from '../documents/BlockRenderer'
import { resolveProfile } from '../documents/profiles'
import PlacesContactsCard from './PlacesContactsCard'
import DocumentPreviewModal, { type PreviewFileItem } from './DocumentPreviewModal'
import FeedbackBlock from '../features/feedback/FeedbackBlock'
import ListenSheet from './ListenSheet'
import AskSheet from './AskSheet'
import {
  generateIcs,
  downloadIcs,
  hashString,
  isIosDevice,
  canShareIcsFile,
  shareIcsFile,
  buildDatesText,
  getGoogleCalendarUrl,
  type CalendarEventInput,
} from '../utils/ics'

function alertTrigger(choice: 'day' | '1d' | '3d' | '1w'): string {
  if (choice === '1d') return '-P1D'
  if (choice === '3d') return '-P3D'
  if (choice === '1w') return '-P1W'
  return 'PT9H'
}
import { buildShare, collectBirthDateKeys, sanitizeProse, shareToWhatsApp, shareToEmail, copyToClipboard } from '../utils/share'
import { isSampleFile } from '../samples/loadSample'
import { pushBrowserHistory } from '../utils/history'
import { useOverlayRestore } from '../hooks/useOverlayRestore'
import { loadActiveSession, saveActiveSession } from '../utils/history'

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

  const contentLang = resolveLang(lang)
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
  const [isSaveImageOpen, setIsSaveImageOpen] = useState(false)
  const [snapshotMode, setSnapshotMode] = useState<'page' | 'summary'>(() => {
    try {
      return localStorage.getItem('sarvam.snapshotMode') === 'summary' ? 'summary' : 'page'
    } catch {
      return 'page'
    }
  })
  const [imageStatus, setImageStatus] = useState<string | null>(null)
  const [photosGranted, setPhotosGranted] = useState(() => {
    try {
      return localStorage.getItem('sarvam.photosAccess') === 'granted'
    } catch {
      return false
    }
  })
  const [isRemindersOpen, setIsRemindersOpen] = useState(false)
  const [pickedDates, setPickedDates] = useState<Record<number, boolean>>({})
  const [alertChoice, setAlertChoice] = useState<'day' | '1d' | '3d' | '1w'>('1d')
  const [calendarStatus, setCalendarStatus] = useState<string | null>(null)
  const [copyDatesSuccess, setCopyDatesSuccess] = useState(false)
  const [sourceViewer, setSourceViewer] = useState<{
    isOpen: boolean
    quote?: string
    page?: number
  }>({ isOpen: false })

  // Document preview state (Item 9)
  const [isPreviewOpen, setIsPreviewOpen] = useState(false)
  const [previewFiles, setPreviewFiles] = useState<PreviewFileItem[]>([])

  // 1B Overlay safeguard: close dangling overlays or restore data on returning from WhatsApp / external app
  useOverlayRestore({
    currentData: result,
    onClose: () => {
      setIsListenOpen((prev) => (prev ? false : prev))
      setIsAskOpen((prev) => (prev ? false : prev))
      setIsShareOpen((prev) => (prev ? false : prev))
      setIsSaveImageOpen((prev) => (prev ? false : prev))
      setIsRemindersOpen((prev) => (prev ? false : prev))
      setSourceViewer((prev) => (prev.isOpen ? { isOpen: false } : prev))
      setIsPreviewOpen((prev) => (prev ? false : prev))
    },
  })

  useEffect(() => {
    const overlay = loadActiveSession()?.overlay
    if (overlay === 'listen') setIsListenOpen(true)
    if (overlay === 'ask') setIsAskOpen(true)
    if (overlay === 'share') setIsShareOpen(true)
  }, [])

  useEffect(() => {
    const overlay = isListenOpen
      ? 'listen'
      : isAskOpen
        ? 'ask'
        : isShareOpen || isSaveImageOpen
          ? 'share'
          : isRemindersOpen
            ? 'reminders'
            : isPreviewOpen
              ? 'doc_preview'
              : sourceViewer.isOpen
                ? 'source'
                : null
    const saved = loadActiveSession()
    if (!saved?.result && !result) return
    saveActiveSession({
      ...(saved || {}),
      result: saved?.result || result,
      screen: 'result',
      overlay,
    })
  }, [isListenOpen, isAskOpen, isShareOpen, isSaveImageOpen, isRemindersOpen, isPreviewOpen, sourceViewer.isOpen, result])

  const hasDocumentPreview = files && files.length > 0 && files.some((f) => f.size > 0)
  const isPhoto =
    result.source_kind === 'photo' ||
    (files && files.length > 0 && files.every((f) => !f.name.toLowerCase().endsWith('.pdf') && f.type !== 'application/pdf'))

  const handleOpenPreview = () => {
    if (!hasDocumentPreview) {
      alert(t.previewNotAvailable || 'Preview not available on this device.')
      return
    }
    const validFiles = files.filter((f) => f.size > 0)
    const items: PreviewFileItem[] = validFiles.map((f) => ({
      name: f.name,
      type: f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      url: URL.createObjectURL(f),
    }))
    setPreviewFiles(items)
    openOverlay('doc_preview')
  }

  const handleClosePreview = () => {
    previewFiles.forEach((p) => URL.revokeObjectURL(p.url))
    setPreviewFiles([])
    closeOverlay('doc_preview')
  }

  const openOverlay = (
    overlayName: 'listen' | 'ask' | 'share' | 'source' | 'reminders' | 'doc_preview'
  ) => {
    pushBrowserHistory({ screen: 'result', overlay: overlayName })
    if (overlayName === 'listen') setIsListenOpen(true)
    if (overlayName === 'ask') setIsAskOpen(true)
    if (overlayName === 'share') setIsShareOpen(true)
    if (overlayName === 'reminders') setIsRemindersOpen(true)
    if (overlayName === 'doc_preview') setIsPreviewOpen(true)
  }

  const closeOverlay = (
    overlayName: 'listen' | 'ask' | 'share' | 'source' | 'reminders' | 'doc_preview'
  ) => {
    if (typeof window !== 'undefined' && window.history.state?.overlay === overlayName) {
      window.history.back()
    } else {
      if (overlayName === 'listen') setIsListenOpen(false)
      if (overlayName === 'ask') setIsAskOpen(false)
      if (overlayName === 'share') setIsShareOpen(false)
      if (overlayName === 'source') setSourceViewer({ isOpen: false })
      if (overlayName === 'reminders') setIsRemindersOpen(false)
      if (overlayName === 'doc_preview') {
        previewFiles.forEach((p) => URL.revokeObjectURL(p.url))
        setPreviewFiles([])
        setIsPreviewOpen(false)
      }
    }
  }

  // Synchronize overlay close with iOS Safari back-swipe (WEB-iOS Fix 1)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const state = event.state as { screen?: string; overlay?: string | null } | null
      const currentOverlay = state?.overlay

      if (isListenOpen && currentOverlay !== 'listen') {
        setIsListenOpen(false)
      }
      if (isAskOpen && currentOverlay !== 'ask') {
        setIsAskOpen(false)
      }
      if (isShareOpen && currentOverlay !== 'share') {
        setIsShareOpen(false)
      }
      if (isRemindersOpen && currentOverlay !== 'reminders') {
        setIsRemindersOpen(false)
      }
      if (sourceViewer.isOpen && currentOverlay !== 'source') {
        setSourceViewer({ isOpen: false })
      }
      if (isPreviewOpen && currentOverlay !== 'doc_preview') {
        previewFiles.forEach((p) => URL.revokeObjectURL(p.url))
        setPreviewFiles([])
        setIsPreviewOpen(false)
      }
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isListenOpen, isAskOpen, isShareOpen, isRemindersOpen, sourceViewer.isOpen, isPreviewOpen, previewFiles])


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
    openOverlay('source')
    setSourceViewer({ isOpen: true, quote, page })
  }

  // Actions done calculation
  const totalActions = result.actions?.length || 0
  const completedActionsCount = Object.values(doneActions).filter(Boolean).length

  // Calendar export handlers
  const handleAddActionToCalendar = (act: any, idx: number) => {
    if (isDatePassed(act.due_date) || act.date_status === 'passed') return
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
        alarmTrigger: alertTrigger(alertChoice),
      },
    ]

    const ics = generateIcs(events)
    downloadIcs(`action-${idx + 1}.ics`, ics)
  }

  const handleAddAllDates = async (onlyPicked = false) => {
    if (!result.actions) return
    const validActions = result.actions.filter(
      (a, idx) => !isDatePassed(a.due_date) && a.date_status !== 'passed' && (a.due_date || a.recurrence) && (!onlyPicked || pickedDates[idx] !== false)
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
        alarmTrigger: alertTrigger(alertChoice),
      }
    })

    const ics = generateIcs(events)
    const filename = 'all-actions.ics'

    // On iOS Safari:
    if (isIosDevice()) {
      // Step 1: Web Share with .ics file if supported
      if (canShareIcsFile()) {
        setCalendarStatus('Sharing calendar file (.ics)...')
        const outcome = await shareIcsFile(filename, ics, result.title)
        if (outcome === 'shared') {
          setCalendarStatus('Calendar file shared successfully.')
          return
        }
        // If cancelled or failed: skip step 2 and go straight to Reminders sheet
      }
      // Step 3 (iOS fallback): Reminders sheet with Google Calendar links and Copy button
      setCalendarStatus('Showing dates list. Add each to Google Calendar or copy all.')
      openOverlay('reminders')
      return
    }

    // On Desktop / non-iOS browsers:
    // Step 2: Download .ics file directly
    downloadIcs(filename, ics)
    setCalendarStatus('Calendar file downloaded (.ics).')
  }

  const handleCopyAllDatesText = async () => {
    if (!result.actions) return
    const validActions = result.actions.filter(
      (a) => !isDatePassed(a.due_date) && a.date_status !== 'passed' && (a.due_date || a.recurrence)
    )
    const todayStr = new Date().toISOString().slice(0, 10)
    const text = buildDatesText(
      validActions.map((a) => ({
        title: a.text,
        startDate: a.due_date || todayStr,
        description: a.date_status === 'calculated' ? 'Calculated date' : undefined,
      }))
    )
    const ok = await copyToClipboard(text)
    if (ok) {
      setCopyDatesSuccess(true)
      setTimeout(() => setCopyDatesSuccess(false), 2000)
    }
  }

  const shared = buildShare(result, { hidePersonal, lang: contentLang })
  const sharedText = shared.text

  const handleCopyShared = async () => {
    const ok = await copyToClipboard(sharedText)
    if (ok) {
      setCopySuccess(true)
      setTimeout(() => setCopySuccess(false), 2000)
    }
  }

  const handleSaveImage = async (allowed = photosGranted) => {
    if (!allowed) return
    const source = document.getElementById(snapshotMode === 'summary' ? 'sv-summary' : 'sv-result')
    if (!source) {
      setImageStatus(t.imageFailed || "Couldn't make the image. Try Summary only.")
      return
    }
    const width = Math.max(source.offsetWidth, 360)
    const host = document.createElement('div')
    host.style.cssText = `position:fixed;left:0;top:0;width:${width}px;background:#F4F5F2;z-index:-1;pointer-events:none`
    const node = source.cloneNode(true) as HTMLElement
    node.style.width = `${width}px`
    node.style.maxHeight = 'none'
    node.style.height = 'auto'
    node.style.overflow = 'visible'
    if (hidePersonal) {
      const terms = result.protected_terms || []
      const walker = document.createTreeWalker(node, NodeFilter.SHOW_TEXT)
      const texts: Text[] = []
      let current = walker.nextNode()
      while (current) {
        texts.push(current as Text)
        current = walker.nextNode()
      }
      const birthKeys = collectBirthDateKeys(result)
      for (const text of texts) {
        if (text.data.trim()) text.data = sanitizeProse(text.data, terms, contentLang, birthKeys)
      }
    }
    host.appendChild(node)
    document.body.appendChild(host)
    try {
      const { toPng } = await import('html-to-image')
      await document.fonts.ready
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)))
      const height = Math.max(node.scrollHeight, node.offsetHeight, 200)
      const dataUrl = await toPng(node, {
        pixelRatio: height > 8000 ? 1 : 2,
        width,
        height,
        canvasWidth: width * (height > 8000 ? 1 : 2),
        canvasHeight: height * (height > 8000 ? 1 : 2),
        backgroundColor: '#F4F5F2',
        style: { overflow: 'visible', height: `${height}px`, maxHeight: 'none' },
      })
      const blob = await (await fetch(dataUrl)).blob()
      const day = new Date().toISOString().slice(0, 10)
      const type = String(result.doc_type || 'document').replace(/[^a-z0-9]+/gi, '-')
      const name = `Sarvam-${type}-${snapshotMode}-${day}.png`
      const file = new File([blob], name, { type: 'image/png' })
      const saved = loadActiveSession()
      if (saved?.result || result) {
        saveActiveSession({ ...(saved || {}), result: saved?.result || result, screen: 'result', overlay: 'share' })
      }
      const canFileShare = typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] })
      if (canFileShare) await navigator.share({ files: [file], title: shared.title })
      else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = name
        a.target = '_blank'
        a.rel = 'noopener'
        document.body.appendChild(a)
        a.click()
        a.remove()
        window.setTimeout(() => URL.revokeObjectURL(url), 4000)
      }
      setImageStatus(t.imageSaved || 'Image saved')
    } catch (err) {
      if ((err as { name?: string })?.name === 'AbortError') return
      setImageStatus(t.imageFailed || "Couldn't make the image. Try Summary only.")
    } finally {
      host.remove()
      document.body.style.overflow = ''
    }
  }

  const factsToDisplay = showAllFacts
    ? result.facts || []
    : (result.facts || []).slice(0, 5)

  // Multi-Reports Overview Card List
  const sampleOnScreen = files.length > 0 && files.every((file) => isSampleFile(file.name))
  if (multiReports && multiReports.length > 1 && selectedReportIndex === null && !sampleOnScreen) {
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
    <div className="flex-1 flex flex-col justify-between pb-[max(7rem,calc(5rem+env(safe-area-inset-bottom)))]">
      {/* Translucent Sticky Top Bar with Backdrop Blur & Scroll Hairline (WEB-5) */}
      <div
        className={`sticky top-0 z-40 -mx-5 -mt-5 px-4 py-3 flex items-center gap-2.5 ${
          isScrolled ? 'bg-[#F4F5F2]/90 backdrop-blur-md' : 'bg-transparent'
        }`}
      >
        <button
          type="button"
          onClick={onGoHome}
          aria-label="Back"
          className="sv-press w-12 h-12 box-border rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent text-[#1A1A1A] flex items-center justify-center shrink-0"
        >
          <ChevronRightIcon className="w-5 h-5 rotate-180" />
        </button>

        {/* Language selector dropdown */}
        <label className="flex-1 relative h-12 rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent flex items-center justify-center gap-2 px-3 text-[15px] font-semibold text-[#1A1A1A] min-w-0 cursor-pointer" style={{ background: contentLang !== 'en' ? '#E9B44C' : 'transparent' }}>
          <span className="truncate">
            {lang === 'auto'
              ? `Auto · ${LANG_LABELS[resolveLang('auto')] || 'English'}`
              : currentLangObj.label}
          </span>
          <ChevronDownIcon className="absolute right-2.5 w-4 h-4 text-[#5E636B]" />
          <select
            aria-label="Change language"
            value={lang}
            onChange={(e) => onChangeLanguage(e.target.value)}
            className="absolute inset-0 opacity-0 w-full h-full cursor-pointer"
          >
            {SUPPORTED_LANGS.map((l) => (
              <option key={l.id} value={l.id} disabled={l.disabled}>
                {l.id === 'auto'
                  ? `Auto · ${LANG_LABELS[resolveLang('auto')] || 'English'}`
                  : l.label}{' '}
                {l.badge ? `(${l.badge})` : ''}
              </option>
            ))}
          </select>
        </label>

        {/* Accessibility Button (WEB-10) */}
        <button
          type="button"
          onClick={onA11yClick}
          aria-label={t.makeEasierToRead || 'Make it easier to read'}
          className="sv-press w-12 h-12 box-border rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent text-[#1A1A1A] flex items-center justify-center shrink-0"
        >
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M4 9h16" /><path d="M4 15h10" /></svg>
        </button>
      </div>

      <div id="sv-result" className="flex flex-col gap-5 pt-3 w-full">
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

        {result.document_language && result.document_language.split('-')[0] !== contentLang && (
          <div className="text-xs text-[#5E636B] bg-[#F0F0EB] px-3 py-1.5 rounded-xl w-fit">
            {(t.docInLanguage || 'Document is in {lang}').replace(
              '{lang}',
              ({
                ta: 'தமிழ்',
                hi: 'हिंदी',
                te: 'తెలుగు',
                ml: 'മലയാളം',
                kn: 'ಕನ್ನಡ',
                mr: 'मराठी',
                bn: 'বাংলা',
                or: 'ଓଡ଼ିଆ',
                en: 'English',
              } as Record<string, string>)[result.document_language.split('-')[0]] || result.document_language
            )}
          </div>
        )}

        <SummaryCard
          result={result}
          t={t}
          lang={contentLang}
          hasDocumentPreview={hasDocumentPreview}
          onOpenDocumentPreview={handleOpenPreview}
          layout={resolveProfile(result).glanceLayout}
        />
        <BlockRenderer result={result} t={t} />

        {/* 1. WHAT YOU NEED TO DO */}
        {result.actions && result.actions.length > 0 && (
          <section className="sv-card-in bg-[#F4F5F2] border-[1.5px] border-[#1A1A1A] rounded-[32px] p-5 flex flex-col gap-3.5">
            {/* Header with 28px icon tile & Progress Ring (WEB-5) */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="sv-display text-[25px] text-[#1A1A1A] m-0 whitespace-nowrap">
                {t.actionsTitle || 'What you need to do'}<span className="text-[#D9603B]">.</span>
              </h2>

              <div className="text-[12px] font-bold px-2.5 py-1 rounded-xl border-[1.5px] border-[#1A1A1A]">
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
                const dateChips = presentActionDate(act, { isPhoto, t })
                const isPassed = dateChips.isPassed

                return (
                  <div key={i} className="flex flex-col gap-2 py-3 first:pt-1 last:pb-1">
                    <div className="flex items-start gap-3">
                      {/* Checkbox with Animated Tick (WEB-4, WEB-5) */}
                      <button
                        type="button"
                        onClick={() => toggleActionDone(i)}
                        className={`hit-44 w-6 h-6 rounded-lg border-2 mt-0.5 flex items-center justify-center shrink-0 transition-colors btn-press ${
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
                          {formatAmountsInText(act.text)}
                        </span>
                        {(result.parts?.length || 0) > 1 && act.part_id && result.parts?.find((part) => part.part_id === act.part_id)?.title && (
                          <span
                            className="self-start text-[11.5px] font-bold px-[9px] py-[3px] rounded-[10px] border-[1.5px] border-[#1A1A1A]"
                            style={{ background: ['#CFE5E0', '#F8D9CB', '#FBEBC4'][Math.max(0, result.parts.findIndex((part) => part.part_id === act.part_id)) % 3] }}
                          >
                            {(t.fromDocument || 'From: {name}').replace(
                              '{name}',
                              result.parts?.find((part) => part.part_id === act.part_id)?.title || ''
                            )}
                          </span>
                        )}

                        {/* Chips row */}
                        <div className="flex flex-wrap items-center gap-2 pt-0.5">
                          {act.due_date && (
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-semibold px-2 py-0.5 rounded-md ${
                                isPassed
                                  ? 'bg-[#F0F0EB] text-[#5E636B]'
                                  : 'bg-[#E8F1FB] text-[#1D5FA8]'
                              }`}
                            >
                              <CalendarIcon className="w-3.5 h-3.5" />
                              {formatDate(act.due_date, contentLang)}
                            </span>
                          )}

                          {dateChips.passedMarker && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#F0F0EB] text-[#5E636B]">
                              {dateChips.passedMarker}
                            </span>
                          )}

                          {dateChips.evidenceChip?.kind === 'calculated' && (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-md bg-[#F1ECFB] text-[#6D45C9]">
                              {dateChips.evidenceChip.text}
                            </span>
                          )}

                          {/* Add to Calendar button (.ics) (WEB-8) */}
                          {dateChips.showCalendar && (
                            <button
                              type="button"
                              onClick={() => handleAddActionToCalendar(act, i)}
                              className="hit-44 btn-press text-[11px] font-semibold text-[#5B52D6] bg-[#ECEBFA] hover:bg-[#D8D4EF] px-2 py-0.5 rounded-md flex items-center gap-1 transition-colors"
                            >
                              <CalendarIcon className="w-3 h-3" />
                              {t.addToCalendar || 'Add to calendar'}
                            </button>
                          )}

                          {/* Evidence Chip follows the API label, including after the date has passed */}
                          {dateChips.evidenceChip?.kind === 'matched' ? (
                            <button
                              type="button"
                              onClick={() => toggleActionQuote(i)}
                              className="btn-press inline-flex items-center gap-1 text-[11px] font-medium text-[#0E5B37] bg-[#E4F3EC] hover:bg-[#D4EBDD] px-2 py-0.5 rounded-md transition-colors"
                            >
                              <CheckIcon className="w-3 h-3 text-[#0E5B37]" />
                              {dateChips.evidenceChip.text}
                            </button>
                          ) : dateChips.evidenceChip?.kind === 'check_original' ? (
                            <button
                              type="button"
                              onClick={() => toggleActionQuote(i)}
                              className="btn-press inline-flex items-center gap-1 text-[11px] font-medium text-[#475A7A] bg-[#EAEFF7] hover:bg-[#DCE5F2] px-2 py-0.5 rounded-md transition-colors"
                            >
                              <EyeIcon className="w-3 h-3 text-[#475A7A]" />
                              {dateChips.evidenceChip.text}
                            </button>
                          ) : null}
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
            <div className="pt-2 flex flex-col gap-1.5 border-t border-[#F0F0EB]">
              <div className="flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => void handleAddAllDates()}
                  className="hit-44 btn-press inline-flex items-center gap-1.5 text-xs font-semibold text-[#5B52D6] hover:underline"
                >
                  <CalendarIcon className="w-4 h-4" />
                  {t.addAllDates || 'Add all dates (.ics)'}
                </button>
                <button
                  type="button"
                  onClick={() => openOverlay('reminders')}
                  className="hit-44 btn-press text-xs font-medium text-[#656077] hover:underline"
                >
                  {t.viewDatesList || 'View list'}
                </button>
              </div>
              {calendarStatus && (
                <p className="text-xs text-[#52665C] font-medium" role="status">
                  {calendarStatus}
                </p>
              )}
            </div>
          </section>
        )}

        {/* 2. IN SIMPLE WORDS (Indigo Tint per WEB-5) */}
        {result.summary && result.summary.length > 0 && (
          <section className="sv-card-in bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] rounded-[32px] p-5 flex flex-col gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[#1A1A1A] flex items-center justify-center shrink-0">
                <SparklesIcon className="w-5 h-5 text-[#E9B44C]" />
              </div>
              <h2 className="sv-display text-[28px] text-[#1A1A1A] m-0">
                {t.summaryTitle || 'In simple words'}<span className="text-[#D9603B]">.</span>
              </h2>
            </div>

            <div className="flex flex-col gap-2">
              {result.summary.map((line, i) => (
                <p key={i} className="text-base text-[#1E1838] leading-relaxed">
                  {formatAmountsInText(line)}
                </p>
              ))}
            </div>
          </section>
        )}

        {/* 3. WATCH OUT (Left accent bar with light amber tint per WEB-5) */}
        {result.warnings && result.warnings.length > 0 && (
          <section className="sv-card-in bg-[#D9603B] border-[1.5px] border-[#1A1A1A] rounded-[32px] p-5 flex flex-col gap-3 text-[#1A1A1A]">
            <div className="flex items-start gap-3.5">
              <div className="w-10 h-10 rounded-full bg-[#1A1A1A] flex items-center justify-center shrink-0">
                <AlertTriangleIcon className="w-5 h-5 text-[#D9603B]" />
              </div>
              <h2 className="text-[16px] font-bold text-[#1A1A1A] m-0">
                {t.riskTitle || 'Watch out'}
              </h2>
            </div>

            <div className="flex flex-col divide-y divide-[#F4DDB0]/60">
              {result.warnings.map((warn, i) => {
                const isQuoteOpen = !!openWarningQuotes[i]
                return (
                  <div key={i} className="py-2.5 first:pt-1 last:pb-1 flex flex-col gap-1.5">
                    <p className="text-[15.5px] leading-[1.45] text-[#1A1A1A]">
                      {formatAmountsInText(warn.text)}
                    </p>

                    {warn.evidence === 'matched' ? (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleWarningQuote(i)}
                          className="btn-press inline-flex items-center gap-1 text-[11px] font-medium text-[#0E5B37] bg-[#E4F3EC] hover:bg-[#D4EBDD] px-2 py-0.5 rounded-md transition-colors"
                        >
                          <CheckIcon className="w-3 h-3 text-[#0E5B37]" />
                          {t.foundInDoc || 'Found in your document'}
                        </button>
                      </div>
                    ) : !isPhoto && warn.quote ? (
                      <div className="pt-0.5">
                        <button
                          type="button"
                          onClick={() => toggleWarningQuote(i)}
                          className="btn-press inline-flex items-center gap-1 text-[11px] font-semibold text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md"
                        >
                          <EyeIcon className="w-3 h-3" />
                          {t.checkAgainstOriginal || 'Check against original'}
                        </button>
                      </div>
                    ) : null}

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

        {(result.places || result.contacts) && (
          <PlacesContactsCard
            places={result.places}
            contacts={result.contacts}
            t={t}
            onCheckOriginal={handleCheckOriginal}
          />
        )}

        {/* 4. KEY FACTS (First 5 + Show all disclosure per WEB-5) */}
        {result.facts && result.facts.length > 0 && (
          <section className="sv-card-in bg-[#1A1A1A] text-[#F4F5F2] rounded-[40px] p-5 flex flex-col gap-1">
            <h2 className="sv-display text-[28px] text-[#F4F5F2] m-0 mb-2">
              {t.factsTitle || 'Key facts'}<span className="text-[#D9603B]">.</span>
            </h2>

            {isPhoto && (
              <div className="flex items-start gap-2.5 p-3 rounded-xl bg-[#F8F8F6] border border-[#E8E8E2] text-xs text-[#52525B] leading-relaxed">
                <EyeIcon className="w-4 h-4 text-[#71717A] shrink-0 mt-0.5" />
                <span>
                  {t.photoVerificationBanner ||
                    "This is a photo, so we can't check each point automatically. Compare with your original."}
                </span>
              </div>
            )}

            <div className="flex flex-col">
              {factsToDisplay.map((fact, i) => {
                const isQuoteOpen = !!openFactQuotes[i]

                return (
                  <div key={i} className="py-3 border-t border-[#383B39] flex flex-col gap-1.5">
                    <div className="flex items-start gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#D9603B] text-[#1A1A1A] flex items-center justify-center shrink-0">
                        <span className="text-[13px] font-bold">{i + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[15.5px] leading-[1.45] text-[#E4E7E3]">
                          {formatAmountsInText(fact.text)}
                        </p>
                        {fact.evidence === 'matched' ? (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => toggleFactQuote(i)}
                              className="btn-press inline-flex items-center gap-1 text-[11px] font-medium text-[#0E5B37] bg-[#E4F3EC] hover:bg-[#D4EBDD] px-2 py-0.5 rounded-md transition-colors"
                            >
                              <CheckIcon className="w-3 h-3 text-[#0E5B37]" />
                              {t.foundInDoc || 'Found in your document'}
                            </button>
                          </div>
                        ) : fact.evidence === 'calculated' ? (
                          <div className="pt-1">
                            <span className="inline-flex items-center text-[11px] font-medium text-[#6D45C9] bg-[#F1ECFB] px-2 py-0.5 rounded-md">
                              {t.calculatedChip || 'Calculated'}
                            </span>
                          </div>
                        ) : !isPhoto && fact.quote ? (
                          <div className="pt-1">
                            <button
                              type="button"
                              onClick={() => toggleFactQuote(i)}
                              className="btn-press inline-flex items-center gap-1 text-[11px] font-semibold text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md"
                            >
                              <EyeIcon className="w-3 h-3" />
                              {t.checkAgainstOriginal || 'Check against original'}
                            </button>
                          </div>
                        ) : null}
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
      <div className="fixed bottom-0 inset-x-0 z-40 bg-[#F4F5F2] border-t-[1.5px] border-[#1A1A1A] pt-3.5 px-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] flex flex-col items-center justify-center">
        <div className="w-full max-w-[430px] flex items-center gap-3">
          {/* Listen Button (Primary Filled Indigo) */}
          <button
            type="button"
            disabled={isTranslating || contentLang === 'or'}
            onClick={() => {
              if (contentLang !== 'or') openOverlay('listen')
            }}
            title={contentLang === 'or' ? (t.odiaAudioUnavailable || 'Audio playback is not available for Odia yet') : undefined}
            aria-disabled={contentLang === 'or'}
            className={`sv-press flex-[1.2] h-14 bg-[#1A1A1A] text-[#F4F5F2] border-[1.5px] border-[#1A1A1A] rounded-full font-bold text-[17px] flex items-center justify-center gap-2.5 disabled:opacity-40 disabled:cursor-not-allowed ${
              isTranslating ? 'cursor-not-allowed' : ''
            }`}
          >
            {isTranslating ? (
              <span className="sv-spin w-4 h-4 rounded-full border-2 border-white/30 border-t-white shrink-0" />
            ) : (
              <PlayIcon className="w-4 h-4 ml-0.5 shrink-0" />
            )}
            <span className="truncate">{t.listenBtnLabel || 'Listen'}</span>
          </button>

          {/* Ask Button (Outlined) */}
          <button
            type="button"
            disabled={isTranslating}
            onClick={() => openOverlay('ask')}
            className={`sv-press flex-1 h-14 bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A] rounded-full font-bold text-[17px] flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed ${
              isTranslating ? 'cursor-not-allowed' : ''
            }`}
          >
            <MessageSquareIcon className="w-4 h-4 shrink-0" />
            <span className="truncate">{t.askBtnLabel || 'Ask'}</span>
          </button>

          {/* Share Button (Icon button) */}
          <button
            type="button"
            disabled={isTranslating}
            onClick={() => openOverlay('share')}
            aria-label={t.share || 'Share'}
            className={`sv-press w-14 h-14 box-border bg-transparent border-[1.5px] border-[#1A1A1A] rounded-full text-[#1A1A1A] flex items-center justify-center shrink-0 disabled:opacity-50 disabled:cursor-not-allowed ${
              isTranslating ? 'cursor-not-allowed' : ''
            }`}
          >
            <ShareIcon className="w-5 h-5 shrink-0" />
          </button>
        </div>
        {contentLang === 'or' && (
          <p className="mt-1.5 text-[11px] font-medium text-[#71717A] text-center">
            {t.odiaAudioUnavailable || 'ଓଡ଼ିଆ ଭାଷା ପାଇଁ ଅଡିଓ ଏପର୍ଯ୍ୟନ୍ତ ଉପଲବ୍ଧ ନାହିଁ।'}
          </p>
        )}
      </div>

      {/* Listen Sheet (WEB-9) */}
      <ListenSheet
        isOpen={isListenOpen}
        onClose={() => closeOverlay('listen')}
        result={result}
        lang={contentLang}
        t={t}
      />

      {/* Ask Sheet (WEB-12) */}
      <AskSheet
        isOpen={isAskOpen}
        onClose={() => closeOverlay('ask')}
        result={result}
        files={files}
        lang={contentLang}
        t={t}
        onSpeakAnswer={(_text) => {
          closeOverlay('ask')
          openOverlay('listen')
        }}
      />

      {/* Share Sheet (WEB-4 Sheet) */}
      <Sheet
        isOpen={isShareOpen}
        onClose={() => closeOverlay('share')}
        title={t.shareTitle || 'Share or save'}
        maxHeight="max-h-[90vh]"
      >
        <div className="flex flex-col gap-4 pt-1">
          <div className="flex items-center justify-between pb-1">
            <h2 className="sv-display text-[36px] leading-none text-[#1A1A1A] m-0">
              {t.shareTitle || 'Share or save'}<span className="text-[#D9603B]">.</span>
            </h2>
            <button
              type="button"
              onClick={() => closeOverlay('share')}
              className="p-1.5 text-[#5E636B] hover:text-[#15171A] rounded-full"
            >
              <CloseIcon className="w-5 h-5" />
            </button>
          </div>

          {/* Hide personal details toggle */}
          <label className="flex items-center justify-between gap-3 p-3.5 bg-[#034F46] text-[#F4F5F2] border-[1.5px] border-[#1A1A1A] rounded-[28px] cursor-pointer">
            <span className="flex flex-col gap-0.5">
              <span className="text-[15px] font-bold">
                {t.hidePersonalDetails || 'Hide personal details'}
              </span>
              <span className="text-[13px] text-[#CFE5E0]">
                {t.hidePersonalSub || 'Names, numbers and IDs are masked'}
              </span>
            </span>
            <input
              type="checkbox"
              checked={hidePersonal}
              onChange={(e) => setHidePersonal(e.target.checked)}
              className="w-6 h-6 accent-[#E9B44C]"
            />
          </label>

          <div className="flex flex-col gap-2">
            <span className="text-[12px] font-bold tracking-[1.2px] text-[#575B58]">
              {t.whatWillBeShared || 'WHAT WILL BE SHARED'}
            </span>
            <div className="rounded-[24px] border-[1.5px] border-[#1A1A1A] p-3.5 text-[14px] leading-relaxed whitespace-pre-wrap">
              {shared.segments.map((seg, i) =>
                seg.masked ? (
                  <span key={i} className="inline-block mx-0.5 px-2 py-0.5 rounded-md border border-dashed border-[#1A1A1A] bg-[rgba(233,180,76,.22)] font-mono text-[13px]">
                    {seg.text}
                  </span>
                ) : (
                  <span key={i}>{seg.text}</span>
                )
              )}
            </div>
          </div>

          <div className="grid grid-cols-5 gap-2 pt-1">
            <button type="button" onClick={() => shareToWhatsApp(sharedText)} className="sv-press flex flex-col items-center gap-1.5">
              <span className="w-14 h-14 rounded-full bg-[#25D366] border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-white">
                <svg viewBox="0 0 24 24" width="26" height="26" aria-hidden="true">
                  <path fill="currentColor" d="M12.04 2C6.58 2 2.15 6.4 2.15 11.83c0 1.74.46 3.44 1.34 4.94L2 22l5.39-1.41a10 10 0 0 0 4.65 1.18h.01c5.46 0 9.89-4.4 9.89-9.83C21.94 6.4 17.5 2 12.04 2zm5.76 13.87c-.24.68-1.4 1.25-1.94 1.33-.5.08-1.12.11-1.81-.11-.41-.14-.95-.31-1.63-.61-2.87-1.24-4.74-4.13-4.88-4.32-.14-.19-1.15-1.53-1.15-2.92s.73-2.07 1-2.35c.24-.28.64-.41 1.02-.41.12 0 .23 0 .33.01.3.01.44.03.64.49.24.57.82 1.98.89 2.12.07.14.12.31.02.5-.09.19-.14.31-.28.48-.14.16-.29.36-.41.48-.14.14-.28.29-.12.56.16.28.71 1.17 1.52 1.89 1.05.93 1.93 1.22 2.2 1.36.28.14.44.12.6-.07.16-.19.69-.8.87-1.08.19-.28.37-.23.62-.14.26.09 1.63.77 1.91.91.28.14.46.21.53.33.07.12.07.68-.17 1.36z"/>
                </svg>
              </span>
              <span className="text-[12px] font-semibold">{t.shareViaWhatsApp || 'WhatsApp'}</span>
            </button>
            <button type="button" onClick={() => shareToEmail(shared.title, sharedText)} className="sv-press flex flex-col items-center gap-1.5">
              <span className="w-14 h-14 rounded-full bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[13px] font-bold">@</span>
              <span className="text-[12px] font-semibold">{t.shareViaEmail || 'Email'}</span>
            </button>
            <button type="button" onClick={handleCopyShared} className="sv-press flex flex-col items-center gap-1.5">
              <span className="w-14 h-14 rounded-full bg-[#D9603B] border-[1.5px] border-[#1A1A1A] flex items-center justify-center">
                <CopyIcon className="w-5 h-5 text-[#1A1A1A]" />
              </span>
              <span className="text-[12px] font-semibold">{copySuccess ? t.copied || 'Copied' : t.copyText || 'Copy text'}</span>
            </button>
            <button type="button" onClick={() => setIsSaveImageOpen(true)} className="sv-press flex flex-col items-center gap-1.5">
              <span className="w-14 h-14 rounded-full bg-[#CFE5E0] border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[13px] font-bold">IMG</span>
              <span className="text-[12px] font-semibold">{t.saveImage || 'Save image'}</span>
            </button>
            <button
              type="button"
              onClick={() => {
                if (navigator.share) void navigator.share({ title: shared.title, text: sharedText })
                else handleCopyShared()
              }}
              className="sv-press flex flex-col items-center gap-1.5"
            >
              <span className="w-14 h-14 rounded-full bg-[#1A1A1A] text-[#F4F5F2] border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[13px] font-bold">···</span>
              <span className="text-[12px] font-semibold">{t.more || 'More'}</span>
            </button>
          </div>
        </div>
      </Sheet>

      <Sheet isOpen={isSaveImageOpen} onClose={() => setIsSaveImageOpen(false)} title={t.saveImage || 'Save as image'}>
        <div className="flex flex-col gap-4 pt-1">
          <h2 className="sv-display text-[36px] leading-none m-0">
            {t.saveImage || 'Save as image'}<span className="text-[#D9603B]">.</span>
          </h2>
          <p className="m-0 text-[15.5px] leading-[1.45] text-[#3B3E3C]">
            {photosGranted
              ? (t.saveImageBody || 'The whole explanation as one tall image. Keep it in Photos, or send it to family or your doctor.')
              : (t.photosAccessBody || 'Sarvam will ask to add one image to your photo library. The image is this explanation, with its colours and layout. It stays on this phone.')}
          </p>
          <div className="grid grid-cols-2 gap-2">
            {(['page', 'summary'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                onClick={() => {
                  setSnapshotMode(mode)
                  try { localStorage.setItem('sarvam.snapshotMode', mode) } catch { /* ignore */ }
                }}
                className="h-12 rounded-full border-[1.5px] border-[#1A1A1A] text-[15px] font-bold"
                style={{ background: snapshotMode === mode ? '#E9B44C' : 'transparent' }}
              >
                {mode === 'page' ? (t.wholePage || 'Whole page') : (t.summaryOnly || 'Summary only')}
              </button>
            ))}
          </div>
          {photosGranted ? (
            <button type="button" onClick={() => void handleSaveImage()} className="sv-press h-14 rounded-full bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] text-[17px] font-bold">
              {t.saveToPhotos || 'Save to Photos'}
            </button>
          ) : (
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  try { localStorage.setItem('sarvam.photosAccess', 'granted') } catch { /* ignore */ }
                  setPhotosGranted(true)
                  void handleSaveImage(true)
                }}
                className="sv-press h-14 rounded-full bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] text-[17px] font-bold"
              >
                {t.photosAllow || 'Allow and continue'}
              </button>
              <button type="button" onClick={() => setIsSaveImageOpen(false)} className="sv-press h-12 rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent text-[16px] font-bold">
                {t.photosNotNow || 'Not now'}
              </button>
            </div>
          )}
          {imageStatus && <p className="m-0 text-[14px] font-semibold" role="status">{imageStatus}</p>}
        </div>
      </Sheet>

      {/* Source Viewer Sheet (WEB-iOS Fix 1) */}
      <Sheet
        isOpen={sourceViewer.isOpen}
        onClose={() => closeOverlay('source')}
        title={t.checkOriginal || 'Check in original document'}
        maxHeight="max-h-[85vh]"
      >
        <div className="flex flex-col gap-4 py-2">
          <div className="rounded-xl bg-[#F6F6F3] p-4 border border-[#ECECE8]">
            <p className="text-xs font-semibold text-[#656077] uppercase tracking-wider mb-2">
              Page {sourceViewer.page || 1}
            </p>
            <blockquote className="text-base text-[#15171A] leading-relaxed italic border-l-2 border-[#1E1838] pl-3 py-1">
              "{sourceViewer.quote}"
            </blockquote>
          </div>
          <p className="text-xs text-[#5E636B]">
            This excerpt was matched directly from your original document text.
          </p>
        </div>
      </Sheet>

      {/* Reminders / Visible Dates List Sheet (WEB-iOS Fix 2) */}
      <Sheet
        isOpen={isRemindersOpen}
        onClose={() => closeOverlay('reminders')}
        title={t.upcomingDates || 'Upcoming dates & reminders'}
        maxHeight="max-h-[85vh]"
      >
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h2 className="sv-display m-0 text-[32px] leading-none">
              {t.upcomingDates || 'Add to calendar'}<span className="text-[#D9603B]">.</span>
            </h2>
          </div>
          <div className="border-[1.5px] border-[#1A1A1A] rounded-[28px] px-4">
            {result.actions
              ?.map((act, idx) => ({ act, idx }))
              .filter(({ act }) => !isDatePassed(act.due_date) && act.date_status !== 'passed' && (act.due_date || act.recurrence))
              .map(({ act, idx }, i, list) => {
                const todayStr = new Date().toISOString().slice(0, 10)
                const targetDate = act.due_date || todayStr
                const when = new Date(`${targetDate}T00:00:00`)
                const month = when.toLocaleString(contentLang, { month: 'short' }).toUpperCase()
                const checked = pickedDates[idx] !== false
                return (
                  <label key={idx} className={`flex items-center gap-3 py-3 ${i < list.length - 1 ? 'border-b-[1.5px] border-[#E2E5E0]' : ''}`}>
                    <input type="checkbox" checked={checked} onChange={() => setPickedDates((prev) => ({ ...prev, [idx]: !checked }))} className="w-6 h-6 m-0 accent-[#034F46] shrink-0" />
                    <span className="w-[46px] shrink-0 box-border border-[1.5px] border-[#1A1A1A] rounded-xl overflow-hidden text-center">
                      <span className={`block border-b-[1.5px] border-[#1A1A1A] text-[10px] font-bold tracking-[1px] py-0.5 ${act.recurrence ? 'bg-[#034F46] text-[#F4F5F2]' : 'bg-[#D9603B]'}`}>{month}</span>
                      <span className="sv-display block text-[20px] leading-[1.2]">{when.getDate()}</span>
                    </span>
                    <span className="min-w-0 flex-1 flex flex-col">
                      <span className="text-[15.5px] font-semibold leading-snug">{act.text}</span>
                      <span className="text-[13px] text-[#575B58]">{act.recurrence ? (t.repeats || 'Repeats') : (t.allDay || 'All day')}</span>
                    </span>
                  </label>
                )
              })}
          </div>
          <div className="flex flex-col gap-2">
            <span className="text-[12.5px] font-bold tracking-[1.2px] text-[#575B58]">{t.alertMe || 'ALERT ME'}</span>
            <div className="grid grid-cols-2 gap-2">
              {([
                ['day', t.alertOnDay || 'On the day, 9 AM'],
                ['1d', t.alertDayBefore || '1 day before'],
                ['3d', t.alert3Days || '3 days before'],
                ['1w', t.alertWeek || '1 week before'],
              ] as const).map(([id, label]) => (
                <button key={id} type="button" aria-pressed={alertChoice === id} onClick={() => setAlertChoice(id)} className={`sv-press h-11 rounded-[22px] border-[1.5px] border-[#1A1A1A] text-[14px] ${alertChoice === id ? 'bg-[#E9B44C] font-bold' : 'bg-transparent font-semibold'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-col gap-2.5">
            <button type="button" onClick={() => void handleAddAllDates(true)} className="sv-press h-14 rounded-[28px] border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] font-bold text-[17px]">
              {(t.addNToCalendar || 'Add {n} to my calendar').replace('{n}', String(result.actions?.filter((a, idx) => !isDatePassed(a.due_date) && a.date_status !== 'passed' && (a.due_date || a.recurrence) && pickedDates[idx] !== false).length || 0))}
            </button>
            <button
              type="button"
              onClick={() => {
                const first = result.actions?.find((a, idx) => !isDatePassed(a.due_date) && a.date_status !== 'passed' && (a.due_date || a.recurrence) && pickedDates[idx] !== false)
                if (!first) return
                const todayStr = new Date().toISOString().slice(0, 10)
                window.open(getGoogleCalendarUrl(first.text, first.due_date || todayStr, first.quote), '_blank', 'noopener,noreferrer')
              }}
              className="sv-press h-[50px] rounded-[25px] border-[1.5px] border-[#1A1A1A] bg-transparent font-semibold text-[15px]"
            >
              {t.openInGoogleCalendar || 'Open in Google Calendar'}
            </button>
            <button type="button" onClick={() => void handleCopyAllDatesText()} className="text-[14px] font-semibold text-[#034F46] underline-offset-2">
              {copyDatesSuccess ? (t.copied || 'Copied') : (t.copyAllDates || 'Copy all dates')}
            </button>
          </div>
        </div>
      </Sheet>

      {/* Document Preview Modal (Item 9) */}
      <DocumentPreviewModal
        isOpen={isPreviewOpen}
        onClose={handleClosePreview}
        files={previewFiles}
        docTitle={result.title}
        t={t}
      />
    </div>
  )
}

