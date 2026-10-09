import { useState, useRef, useEffect } from 'react'
import {
  SUPPORTED_LANGS,
  getDictionary,
  getStoredLanguage,
  setStoredLanguage,
  getLocalFallbackError,
} from './i18n'
import type {
  AppScreen,
  ExplainResponse,
  StagedFile,
  AppErrorInfo,
  RecentResult,
  MultiReportCard,
} from './types'
import {
  shrinkImage,
  isHeicFile,
  processPhotosSequentially,
} from './utils/image'
import { explainDocument, translateDocument, ExplainApiError } from './api'
import {
  getRecentResults,
  saveRecentResult,
  deleteRecentResult,
  clearAllRecentResults,
  isSaveRecentEnabled,
  setSaveRecentEnabled as setDbSaveRecentEnabled,
  saveRecentTranslation,
} from './utils/db'
import ReadingScreen from './components/ReadingScreen'
import ResultScreen from './components/ResultScreen'
import TrayScreen from './components/TrayScreen'
import A11ySheet, { applyA11ySettings, getStoredA11ySettings } from './components/A11ySheet'
import PasswordSheet from './components/PasswordSheet'
import {
  CalendarIcon,
  AlertTriangleIcon,
  ChevronRightIcon,
} from './components/icons'

interface DeleteConfirmState {
  type: 'single' | 'all'
  id?: string
  title?: string
}

interface PasswordState {
  isOpen: boolean
  fileName?: string
  errorMsg?: string | null
  pendingFiles?: File[]
}

export default function App() {
  // Shared language state persisted in localStorage sarvam.lang (defaults to 'auto' for new users per WEB-3)
  const [selectedLang, setSelectedLang] = useState<string>(getStoredLanguage)
  const [screen, setScreen] = useState<AppScreen>('home')
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [activeFiles, setActiveFiles] = useState<File[]>([])
  const [resultData, setResultData] = useState<ExplainResponse | null>(null)
  const [multiReportsData, setMultiReportsData] = useState<MultiReportCard[] | null>(null)
  const [multiReportProgress, setMultiReportProgress] = useState<{
    ready: number
    total: number
  } | null>(null)
  const [trayErrorMessage, setTrayErrorMessage] = useState<string | null>(null)

  // Recent results state (IndexedDB, result JSON only, max 20 entries)
  const [recentResults, setRecentResults] = useState<RecentResult[]>([])
  const [saveRecentEnabled, setSaveRecentEnabled] = useState<boolean>(isSaveRecentEnabled)
  const [deleteConfirm, setDeleteConfirm] = useState<DeleteConfirmState | null>(null)

  // Error state for Reading screen
  const [currentError, setCurrentError] = useState<AppErrorInfo | null>(null)

  // Translation inline state for Result screen
  const [isTranslating, setIsTranslating] = useState<boolean>(false)
  const [translateError, setTranslateError] = useState<AppErrorInfo | null>(null)
  const [reReadInLang, setReReadInLang] = useState<string | null>(null)
  const [translateFailedLang, setTranslateFailedLang] = useState<string | null>(null)

  // Accessibility Sheet state (WEB-10)
  const [isA11yOpen, setIsA11yOpen] = useState<boolean>(false)

  // Password-protected PDF sheet state (WEB-11)
  const [passwordState, setPasswordState] = useState<PasswordState>({
    isOpen: false,
    fileName: undefined,
    errorMsg: null,
    pendingFiles: undefined,
  })

  // Online / Offline detection (WEB-14)
  const [isOnline, setIsOnline] = useState<boolean>(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  )

  // Session refs
  const activeFilesRef = useRef<File[]>([])
  const currentResultIdRef = useRef<string | null>(null)
  const originalResultRef = useRef<ExplainResponse | null>(null)
  const translationCacheRef = useRef<Map<string, ExplainResponse>>(new Map())
  const activeTranslateControllerRef = useRef<AbortController | null>(null)

  const langRowRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})
  const takePhotoInputRef = useRef<HTMLInputElement>(null)
  const chooseFileInputRef = useRef<HTMLInputElement>(null)
  const chooseFolderInputRef = useRef<HTMLInputElement>(null)

  const currentLangObj =
    SUPPORTED_LANGS.find((l) => l.id === selectedLang) || SUPPORTED_LANGS[0]
  const t = getDictionary(selectedLang === 'auto' ? 'en' : selectedLang)

  // Apply stored accessibility settings on mount (WEB-10)
  useEffect(() => {
    applyA11ySettings(getStoredA11ySettings())
  }, [])

  // Online/offline listeners (WEB-14)
  useEffect(() => {
    const handleOnline = () => setIsOnline(true)
    const handleOffline = () => setIsOnline(false)
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    return () => {
      window.removeEventListener('online', handleOnline)
      window.removeEventListener('offline', handleOffline)
    }
  }, [])

  // Dev-only fixtures loader: load with ?fixture=<name> (WEB-1)
  useEffect(() => {
    if (import.meta.env.DEV) {
      const params = new URLSearchParams(window.location.search)
      const fixtureName = params.get('fixture')
      if (fixtureName) {
        import(`./dev/fixtures/${fixtureName}.json`)
          .then((mod) => {
            const data = mod.default as ExplainResponse
            setResultData(data)
            currentResultIdRef.current = `fixture-${fixtureName}`
            originalResultRef.current = data
            setScreen('result')
          })
          .catch((err) => {
            console.warn('[DEV] Failed to load fixture:', fixtureName, err)
          })
      }
    }
  }, [])

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

  // Load recent results on initial mount
  useEffect(() => {
    loadRecents()
  }, [])

  const loadRecents = async () => {
    const items = await getRecentResults()
    setRecentResults(items)
  }

  const handleOpenRecent = (item: RecentResult) => {
    currentResultIdRef.current = item.id
    originalResultRef.current = item.result
    translationCacheRef.current.clear()

    translationCacheRef.current.set(
      `${item.id}:${item.result.language || item.lang}`,
      item.result
    )

    if (item.translations) {
      for (const [tLang, tRes] of Object.entries(item.translations)) {
        translationCacheRef.current.set(`${item.id}:${tLang}`, tRes)
      }
    }

    const dummyFiles = (item.fileNames || []).map((name) => new File([], name))
    activeFilesRef.current = dummyFiles
    setActiveFiles(dummyFiles)

    if (item.result.language) {
      setSelectedLang(item.result.language)
      setStoredLanguage(item.result.language)
    }

    setResultData(item.result)
    setMultiReportsData(item.multiReports && item.multiReports.length > 0 ? item.multiReports : null)
    setCurrentError(null)
    setTranslateError(null)
    setIsTranslating(false)
    setReReadInLang(null)
    setTranslateFailedLang(null)
    setScreen('result')
  }

  const handleDeleteRecentItem = (e: React.MouseEvent, item: RecentResult) => {
    e.stopPropagation()
    setDeleteConfirm({
      type: 'single',
      id: item.id,
      title:
        item.fileCount > 1
          ? t.reportsCount?.replace('{count}', String(item.fileCount)) || `${item.fileCount} reports`
          : item.title,
    })
  }

  const handleDeleteAllRecent = () => {
    setDeleteConfirm({ type: 'all' })
  }

  const handleConfirmDelete = async () => {
    if (!deleteConfirm) return
    if (deleteConfirm.type === 'single' && deleteConfirm.id) {
      await deleteRecentResult(deleteConfirm.id)
    } else if (deleteConfirm.type === 'all') {
      await clearAllRecentResults()
    }
    setDeleteConfirm(null)
    await loadRecents()
  }

  const handleToggleSaveRecent = (enabled: boolean) => {
    setSaveRecentEnabled(enabled)
    setDbSaveRecentEnabled(enabled)
  }

  // Core API execution function: /api/explain
  const runExplain = async (
    filesToExplain: File[],
    lang: string,
    password?: string
  ) => {
    if (!filesToExplain || filesToExplain.length === 0) return

    activeFilesRef.current = filesToExplain
    setActiveFiles(filesToExplain)
    setCurrentError(null)
    setTranslateError(null)
    setMultiReportProgress(null)
    setReReadInLang(null)
    setTranslateFailedLang(null)
    setScreen('reading')

    const isMultiPdf =
      filesToExplain.length > 1 &&
      filesToExplain.every(
        (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
      )

    if (isMultiPdf) {
      const initialCards: MultiReportCard[] = filesToExplain.map((f, idx) => ({
        id: `mrep-${Date.now()}-${idx}`,
        fileName: f.name,
        title: f.name,
        status: 'pending',
      }))
      setMultiReportsData(initialCards)
      setMultiReportProgress({ ready: 0, total: filesToExplain.length })

      let readyCount = 0
      const updatedCards = [...initialCards]

      await Promise.all(
        filesToExplain.map(async (file, idx) => {
          try {
            const res = await explainDocument([file], lang, undefined, password)
            updatedCards[idx] = {
              ...updatedCards[idx],
              title: res.title || file.name,
              date: res.report_date_iso || res.letter_date,
              evidence_summary: res.evidence_summary,
              result: res,
              status: 'ready',
            }
            readyCount++
            setMultiReportProgress({ ready: readyCount, total: filesToExplain.length })
          } catch (err: unknown) {
            let appErr: AppErrorInfo
            if (err instanceof ExplainApiError) {
              if (
                err.errorCode === 'pdf_password_required' ||
                err.errorCode === 'pdf_password_wrong'
              ) {
                setPasswordState({
                  isOpen: true,
                  fileName: file.name,
                  errorMsg: err.errorCode === 'pdf_password_wrong' ? err.messageLocal : null,
                  pendingFiles: [file],
                })
              }
              appErr = {
                message: err.message,
                messageLocal: err.messageLocal,
                statusCode: err.statusCode,
                retryAfter: err.retryAfter,
              }
            } else if (err instanceof Error) {
              appErr = {
                message: err.message,
                messageLocal: getLocalFallbackError(lang, 'generic'),
                statusCode: 0,
              }
            } else {
              appErr = {
                message: 'Unknown error',
                messageLocal: getLocalFallbackError(lang, 'generic'),
                statusCode: 0,
              }
            }
            updatedCards[idx] = {
              ...updatedCards[idx],
              error: appErr,
              status: 'error',
            }
          }
        })
      )

      const firstReady = updatedCards.find((c) => c.status === 'ready')
      if (firstReady && firstReady.result) {
        setResultData(firstReady.result)
        setMultiReportsData(updatedCards)
        setScreen('result')

        if (isSaveRecentEnabled()) {
          const fileCount = filesToExplain.length
          const displayTitle =
            t.reportsCount?.replace('{count}', String(fileCount)) || `${fileCount} reports`

          await saveRecentResult({
            title: displayTitle,
            fileCount,
            fileNames: filesToExplain.map((f) => f.name),
            lang,
            result: firstReady.result,
            multiReports: updatedCards,
          })
          await loadRecents()
        }
      } else {
        const firstErr = updatedCards.find((c) => c.error)?.error
        setCurrentError(
          firstErr || {
            message: 'Failed to read reports',
            messageLocal: getLocalFallbackError(lang, 'generic'),
            statusCode: 0,
          }
        )
      }
      return
    }

    // Single document pipeline
    setMultiReportsData(null)
    try {
      const result = await explainDocument(filesToExplain, lang, undefined, password)

      // Handle Auto language (WEB-3)
      if (lang === 'auto' && result.language) {
        const isSupported = SUPPORTED_LANGS.some((l) => l.id === result.language && !l.disabled)
        if (isSupported) {
          setSelectedLang(result.language)
          setStoredLanguage(result.language)
        }
      }

      const resultId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      currentResultIdRef.current = resultId
      originalResultRef.current = result
      translationCacheRef.current.clear()
      translationCacheRef.current.set(`${resultId}:${result.language || lang}`, result)

      setResultData(result)
      setPasswordState({ isOpen: false, fileName: undefined, errorMsg: null, pendingFiles: undefined })
      setScreen('result')

      if (isSaveRecentEnabled()) {
        const fileCount = filesToExplain.length
        const displayTitle =
          fileCount > 1
            ? t.reportsCount?.replace('{count}', String(fileCount)) || `${fileCount} reports`
            : result.title || filesToExplain[0]?.name || 'Document'

        await saveRecentResult({
          title: displayTitle,
          fileCount,
          fileNames: filesToExplain.map((f) => f.name),
          lang: result.language || lang,
          result,
        })
        await loadRecents()
      }
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      if (err instanceof ExplainApiError) {
        if (
          err.errorCode === 'pdf_password_required' ||
          err.errorCode === 'pdf_password_wrong'
        ) {
          setPasswordState({
            isOpen: true,
            fileName: filesToExplain[0]?.name,
            errorMsg: err.errorCode === 'pdf_password_wrong' ? err.messageLocal : null,
            pendingFiles: filesToExplain,
          })
          return
        }
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

  // Handle Unlock from PasswordSheet (WEB-11)
  const handleUnlockPassword = (pw: string) => {
    if (passwordState.pendingFiles && passwordState.pendingFiles.length > 0) {
      runExplain(passwordState.pendingFiles, selectedLang, pw)
    }
  }

  const handleCancelPassword = () => {
    setPasswordState({ isOpen: false, fileName: undefined, errorMsg: null, pendingFiles: undefined })
    if (screen === 'reading') {
      setScreen('home')
    }
  }

  // Single report retry from multi-report card
  const handleRetrySingleReport = async (index: number) => {
    if (!multiReportsData || !activeFilesRef.current[index]) return
    const file = activeFilesRef.current[index]

    try {
      const res = await explainDocument([file], selectedLang)
      setMultiReportsData((prev) => {
        if (!prev) return null
        const next = [...prev]
        next[index] = {
          ...next[index],
          title: res.title || file.name,
          date: res.report_date_iso || res.letter_date,
          evidence_summary: res.evidence_summary,
          result: res,
          status: 'ready',
          error: undefined,
        }
        return next
      })
    } catch (err: unknown) {
      console.warn('Single report retry error:', err)
    }
  }

  const handleTakePhotoClick = () => {
    takePhotoInputRef.current?.click()
  }

  const handleChooseFileClick = () => {
    chooseFileInputRef.current?.click()
  }

  const handleChooseFolderClick = () => {
    chooseFolderInputRef.current?.click()
  }

  const handleTakePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''

    if (isHeicFile(file)) {
      setTrayErrorMessage(t.heicError || 'Please use JPG or PNG')
      return
    }

    const staged: StagedFile = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type || 'image/jpeg',
      previewUrl: URL.createObjectURL(file),
    }

    setStagedFiles([staged])
    setTrayErrorMessage(null)
    setScreen('tray')
  }

  const handleChooseFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const incoming = Array.from(fileList)
    e.target.value = ''

    const hasHeic = incoming.some(isHeicFile)
    if (hasHeic) {
      setTrayErrorMessage(t.heicError || 'Please use JPG or PNG')
      return
    }

    const newStaged: StagedFile[] = incoming.map((f, i) => ({
      id: `file-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      name: f.name,
      size: f.size,
      type: f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))

    setStagedFiles((prev) => [...prev, ...newStaged])
    setTrayErrorMessage(null)
    setScreen('tray')
  }

  const handleChooseFolderChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const fileList = e.target.files
    if (!fileList || fileList.length === 0) return
    const incoming = Array.from(fileList)
    e.target.value = ''

    const valid = incoming.filter(
      (f) =>
        f.name.toLowerCase().endsWith('.pdf') ||
        f.name.toLowerCase().endsWith('.jpg') ||
        f.name.toLowerCase().endsWith('.jpeg') ||
        f.name.toLowerCase().endsWith('.png')
    )

    if (valid.length === 0) return

    const newStaged: StagedFile[] = valid.map((f, i) => ({
      id: `folder-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      name: f.name,
      size: f.size,
      type: f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))

    setStagedFiles((prev) => [...prev, ...newStaged])
    setTrayErrorMessage(null)
    setScreen('tray')
  }

  const handleTrayExplain = async () => {
    if (stagedFiles.length === 0) return
    setTrayErrorMessage(null)

    const isAllPhotos = stagedFiles.every((s) => !s.name.toLowerCase().endsWith('.pdf'))
    if (isAllPhotos) {
      try {
        const rawFiles = stagedFiles.map((s) => s.file)
        const processed = await processPhotosSequentially(rawFiles)
        setScreen('reading')
        await runExplain(processed, selectedLang)
      } catch (err: unknown) {
        console.warn('Photo processing error:', err)
      }
    } else {
      const rawFiles = stagedFiles.map((s) => s.file)
      setScreen('reading')
      await runExplain(rawFiles, selectedLang)
    }
  }

  const handleTrayRemove = (id: string) => {
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

  // Handle "Try a sample" items (WEB-14)
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

  // Handle changing language while on Result screen: honest failure flow (WEB-2)
  const handleChangeResultLang = async (newLang: string) => {
    if (newLang === selectedLang && resultData?.language === newLang) return

    setSelectedLang(newLang)
    setStoredLanguage(newLang)

    const resultId = currentResultIdRef.current
    const originalResult = originalResultRef.current || resultData

    if (!resultId || !originalResult) {
      if (activeFilesRef.current.length > 0) {
        runExplain(activeFilesRef.current, newLang)
      }
      return
    }

    const cacheKey = `${resultId}:${newLang}`
    const cached = translationCacheRef.current.get(cacheKey)
    if (cached) {
      setResultData(cached)
      setTranslateError(null)
      setIsTranslating(false)
      setReReadInLang(null)
      setTranslateFailedLang(null)
      console.log('telemetry: translate_cache_hit', { status: 200 })
      return
    }

    if (activeTranslateControllerRef.current) {
      activeTranslateControllerRef.current.abort()
    }
    const controller = new AbortController()
    activeTranslateControllerRef.current = controller

    setIsTranslating(true)
    setTranslateError(null)
    setReReadInLang(null)
    setTranslateFailedLang(null)

    // Try 1: /api/translate
    try {
      const translated = await translateDocument(originalResult, newLang, controller.signal)
      if (controller.signal.aborted) return

      translationCacheRef.current.set(cacheKey, translated)
      setResultData(translated)
      setIsTranslating(false)
      console.log('telemetry: translate_ok', { status: 200 })

      if (currentResultIdRef.current) {
        await saveRecentTranslation(currentResultIdRef.current, newLang, translated)
        await loadRecents()
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return

      // Try 2: Auto-retry translate once
      try {
        const retried = await translateDocument(originalResult, newLang, controller.signal)
        if (controller.signal.aborted) return

        translationCacheRef.current.set(cacheKey, retried)
        setResultData(retried)
        setIsTranslating(false)
        console.log('telemetry: translate_retry_ok', { status: 200 })

        if (currentResultIdRef.current) {
          await saveRecentTranslation(currentResultIdRef.current, newLang, retried)
          await loadRecents()
        }
      } catch (retryErr: unknown) {
        if (controller.signal.aborted) return

        // Try 3: Fall back to /api/explain in that language
        if (activeFilesRef.current.length > 0) {
          try {
            const fallbackResult = await explainDocument(
              activeFilesRef.current,
              newLang,
              controller.signal
            )
            if (controller.signal.aborted) return

            translationCacheRef.current.set(cacheKey, fallbackResult)
            setResultData(fallbackResult)
            setReReadInLang(newLang)
            setIsTranslating(false)
            console.log('telemetry: explain_fallback', { status: 200 })

            if (currentResultIdRef.current) {
              await saveRecentTranslation(currentResultIdRef.current, newLang, fallbackResult)
              await loadRecents()
            }
            return
          } catch (fallbackErr: unknown) {
            if (controller.signal.aborted) return
          }
        }

        // Try 4: Everything failed: show banner, keep showing English
        setIsTranslating(false)
        setTranslateFailedLang(newLang)
        const statusCode = (retryErr as any)?.statusCode || 500
        console.log('telemetry: failed', { status: statusCode })
      }
    }
  }

  const handleGoHome = () => {
    if (activeTranslateControllerRef.current) {
      activeTranslateControllerRef.current.abort()
    }
    stagedFiles.forEach((f) => {
      if (f.previewUrl) URL.revokeObjectURL(f.previewUrl)
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
    setReReadInLang(null)
    setTranslateFailedLang(null)
    setScreen('home')
  }

  const handleMoveUp = (index: number) => {
    if (index <= 0) return
    setStagedFiles((prev) => {
      const next = [...prev]
      const temp = next[index - 1]
      next[index - 1] = next[index]
      next[index] = temp
      return next
    })
  }

  const handleMoveDown = (index: number) => {
    setStagedFiles((prev) => {
      if (index >= prev.length - 1) return prev
      const next = [...prev]
      const temp = next[index + 1]
      next[index + 1] = next[index]
      next[index] = temp
      return next
    })
  }

  const handleAddPhotoDirect = (file: File) => {
    const staged: StagedFile = {
      id: `photo-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      file,
      name: file.name,
      size: file.size,
      type: file.type || 'image/jpeg',
      previewUrl: URL.createObjectURL(file),
    }
    setStagedFiles((prev) => [...prev, staged])
  }

  const handleAddFilesDirect = (newFiles: File[]) => {
    const newStaged: StagedFile[] = newFiles.map((f, i) => ({
      id: `file-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
      file: f,
      name: f.name,
      size: f.size,
      type: f.type || (f.name.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'),
      previewUrl: f.type.startsWith('image/') ? URL.createObjectURL(f) : undefined,
    }))
    setStagedFiles((prev) => [...prev, ...newStaged])
  }

  // Soonest upcoming action across saved results (WEB-15)
  const nextUpAction = (() => {
    const allActions: { text: string; date: string; formattedDate: string; recentItem: RecentResult }[] = []
    const today = new Date().toISOString().slice(0, 10)

    for (const item of recentResults) {
      if (item.result?.actions) {
        for (const act of item.result.actions) {
          if (act.due_date && act.due_date >= today && act.date_status !== 'passed') {
            let formattedDate = act.due_date
            try {
              formattedDate = new Intl.DateTimeFormat(
                selectedLang === 'auto' ? 'en' : selectedLang,
                { day: 'numeric', month: 'short' }
              ).format(new Date(act.due_date))
            } catch {}

            allActions.push({
              text: act.text,
              date: act.due_date,
              formattedDate,
              recentItem: item,
            })
          }
        }
      }
    }

    if (allActions.length === 0) return null
    allActions.sort((a, b) => a.date.localeCompare(b.date))
    return allActions[0]
  })()

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
      <input
        ref={chooseFolderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '' } as any)}
        onChange={handleChooseFolderChange}
        className="hidden"
      />

      {/* Main Container */}
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
                onClick={() => setIsA11yOpen(true)}
                aria-label={t.makeEasierToRead || 'Make it easier to read'}
                className="btn-press w-12 h-12 rounded-full border border-line bg-surface text-ink flex items-center justify-center hover:bg-soft transition-colors shadow-xs"
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

            {/* Offline Notice (WEB-14) */}
            {!isOnline && (
              <div className="bg-[#FFF4DE] border border-[#F4DDB0] text-[#5A3500] px-3.5 py-2.5 rounded-2xl text-xs flex items-center gap-2 animate-card-in">
                <AlertTriangleIcon className="w-4 h-4 text-[#C2410C] shrink-0" />
                <span>
                  {t.offlineNotice ||
                    "You're offline: saved results still open, scanning needs internet"}
                </span>
              </div>
            )}

            {/* Next up strip (WEB-15) */}
            {nextUpAction && (
              <div
                onClick={() => handleOpenRecent(nextUpAction.recentItem)}
                className="btn-press bg-[#ECEBFA] border border-[#D8D4EF] rounded-2xl p-3.5 flex items-center justify-between cursor-pointer shadow-xs animate-card-in"
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <div className="w-8 h-8 rounded-xl bg-[#5B52D6] text-white flex items-center justify-center shrink-0">
                    <CalendarIcon className="w-4 h-4" />
                  </div>
                  <div className="min-w-0">
                    <span className="text-[11px] font-bold uppercase tracking-wider text-[#5B52D6]">
                      {t.nextUp || 'Next up'} · {nextUpAction.formattedDate}
                    </span>
                    <p className="text-xs font-semibold text-[#1E1838] line-clamp-1 truncate">
                      {nextUpAction.text}
                    </p>
                  </div>
                </div>
                <ChevronRightIcon className="w-4 h-4 text-[#5B52D6] shrink-0" />
              </div>
            )}

            {/* Language Selection Row */}
            <div className="flex flex-col gap-2.5 animate-card-in-1 min-w-0">
              <div className="relative -mx-5 px-5 min-w-0">
                <div
                  ref={langRowRef}
                  className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0"
                  role="tablist"
                  aria-label="Language selection"
                >
                  {SUPPORTED_LANGS.map((lang) => {
                    const isSelected = selectedLang === lang.id
                    return (
                      <button
                        key={lang.id}
                        ref={(el) => {
                          chipRefs.current[lang.id] = el
                        }}
                        role="tab"
                        aria-selected={isSelected}
                        disabled={lang.disabled}
                        onClick={() => handleSelectLang(lang.id)}
                        className={`shrink-0 h-[44px] min-h-[44px] px-4 rounded-full text-[15px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors select-none active:scale-95 ${
                          isSelected
                            ? 'bg-ink text-surface border border-ink'
                            : 'bg-surface text-ink border border-line hover:border-muted/40'
                        } ${lang.disabled ? 'opacity-40 cursor-not-allowed' : ''}`}
                      >
                        <span>{lang.label}</span>
                        {lang.badge && (
                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                              isSelected
                                ? 'bg-white/20 text-white'
                                : 'bg-soft text-muted'
                            }`}
                          >
                            {lang.badge}
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
                    strokeWidth="1.9"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                </span>
                <span className="flex-1 min-w-0 flex flex-col gap-1">
                  <span className="text-[16px] sm:text-[17px] font-bold leading-tight">
                    {t.chooseFiles || 'Choose files'}
                  </span>
                  <span className="text-[13px] sm:text-[13.5px] leading-snug text-muted">
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

              {/* Desktop-only "Choose folder" action */}
              <button
                type="button"
                onClick={handleChooseFolderClick}
                className="hidden sm:flex w-full items-center gap-3 px-4 py-2.5 rounded-xl border border-line bg-surface text-ink text-[13.5px] font-semibold hover:bg-soft transition-colors active:scale-[0.99]"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-muted"
                >
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>{t.chooseFolder || 'Choose folder'}</span>
              </button>
            </div>

            {/* Try a sample section (WEB-14) */}
            <section
              className="flex flex-col gap-2.5 animate-card-in-3"
              aria-labelledby="sample-heading"
            >
              <div
                id="sample-heading"
                className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted"
              >
                {t.samples || 'Try a sample'}
              </div>

              <div className="bg-surface border border-line rounded-card overflow-hidden divide-y divide-line">
                {/* Sample 1: Lab report */}
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
                      {t.sampleLab || 'Lab report (PDF)'}
                    </span>
                    <span className="text-[13px] text-muted leading-tight">
                      {t.sample1Sub}
                    </span>
                  </span>
                  <ChevronRightIcon className="w-4 h-4 text-muted shrink-0" />
                </button>

                {/* Sample 2: Insurance letter */}
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
                      {t.sampleInsurance || 'Insurance letter (PDF)'}
                    </span>
                    <span className="text-[13px] text-muted leading-tight">
                      {t.sample2Sub}
                    </span>
                  </span>
                  <ChevronRightIcon className="w-4 h-4 text-muted shrink-0" />
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
                      {t.samplePension || 'Pension notice (Photo)'}
                    </span>
                    <span className="text-[13px] text-muted leading-tight">
                      {t.sample3Sub}
                    </span>
                  </span>
                  <ChevronRightIcon className="w-4 h-4 text-muted shrink-0" />
                </button>
              </div>
            </section>

            {/* Recent on this phone Section */}
            {recentResults.length > 0 && (
              <section
                className="flex flex-col gap-2.5 animate-card-in-3"
                aria-labelledby="recent-heading"
              >
                <div className="flex items-center justify-between">
                  <div
                    id="recent-heading"
                    className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted"
                  >
                    {t.recent || 'Recent on this phone'}
                  </div>
                  <button
                    type="button"
                    onClick={handleDeleteAllRecent}
                    className="text-[12px] font-semibold text-[#B42318] hover:underline"
                  >
                    {t.deleteAll || 'Delete all'}
                  </button>
                </div>

                <div className="bg-surface border border-line rounded-card overflow-hidden divide-y divide-line">
                  {recentResults.map((item) => (
                    <div
                      key={item.id}
                      onClick={() => handleOpenRecent(item)}
                      className="w-full flex items-center justify-between p-3.5 sm:p-4 text-left hover:bg-soft/40 active:bg-soft transition-colors cursor-pointer group"
                    >
                      <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                        <span className="text-[15px] font-semibold text-ink leading-snug truncate">
                          {item.title}
                        </span>
                        <span className="text-[12.5px] text-muted">
                          {new Intl.DateTimeFormat(
                            selectedLang === 'auto' ? 'en' : selectedLang,
                            { day: 'numeric', month: 'short', year: 'numeric' }
                          ).format(new Date(item.timestamp))}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={(e) => handleDeleteRecentItem(e, item)}
                          aria-label={`Delete ${item.title}`}
                          className="w-8 h-8 rounded-full text-muted hover:text-[#B42318] hover:bg-[#FDECEA] flex items-center justify-center transition-colors"
                        >
                          ✕
                        </button>
                        <ChevronRightIcon className="w-4 h-4 text-muted" />
                      </div>
                    </div>
                  ))}
                </div>

                {/* Save results setting toggle */}
                <label className="flex items-center justify-between p-3 rounded-xl bg-soft/60 cursor-pointer">
                  <span className="text-[13px] font-medium text-ink">
                    {t.saveRecentSetting || 'Save results on this phone'}
                  </span>
                  <input
                    type="checkbox"
                    checked={saveRecentEnabled}
                    onChange={(e) => handleToggleSaveRecent(e.target.checked)}
                    className="w-4 h-4 rounded text-brand focus:ring-0"
                  />
                </label>

                <p className="text-[12px] text-muted text-center leading-normal">
                  {t.recentFooter || 'Saved only on this phone. Not stored by Sarvam.'}
                </p>
              </section>
            )}

            {/* Privacy reassurance footer note */}
            <footer className="text-center text-[13px] text-muted leading-relaxed px-3 pt-2">
              {t.privacy}
            </footer>
          </>
        )}

        {/* ========================================================
            SCREEN 2: TRAY
           ======================================================== */}
        {screen === 'tray' && (
          <TrayScreen
            files={stagedFiles}
            lang={selectedLang === 'auto' ? 'en' : selectedLang}
            errorMessage={trayErrorMessage}
            onExplain={handleTrayExplain}
            onRemoveFile={handleTrayRemove}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
            onAddPhoto={handleAddPhotoDirect}
            onAddFiles={handleAddFilesDirect}
            onGoHome={handleGoHome}
          />
        )}

        {/* ========================================================
            SCREEN 3: READING
           ======================================================== */}
        {screen === 'reading' && (
          <ReadingScreen
            files={activeFiles}
            lang={selectedLang === 'auto' ? 'en' : selectedLang}
            langName={currentLangObj.name}
            error={currentError}
            multiReportProgress={multiReportProgress}
            onRetry={() => {
              if (activeFilesRef.current.length > 0) {
                runExplain(activeFilesRef.current, selectedLang)
              }
            }}
            onCancel={handleGoHome}
          />
        )}

        {/* ========================================================
            SCREEN 4: RESULT
           ======================================================== */}
        {screen === 'result' && resultData && (
          <ResultScreen
            result={resultData}
            files={activeFiles}
            lang={selectedLang}
            isTranslating={isTranslating}
            translateError={translateError}
            reReadInLang={reReadInLang}
            translateFailedLang={translateFailedLang}
            onChangeLanguage={handleChangeResultLang}
            onRetryTranslate={() => {
              if (translateFailedLang) {
                handleChangeResultLang(translateFailedLang)
              }
            }}
            onDismissTranslateError={() => {
              setTranslateError(null)
              setTranslateFailedLang(null)
            }}
            onGoHome={handleGoHome}
            onA11yClick={() => setIsA11yOpen(true)}
            multiReports={multiReportsData || undefined}
            onRetrySingleReport={handleRetrySingleReport}
          />
        )}
      </main>

      {/* Accessibility Panel Sheet (WEB-10) */}
      <A11ySheet
        isOpen={isA11yOpen}
        onClose={() => setIsA11yOpen(false)}
        t={t}
      />

      {/* Password-protected PDF Sheet (WEB-11) */}
      <PasswordSheet
        isOpen={passwordState.isOpen}
        fileName={passwordState.fileName}
        errorMsg={passwordState.errorMsg}
        onUnlock={handleUnlockPassword}
        onCancel={handleCancelPassword}
        t={t}
      />

      {/* Delete Confirmation Sheet */}
      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 backdrop-blur-[2px] p-4"
          onClick={() => setDeleteConfirm(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[400px] bg-white rounded-3xl p-6 shadow-2xl flex flex-col gap-4 animate-card-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold text-[#15171A]">
                {deleteConfirm.type === 'single'
                  ? t.deleteSingleConfirmTitle || 'Delete this report?'
                  : t.deleteAllConfirmTitle || 'Delete all recent reports?'}
              </h2>
              <p className="text-xs text-[#5E636B] mt-1 leading-relaxed">
                {deleteConfirm.type === 'single'
                  ? t.deleteSingleConfirmDesc ||
                    'This will remove the saved result from this phone.'
                  : t.deleteAllConfirmDesc ||
                    'This will remove all saved results from this phone.'}
              </p>
            </div>

            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={() => setDeleteConfirm(null)}
                className="btn-press flex-1 py-3 rounded-xl border border-[#E6E6E1] bg-white text-[#15171A] font-semibold text-xs hover:bg-[#F0F0EB] transition-colors"
              >
                {t.keep || 'Keep'}
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="btn-press flex-1 py-3 rounded-xl bg-[#B42318] text-white font-semibold text-xs hover:bg-[#911d13] transition-colors shadow-sm"
              >
                {t.delete || 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
