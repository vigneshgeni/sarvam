import { useState, useRef, useEffect } from 'react'
import {
  LANGUAGES,
  getDictionary,
  getStoredLanguage,
  setStoredLanguage,
  getLocalFallbackError,
} from './i18n'
import type { AppScreen, ExplainResponse, StagedFile, AppErrorInfo } from './types'
import { shrinkImage, shrinkFiles } from './utils/image'
import { explainDocument, translateDocument, ExplainApiError } from './api'
import ReadingScreen from './components/ReadingScreen'
import ResultScreen from './components/ResultScreen'
import TrayScreen from './components/TrayScreen'

export default function App() {
  // Shared language state persisted in localStorage sarvam.lang (first run: ta/hi from navigator or en, never default to Tamil)
  const [selectedLang, setSelectedLang] = useState<string>(getStoredLanguage)
  const [screen, setScreen] = useState<AppScreen>('home')
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [activeFiles, setActiveFiles] = useState<File[]>([])
  const [resultData, setResultData] = useState<ExplainResponse | null>(null)

  // Error state for Reading screen (never go Home silently)
  const [currentError, setCurrentError] = useState<AppErrorInfo | null>(null)

  // Translation inline state for Result screen
  const [isTranslating, setIsTranslating] = useState<boolean>(false)
  const [translateError, setTranslateError] = useState<AppErrorInfo | null>(null)

  // Session refs (files kept in memory only, never stored in localStorage/logs)
  const activeFilesRef = useRef<File[]>([])
  const currentResultIdRef = useRef<string | null>(null)
  const originalResultRef = useRef<ExplainResponse | null>(null)
  const translationCacheRef = useRef<Map<string, ExplainResponse>>(new Map())
  const activeTranslateControllerRef = useRef<AbortController | null>(null)

  const langRowRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const takePhotoInputRef = useRef<HTMLInputElement>(null)
  const chooseFileInputRef = useRef<HTMLInputElement>(null)

  const currentLangObj = LANGUAGES.find((l) => l.id === selectedLang) || LANGUAGES[0]
  const t = getDictionary(selectedLang)

  const handleSelectLang = (langId: string) => {
    setSelectedLang(langId)
    setStoredLanguage(langId)
    const chip = chipRefs.current[langId]
    if (chip) {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }

  // Scroll selected language chip into view when selection changes
  useEffect(() => {
    const chip = chipRefs.current[selectedLang]
    if (chip) {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [selectedLang])

  // Core API execution function: /api/explain
  const runExplain = async (filesToExplain: File[], lang: string) => {
    if (!filesToExplain || filesToExplain.length === 0) return

    // In-memory files only
    activeFilesRef.current = filesToExplain
    setActiveFiles(filesToExplain)
    setCurrentError(null)
    setTranslateError(null)
    setScreen('reading')

    try {
      const result = await explainDocument(filesToExplain, lang)

      // Generate session result ID for translation caching
      const resultId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      currentResultIdRef.current = resultId
      originalResultRef.current = result
      translationCacheRef.current.clear()
      translationCacheRef.current.set(`${resultId}:${result.language || lang}`, result)

      setResultData(result)
      setScreen('result')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        return
      }
      if (err instanceof ExplainApiError) {
        setCurrentError({
          message: err.message,
          messageLocal: err.messageLocal,
          statusCode: err.statusCode,
          retryAfter: err.retryAfter,
        })
      } else if (err instanceof Error) {
        setCurrentError({
          message: err.message,
          messageLocal: getLocalFallbackError(lang, 'generic'),
          statusCode: 0,
        })
      } else {
        setCurrentError({
          message: 'Unknown error',
          messageLocal: getLocalFallbackError(lang, 'generic'),
          statusCode: 0,
        })
      }
    }
  }

  // Handle "Take photo" from Home
  const handleTakePhotoClick = () => {
    takePhotoInputRef.current?.click()
  }

  const handleTakePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const rawFile = e.target.files[0]
    e.target.value = ''

    // Shrink image in browser (max 1600px long side, JPEG ~0.85)
    const shrunk = await shrinkImage(rawFile)
    const previewUrl = URL.createObjectURL(shrunk)

    const newStaged: StagedFile = {
      id: `photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      file: shrunk,
      name: `Page 1.jpg`,
      size: shrunk.size,
      type: shrunk.type,
      previewUrl,
    }

    setStagedFiles([newStaged])
    setScreen('tray')
  }

  // Handle adding subsequent photo in Tray (up to 3 pages)
  const handleAddPhotoInTray = async (file: File) => {
    if (stagedFiles.length >= 3) return

    const shrunk = await shrinkImage(file)
    const previewUrl = URL.createObjectURL(shrunk)
    const nextPageIndex = stagedFiles.length + 1

    const newStaged: StagedFile = {
      id: `photo-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      file: shrunk,
      name: `Page ${nextPageIndex}.jpg`,
      size: shrunk.size,
      type: shrunk.type,
      previewUrl,
    }

    setStagedFiles((prev) => [...prev, newStaged])
  }

  // Handle "Choose file" (PDF, JPEG, PNG)
  const handleChooseFileClick = () => {
    chooseFileInputRef.current?.click()
  }

  const handleChooseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return

    const rawFiles = Array.from(e.target.files)
    e.target.value = ''

    const hasPdf = rawFiles.some(
      (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
    )

    let finalFiles: StagedFile[] = []

    if (hasPdf) {
      // PDF mode: take 1st PDF
      const pdfFile = rawFiles.find(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      )!
      finalFiles = [
        {
          id: `pdf-${Date.now()}`,
          file: pdfFile,
          name: pdfFile.name,
          size: pdfFile.size,
          type: 'application/pdf',
        },
      ]
    } else {
      // Images mode: up to 3 images, shrunk to max 1600px JPEG ~0.85
      const imagesToProcess = rawFiles.slice(0, 3)
      const shrunkList = await shrinkFiles(imagesToProcess)

      finalFiles = shrunkList.map((f, i) => ({
        id: `img-${Date.now()}-${i}`,
        file: f,
        name: f.name || `Page ${i + 1}.jpg`,
        size: f.size,
        type: f.type,
        previewUrl: URL.createObjectURL(f),
      }))
    }

    setStagedFiles(finalFiles)
    setScreen('tray')
  }

  // Handle removing a staged file in Tray
  const handleRemoveStagedFile = (id: string) => {
    setStagedFiles((prev) => {
      const target = prev.find((item) => item.id === id)
      if (target?.previewUrl) {
        URL.revokeObjectURL(target.previewUrl)
      }
      const updated = prev.filter((item) => item.id !== id)
      if (updated.length === 0) {
        setScreen('home')
      }
      return updated
    })
  }

  // Handle "Try a sample" items
  const handleSampleClick = async (sampleFilename: string) => {
    try {
      setCurrentError(null)
      const res = await fetch(`/samples/${sampleFilename}`)
      if (!res.ok) {
        throw new Error(`Failed to load sample: ${res.statusText}`)
      }
      const blob = await res.blob()
      const mimeType = sampleFilename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
      const sampleFile = new File([blob], sampleFilename, { type: mimeType })

      let processedFile = sampleFile
      if (mimeType.startsWith('image/')) {
        processedFile = await shrinkImage(sampleFile)
      }

      await runExplain([processedFile], selectedLang)
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Failed to load sample'
      setCurrentError({
        message: msg,
        messageLocal: getLocalFallbackError(selectedLang, 'generic'),
        statusCode: 0,
      })
      setScreen('reading')
    }
  }

  // Handle changing language while on Result screen:
  // cache keyed (resultId, lang) -> POST /api/translate {result, lang} with ORIGINAL result -> on 422 or failure fall back to /api/explain with original files kept in memory only
  // Cancel in-flight requests when the user switches again. Inline loading, never a blank screen.
  const handleChangeResultLang = async (newLang: string) => {
    if (newLang === selectedLang && resultData) return

    setSelectedLang(newLang)
    setStoredLanguage(newLang)

    const resultId = currentResultIdRef.current
    const originalResult = originalResultRef.current

    if (!resultId || !originalResult) {
      if (activeFilesRef.current.length > 0) {
        runExplain(activeFilesRef.current, newLang)
      }
      return
    }

    // 1. Check cache keyed (resultId, lang)
    const cacheKey = `${resultId}:${newLang}`
    const cached = translationCacheRef.current.get(cacheKey)
    if (cached) {
      setResultData(cached)
      setTranslateError(null)
      setIsTranslating(false)
      return
    }

    // 2. Cancel previous in-flight requests when user switches again
    if (activeTranslateControllerRef.current) {
      activeTranslateControllerRef.current.abort()
    }
    const controller = new AbortController()
    activeTranslateControllerRef.current = controller

    setIsTranslating(true)
    setTranslateError(null)

    try {
      // POST /api/translate {result, lang} with ORIGINAL result as returned
      const translated = await translateDocument(originalResult, newLang, controller.signal)
      if (controller.signal.aborted) return

      translationCacheRef.current.set(cacheKey, translated)
      setResultData(translated)
      setIsTranslating(false)
    } catch (err: unknown) {
      if (controller.signal.aborted) return

      // On 422 or failure fall back to /api/explain with original files kept in memory only
      try {
        if (activeFilesRef.current.length === 0) {
          throw err
        }

        const fallbackResult = await explainDocument(
          activeFilesRef.current,
          newLang,
          controller.signal
        )
        if (controller.signal.aborted) return

        translationCacheRef.current.set(cacheKey, fallbackResult)
        setResultData(fallbackResult)
        setIsTranslating(false)
      } catch (fallbackErr: unknown) {
        if (controller.signal.aborted) return

        setIsTranslating(false)
        // Show error screen/card with message_local and Retry button (never go Home silently)
        if (fallbackErr instanceof ExplainApiError) {
          setTranslateError({
            message: fallbackErr.message,
            messageLocal: fallbackErr.messageLocal,
            statusCode: fallbackErr.statusCode,
            retryAfter: fallbackErr.retryAfter,
          })
        } else if (fallbackErr instanceof Error) {
          setTranslateError({
            message: fallbackErr.message,
            messageLocal: getLocalFallbackError(newLang, 'generic'),
            statusCode: 0,
          })
        } else {
          setTranslateError({
            message: 'Unknown error',
            messageLocal: getLocalFallbackError(newLang, 'generic'),
            statusCode: 0,
          })
        }
      }
    }
  }

  const handleGoHome = () => {
    // Cancel in-flight translate if any
    if (activeTranslateControllerRef.current) {
      activeTranslateControllerRef.current.abort()
      activeTranslateControllerRef.current = null
    }

    // Revoke any staged preview URLs
    stagedFiles.forEach((sf) => {
      if (sf.previewUrl) URL.revokeObjectURL(sf.previewUrl)
    })
    setStagedFiles([])
    setActiveFiles([])
    activeFilesRef.current = []
    currentResultIdRef.current = null
    originalResultRef.current = null
    translationCacheRef.current.clear()

    setResultData(null)
    setCurrentError(null)
    setTranslateError(null)
    setIsTranslating(false)
    setScreen('home')
  }

  const handleA11yClick = () => {
    console.log('Accessibility settings button clicked')
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex justify-center">
      {/* Hidden file inputs */}
      <input
        ref={takePhotoInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleTakePhotoChange}
        className="hidden"
      />
      <input
        ref={chooseFileInputRef}
        type="file"
        accept="application/pdf,image/jpeg,image/png"
        multiple
        onChange={handleChooseFileChange}
        className="hidden"
      />

      {/* Mobile-first frame: centered at max 430px on desktop */}
      <main className="w-full max-w-[430px] min-w-0 min-h-screen flex flex-col p-5 pb-8 gap-5 relative overflow-x-hidden">
        {/* ========================================================
            SCREEN 1: HOME
           ======================================================== */}
        {screen === 'home' && (
          <>
            {/* Header: Logo with coral dot + Accessibility button */}
            <header className="flex items-center justify-between h-12 animate-card-in">
              <div className="font-heading font-bold text-[26px] tracking-tight text-ink select-none flex items-center">
                Sarvam<span className="text-logo-dot">.</span>
              </div>
              <button
                type="button"
                onClick={handleA11yClick}
                aria-label={t.a11yTitle}
                className="w-12 h-12 rounded-full border border-line bg-surface text-ink flex items-center justify-center hover:bg-soft transition-colors active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40"
              >
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.9"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-ink"
                >
                  <circle cx="12" cy="4.5" r="1.8" />
                  <path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M9 21l3-6.5 3 6.5" />
                </svg>
              </button>
            </header>

            {/* Language Selection Row */}
            <div className="flex flex-col gap-2.5 animate-card-in-1 min-w-0">
              <div className="relative -mx-5 px-5 min-w-0">
                <div
                  ref={langRowRef}
                  className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0"
                  role="tablist"
                  aria-label="Language selection"
                >
                  {LANGUAGES.map((lang) => {
                    const isSelected = selectedLang === lang.id
                    return (
                      <button
                        key={lang.id}
                        ref={(el) => {
                          chipRefs.current[lang.id] = el
                        }}
                        role="tab"
                        aria-selected={isSelected}
                        onClick={() => handleSelectLang(lang.id)}
                        className={`shrink-0 h-[44px] min-h-[44px] px-4 rounded-full text-[15px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors select-none active:scale-95 ${
                          isSelected
                            ? 'bg-ink text-surface border border-ink'
                            : 'bg-surface text-ink border border-line hover:border-muted/40'
                        }`}
                      >
                        <span>{lang.label}</span>
                        {lang.isBeta && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-soft text-muted'
                            }`}
                          >
                            {t.betaTag || 'Beta'}
                          </span>
                        )}
                      </button>
                    )
                  })}
                  <div className="w-4 shrink-0" aria-hidden="true" />
                </div>

                {/* Right-edge soft fade */}
                <div
                  className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg to-transparent"
                  aria-hidden="true"
                />
              </div>

              {/* Beta preview note */}
              {currentLangObj.isBeta && (
                <div className="text-[13px] leading-relaxed text-muted bg-soft rounded-xl p-3 animate-card-in">
                  {t.previewNote.replace('{lang}', currentLangObj.name)}
                </div>
              )}
            </div>

            {/* Greeting Heading */}
            <h1 className="text-[28px] sm:text-[30px] font-bold font-heading text-ink leading-[1.18] tracking-[-0.015em] m-0 animate-card-in-1">
              {t.hello}
            </h1>

            {/* Action Cards: Compact Green Take Photo + Outline Choose File */}
            <div className="flex flex-col gap-2.5 animate-card-in-2">
              {/* Primary Action: "Take photo" card */}
              <button
                type="button"
                onClick={handleTakePhotoClick}
                className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-card bg-brand text-white text-left transition-transform active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand/40 min-h-[88px]"
              >
                <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-[18px] bg-white/16 flex items-center justify-center shrink-0">
                  <svg
                    width="26"
                    height="26"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#FFFFFF"
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                    <circle cx="12" cy="13" r="3.5" />
                  </svg>
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-[17px] sm:text-[18px] font-bold leading-tight">
                    {t.takePhoto}
                  </span>
                  <span className="text-[13px] sm:text-[13.5px] leading-snug text-white/80">
                    {t.takePhotoSub}
                  </span>
                </span>
                <svg
                  width="22"
                  height="22"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#FFFFFF"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>

              {/* Secondary Action: "Choose file" card */}
              <button
                type="button"
                onClick={handleChooseFileClick}
                className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-card bg-surface border border-line text-ink text-left transition-colors hover:bg-soft/50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[76px] sm:min-h-[84px]"
              >
                <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] bg-brand-soft text-brand flex items-center justify-center shrink-0">
                  <svg
                    width="22"
                    height="22"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14" />
                  </svg>
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[16px] font-bold text-ink">
                    {t.chooseFile}
                  </span>
                  <span className="text-[13px] text-muted">
                    {t.chooseFileSub}
                  </span>
                </span>
                <svg
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="shrink-0 text-muted"
                >
                  <path d="M9 6l6 6-6 6" />
                </svg>
              </button>
            </div>

            {/* Try a sample section */}
            <section
              className="flex flex-col gap-2.5 animate-card-in-3"
              aria-labelledby="sample-heading"
            >
              <div
                id="sample-heading"
                className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted"
              >
                {t.samples}
              </div>

              <div className="bg-surface border border-line rounded-card overflow-hidden divide-y divide-line">
                {/* Sample 1: Blood test report */}
                <button
                  type="button"
                  onClick={() => handleSampleClick('sample-lab-report.pdf')}
                  className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-soft/40 active:bg-soft transition-colors min-h-[68px] focus:outline-none focus:bg-soft/40"
                >
                  <span className="w-10 h-10 rounded-[12px] bg-soft flex items-center justify-center shrink-0 text-[11px] font-bold text-muted">
                    PDF
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-ink leading-snug">
                      {t.sample1Title}
                    </span>
                    <span className="text-[13px] text-muted leading-tight">
                      {t.sample1Sub}
                    </span>
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-muted"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>

                {/* Sample 2: Insurance claim letter */}
                <button
                  type="button"
                  onClick={() => handleSampleClick('sample-insurance-letter.pdf')}
                  className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-soft/40 active:bg-soft transition-colors min-h-[68px] focus:outline-none focus:bg-soft/40"
                >
                  <span className="w-10 h-10 rounded-[12px] bg-soft flex items-center justify-center shrink-0 text-[11px] font-bold text-muted">
                    PDF
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-ink leading-snug">
                      {t.sample2Title}
                    </span>
                    <span className="text-[13px] text-muted leading-tight">
                      {t.sample2Sub}
                    </span>
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-muted"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>

                {/* Sample 3: Pension notice */}
                <button
                  type="button"
                  onClick={() => handleSampleClick('sample-pension-notice.jpg')}
                  className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-soft/40 active:bg-soft transition-colors min-h-[68px] focus:outline-none focus:bg-soft/40"
                >
                  <span className="w-10 h-10 rounded-[12px] bg-soft flex items-center justify-center shrink-0 text-[11px] font-bold text-muted">
                    IMG
                  </span>
                  <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                    <span className="text-[15px] font-semibold text-ink leading-snug">
                      {t.sample3Title}
                    </span>
                    <span className="text-[13px] text-muted leading-tight">
                      {t.sample3Sub}
                    </span>
                  </span>
                  <svg
                    width="18"
                    height="18"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    className="shrink-0 text-muted"
                  >
                    <path d="M9 6l6 6-6 6" />
                  </svg>
                </button>
              </div>
            </section>

            {/* Privacy Note */}
            <footer className="flex items-center gap-2 text-[13px] text-muted pt-2 animate-card-in-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0"
              >
                <rect x="5" y="11" width="14" height="9" rx="2" />
                <path d="M8 11V8a4 4 0 0 1 8 0v3" />
              </svg>
              <span>{t.privacy}</span>
            </footer>
          </>
        )}

        {/* ========================================================
            SCREEN 2: TRAY / CAPTURE REVIEW
           ======================================================== */}
        {screen === 'tray' && (
          <TrayScreen
            files={stagedFiles}
            lang={selectedLang}
            onRemoveFile={handleRemoveStagedFile}
            onAddPhoto={handleAddPhotoInTray}
            onExplain={() =>
              runExplain(
                stagedFiles.map((s) => s.file),
                selectedLang
              )
            }
            onGoHome={handleGoHome}
          />
        )}

        {/* ========================================================
            SCREEN 3: READING (WAITING / SCANNING ANIMATION OR ERROR)
           ======================================================== */}
        {screen === 'reading' && (
          <ReadingScreen
            files={activeFiles}
            lang={selectedLang}
            langName={currentLangObj.label}
            error={currentError}
            onRetry={() => runExplain(activeFiles, selectedLang)}
            onCancel={handleGoHome}
          />
        )}

        {/* ========================================================
            SCREEN 4: RESULT SCREEN
           ======================================================== */}
        {screen === 'result' && resultData && (
          <ResultScreen
            result={resultData}
            files={activeFiles}
            lang={selectedLang}
            isTranslating={isTranslating}
            translateError={translateError}
            onChangeLanguage={handleChangeResultLang}
            onRetryTranslate={() => handleChangeResultLang(selectedLang)}
            onDismissTranslateError={() => setTranslateError(null)}
            onGoHome={handleGoHome}
            onA11yClick={handleA11yClick}
          />
        )}
      </main>
    </div>
  )
}
