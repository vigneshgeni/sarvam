import { useState, useRef, useEffect } from 'react'
import {
  SUPPORTED_LANGS,
  getDictionary,
  getStoredLanguage,
  setStoredLanguage,
  getLocalFallbackError,
  resolveLang,
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
  isHeicFile,
  processPhotosSequentially,
} from './utils/image'
import { explainDocument, translateDocument, ExplainApiError, extractDocumentText } from './api'
import {
  getRecentResults,
  saveRecentResult,
  deleteRecentResult,
  clearAllRecentResults,
  isSaveRecentEnabled,
  setSaveRecentEnabled as setDbSaveRecentEnabled,
  saveRecentTranslation,
  saveOriginalFiles,
  getOriginalFiles,
} from './utils/db'
import ReadingScreen from './components/ReadingScreen'
import ResultScreen from './components/ResultScreen'
import TrayScreen from './components/TrayScreen'
import A11ySheet, { applyA11ySettings, getStoredA11ySettings } from './components/A11ySheet'
import PasswordSheet from './components/PasswordSheet'
import HomeScreen from './components/v3/HomeScreen'
import Onboarding from './components/v3/Onboarding'
import MediaSheet, { grantMediaAccess, mediaAccessGranted } from './components/v3/MediaSheet'
import { ensureIndicFont } from './design/indicFont'
import {
  pushBrowserHistory,
  replaceBrowserHistory,
  saveActiveSession,
  loadActiveSession,
  clearActiveSession,
  seedResultHistory,
} from './utils/history'
import { useOverlayRestore } from './hooks/useOverlayRestore'
import { outputNeedsTranslation } from './utils/languageMatch'
import { forgetReadMemory, forgetReadResult, recallRead, rememberRead, sha256Files } from './utils/readCache'
import { fetchSampleResult, isSampleFile } from './samples/loadSample'
import { shouldShowOnboarding, screenAfterReturn } from './design/onboarding'

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
  const [screen, setScreen] = useState<AppScreen>(() => {
    const saved = loadActiveSession()
    if (!saved?.result) return 'home'
    return saved.screen === 'reading' ? 'reading' : 'result'
  })
  const [readingArrived, setReadingArrived] = useState(false)
  const [stagedFiles, setStagedFiles] = useState<StagedFile[]>([])
  const [activeFiles, setActiveFiles] = useState<File[]>([])
  const [resultData, setResultData] = useState<ExplainResponse | null>(() => loadActiveSession()?.result || null)
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

  const [libraryOpen, setLibraryOpen] = useState(false)
  const [showOnboarding, setShowOnboarding] = useState(() => {
    const saved = loadActiveSession()
    let seen = false
    let shared = false
    try {
      seen = sessionStorage.getItem('sarvam.onboardingSeen') === '1'
      const params = new URLSearchParams(window.location.search)
      shared = params.has('share') || params.has('result') || params.has('fixture')
    } catch {
      /* ignore */
    }
    return shouldShowOnboarding({
      seenThisSession: seen,
      hasRestoredResult: Boolean(saved?.result),
      hasOpenOverlay: Boolean(saved?.overlay || window.history.state?.overlay),
      fromSharedLink: shared,
    })
  })

  // Session refs
  const activeFilesRef = useRef<File[]>([])
  const retryActionRef = useRef<(() => void) | null>(null)
  const currentResultIdRef = useRef<string | null>(null)
  const fileHashRef = useRef<string>('')
  const originalResultRef = useRef<ExplainResponse | null>(null)
  const translationCacheRef = useRef<Map<string, ExplainResponse>>(new Map())
  const activeTranslateControllerRef = useRef<AbortController | null>(null)
  const readingAbortControllerRef = useRef<AbortController | null>(null)
  const readingTimeoutRef = useRef<number | null>(null)

  const takePhotoInputRef = useRef<HTMLInputElement>(null)
  const galleryInputRef = useRef<HTMLInputElement>(null)
  const chooseFileInputRef = useRef<HTMLInputElement>(null)
  const chooseFolderInputRef = useRef<HTMLInputElement>(null)
  const mediaIntentRef = useRef<'photo' | 'files'>('photo')
  const [mediaSheet, setMediaSheet] = useState<null | 'ask' | 'choose'>(null)

  const t = getDictionary(resolveLang(selectedLang))

  // Apply stored accessibility settings on mount (WEB-10)
  useEffect(() => {
    applyA11ySettings(getStoredA11ySettings())
  }, [])

  useEffect(() => {
    ensureIndicFont(resolveLang(selectedLang))
  }, [selectedLang])

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

  // Restore session on reload (WEB-iOS Fix 1)
  useEffect(() => {
    const saved = loadActiveSession()
    if (saved?.result) {
      setResultData(saved.result)
      originalResultRef.current = saved.originalResult || saved.result
      currentResultIdRef.current = saved.currentResultId || null
      if (saved.multiReports) setMultiReportsData(saved.multiReports)
      if (saved.lang) setSelectedLang(saved.lang)

      if (saved.currentResultId) {
        getOriginalFiles(saved.currentResultId).then((stored) => {
          if (stored && stored.length > 0) {
            const reconstructed = stored.map(
              (sf) => new File([sf.blob], sf.name, { type: sf.type })
            )
            activeFilesRef.current = reconstructed
            setActiveFiles(reconstructed)
          }
        })
      }

      setScreen('result')
      setShowOnboarding(false)
      seedResultHistory()
    } else if (!loadActiveSession()?.result) {
      replaceBrowserHistory({ screen: 'home', overlay: null })
    }
  }, [])

  useEffect(() => {
    const recover = () => {
      document.body.style.overflow = ''
      const saved = loadActiveSession()
      const next = screenAfterReturn({ screen, hasResult: Boolean(resultData) }, saved)
      if (next.restore && saved?.result) {
        setResultData(saved.result)
        originalResultRef.current = saved.originalResult || saved.result
        currentResultIdRef.current = saved.currentResultId || null
        if (saved.multiReports) setMultiReportsData(saved.multiReports)
        if (saved.lang) setSelectedLang(saved.lang)
        setScreen(next.screen)
        setShowOnboarding(false)
        return
      }
      if (next.screen !== screen) setScreen(next.screen)
    }
    const onShow = () => recover()
    const onVisible = () => {
      if (document.visibilityState === 'visible') recover()
    }
    window.addEventListener('pageshow', onShow)
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.removeEventListener('pageshow', onShow)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [screen, resultData])


  // Keep active result session updated
  useEffect(() => {
    if (screen === 'result' && resultData) {
      saveActiveSession({
        result: resultData,
        multiReports: multiReportsData,
        lang: selectedLang,
        originalResult: originalResultRef.current,
        currentResultId: currentResultIdRef.current,
        screen: 'result',
        overlay: loadActiveSession()?.overlay || null,
      })
    }
  }, [screen, resultData, multiReportsData, selectedLang])

  // 1B Overlay safeguard: close global overlays if session is missing on return from external app
  useOverlayRestore({
    currentData: resultData,
    onRestore: (saved) => {
      if (saved?.result) {
        setResultData(saved.result)
        originalResultRef.current = saved.originalResult || saved.result
        currentResultIdRef.current = saved.currentResultId || null
        if (saved.multiReports) setMultiReportsData(saved.multiReports)
        if (saved.lang) setSelectedLang(saved.lang)
        setScreen('result')
      }
    },
    onClose: () => {
      setIsA11yOpen((prev) => (prev ? false : prev))
      setPasswordState((prev) => (prev.isOpen ? { ...prev, isOpen: false } : prev))
      setDeleteConfirm((prev) => (prev ? null : prev))
    },
  })

  // Handle popstate (Back swipe or back button)
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      // If accessibility sheet is open, close it first
      if (isA11yOpen) {
        setIsA11yOpen(false)
        return
      }
      // If password sheet is open, close it
      if (passwordState.isOpen) {
        setPasswordState((prev) => ({ ...prev, isOpen: false }))
        return
      }
      // If delete confirm is open, close it
      if (deleteConfirm) {
        setDeleteConfirm(null)
        return
      }

      const state = event.state as { screen?: AppScreen; overlay?: string | null } | null
      const targetScreen = state?.screen || 'home'
      if ((targetScreen === 'result' || targetScreen === 'reading') && !resultData) {
        const saved = loadActiveSession()
        const next = screenAfterReturn({ screen: targetScreen, hasResult: false }, saved)
        if (next.restore && saved?.result) {
          setResultData(saved.result)
          setShowOnboarding(false)
        }
        setScreen(next.screen)
        return
      }
      setScreen(targetScreen)
    }

    window.addEventListener('popstate', handlePopState)
    return () => window.removeEventListener('popstate', handlePopState)
  }, [isA11yOpen, passwordState.isOpen, deleteConfirm, resultData])

  const navigateToScreen = (target: AppScreen) => {
    setScreen(target)
    pushBrowserHistory({ screen: target, overlay: null })
  }

  const handleOpenA11y = () => {
    pushBrowserHistory({ screen, overlay: 'accessibility' })
    setIsA11yOpen(true)
  }

  const handleCloseA11y = () => {
    if (typeof window !== 'undefined' && window.history.state?.overlay === 'accessibility') {
      window.history.back()
    } else {
      setIsA11yOpen(false)
    }
  }

  const handleSelectLang = (langId: string) => {
    setSelectedLang(langId)
    setStoredLanguage(langId)
  }

  // Load recent results on initial mount
  useEffect(() => {
    loadRecents()
  }, [])

  const loadRecents = async () => {
    const items = await getRecentResults()
    setRecentResults(items)
  }

  const handleOpenRecent = async (item: RecentResult) => {
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

    // Try loading stored originals for document preview
    const stored = await getOriginalFiles(item.id)
    if (stored && stored.length > 0) {
      const reconstructedFiles = stored.map(
        (sf) => new File([sf.blob], sf.name, { type: sf.type })
      )
      activeFilesRef.current = reconstructedFiles
      setActiveFiles(reconstructedFiles)
    } else {
      const dummyFiles = (item.fileNames || []).map((name) => new File([], name))
      activeFilesRef.current = dummyFiles
      setActiveFiles(dummyFiles)
    }

    if (item.result.language) {
      setSelectedLang(item.result.language)
      setStoredLanguage(item.result.language)
    }


    setShowOnboarding(false)
    setResultData(item.result)
    setMultiReportsData(item.multiReports && item.multiReports.length > 0 ? item.multiReports : null)
    setCurrentError(null)
    setTranslateError(null)
    setIsTranslating(false)
    setReReadInLang(null)
    setTranslateFailedLang(null)
    navigateToScreen('result')
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
      forgetReadResult(deleteConfirm.id)
      const active = loadActiveSession()
      if (active?.currentResultId === deleteConfirm.id) {
        clearActiveSession()
      }
    } else if (deleteConfirm.type === 'all') {
      await clearAllRecentResults()
      forgetReadMemory()
      clearActiveSession()
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

    const targetLang = resolveLang(lang)
    try {
      fileHashRef.current = await sha256Files(filesToExplain)
    } catch {
      fileHashRef.current = ''
    }
    if (fileHashRef.current && !password) {
      const cached = await recallRead(fileHashRef.current, targetLang)
      if (cached) {
        const resultId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
        currentResultIdRef.current = resultId
        originalResultRef.current = cached
        translationCacheRef.current.set(`${resultId}:${targetLang}`, cached)
        setActiveFiles(filesToExplain)
        activeFilesRef.current = filesToExplain
        setResultData(cached)
        setCurrentError(null)
        navigateToScreen('result')
        return
      }
    }

    if (readingTimeoutRef.current) {
      clearTimeout(readingTimeoutRef.current)
      readingTimeoutRef.current = null
    }
    if (readingAbortControllerRef.current) {
      readingAbortControllerRef.current.abort('cancelled')
      readingAbortControllerRef.current = null
    }

    const controller = new AbortController()
    readingAbortControllerRef.current = controller

    const hasPdf = filesToExplain.some(
      (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
    )
    // A short read stays at 90s. A PDF with many tables needs the longer server budget.
    readingTimeoutRef.current = window.setTimeout(() => {
      controller.abort('timeout')
    }, hasPdf ? 150_000 : 90_000)

    activeFilesRef.current = filesToExplain
    retryActionRef.current = () => runExplain(filesToExplain, lang, password)
    setActiveFiles(filesToExplain)
    setCurrentError(null)
    setTranslateError(null)
    setMultiReportProgress(null)
    setReReadInLang(null)
    setTranslateFailedLang(null)
    setReadingArrived(false)
    navigateToScreen('reading')

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
            const res = await explainDocument([file], targetLang, controller.signal, password)
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
                messageLocal: getLocalFallbackError(targetLang, 'generic'),
                statusCode: 0,
              }
            } else {
              appErr = {
                message: 'Unknown error',
                messageLocal: getLocalFallbackError(targetLang, 'generic'),
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
        setReadingArrived(true)
        await new Promise((resolve) => window.setTimeout(resolve, 320))
        navigateToScreen('result')

        if (isSaveRecentEnabled()) {
          const fileCount = filesToExplain.length
          const displayTitle =
            t.reportsCount?.replace('{count}', String(fileCount)) || `${fileCount} reports`
          const multiId = `mrep-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
          currentResultIdRef.current = multiId

          await saveRecentResult({
            id: multiId,
            title: displayTitle,
            fileCount,
            fileNames: filesToExplain.map((f) => f.name),
            lang: targetLang,
            result: firstReady.result,
            multiReports: updatedCards,
          })
          await saveOriginalFiles(multiId, filesToExplain)
          await loadRecents()
        }
        if (fileHashRef.current) {
          await rememberRead(fileHashRef.current, targetLang, firstReady.result, currentResultIdRef.current || undefined)
        }
        if (fileHashRef.current) {
          await rememberRead(fileHashRef.current, targetLang, firstReady.result, currentResultIdRef.current || undefined)
        }
      } else {
        const firstErr = updatedCards.find((c) => c.error)?.error
        setCurrentError(
          firstErr || {
            message: 'Failed to read reports',
            messageLocal: getLocalFallbackError(targetLang, 'generic'),
            statusCode: 0,
          }
        )
      }
      return
    }

    // Single document pipeline
    setMultiReportsData(null)
    try {
      let result = await explainDocument(filesToExplain, targetLang, controller.signal, password)
      if (outputNeedsTranslation(result, targetLang)) {
        try {
          result = await translateDocument(result, targetLang, controller.signal)
        } catch {
          /* keep the first reading if translation is busy */
        }
      }

      if (readingTimeoutRef.current) {
        clearTimeout(readingTimeoutRef.current)
        readingTimeoutRef.current = null
      }

      const resultId = `res-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
      currentResultIdRef.current = resultId
      originalResultRef.current = result
      translationCacheRef.current.clear()
      translationCacheRef.current.set(`${resultId}:${result.language || targetLang}`, result)
      if (fileHashRef.current) {
        await rememberRead(fileHashRef.current, targetLang, result, resultId)
      }

      setResultData(result)
      setPasswordState({ isOpen: false, fileName: undefined, errorMsg: null, pendingFiles: undefined })
      setReadingArrived(true)
      await new Promise((resolve) => window.setTimeout(resolve, 320))
      navigateToScreen('result')

      const fileCount = filesToExplain.length
      const displayTitle =
        fileCount > 1
          ? t.reportsCount?.replace('{count}', String(fileCount)) || `${fileCount} reports`
          : result.title || filesToExplain[0]?.name || 'Document'

      if (isSaveRecentEnabled()) {
        await saveRecentResult({
          id: resultId,
          title: displayTitle,
          fileCount,
          fileNames: filesToExplain.map((f) => f.name),
          lang: result.language || lang,
          result,
        })
        await saveOriginalFiles(resultId, filesToExplain)
        await loadRecents()
      }

      // Background extract text for image documents without blocking explanation
      if (!result.source_text && filesToExplain.length > 0) {
        extractDocumentText(filesToExplain, password).then(async (extracted) => {
          if (extracted) {
            result.source_text = extracted
            setResultData((prev) => (prev ? { ...prev, source_text: extracted } : prev))
            if (resultId) {
              await saveRecentResult({
                id: resultId,
                title: displayTitle,
                fileCount,
                fileNames: filesToExplain.map((f) => f.name),
                lang: result.language || lang,
                result,
              })
            }
          }
        }).catch(() => {})
      }
    } catch (err: unknown) {
      if (readingTimeoutRef.current) {
        clearTimeout(readingTimeoutRef.current)
        readingTimeoutRef.current = null
      }

      if (controller.signal.aborted) {
        if (controller.signal.reason === 'cancelled') {
          return
        }
        if (controller.signal.reason === 'timeout') {
          setCurrentError({
            message: 'Request timed out after 90 seconds.',
            messageLocal: getLocalFallbackError(targetLang, 'timeout'),
            statusCode: 504,
          })
          return
        }
      }

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
      navigateToScreen('home')
    }
  }

  // Single report retry from multi-report card
  const handleRetrySingleReport = async (index: number) => {
    if (!multiReportsData || !activeFilesRef.current[index]) return
    const file = activeFilesRef.current[index]

    try {
      const res = await explainDocument([file], resolveLang(selectedLang))
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
    mediaIntentRef.current = 'photo'
    setMediaSheet(mediaAccessGranted() ? 'choose' : 'ask')
  }

  const handleChooseFileClick = () => {
    mediaIntentRef.current = 'files'
    if (mediaAccessGranted()) chooseFileInputRef.current?.click()
    else setMediaSheet('ask')
  }

  const handleAllowMedia = () => {
    grantMediaAccess()
    if (mediaIntentRef.current === 'files') {
      setMediaSheet(null)
      chooseFileInputRef.current?.click()
      return
    }
    setMediaSheet('choose')
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
    navigateToScreen('tray')
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
    navigateToScreen('tray')
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
    navigateToScreen('tray')
  }

  const handleTrayExplain = async () => {
    if (stagedFiles.length === 0) return
    setTrayErrorMessage(null)

    try {
      const rawFiles = stagedFiles.map((s) => s.file)
      const processed = await processPhotosSequentially(rawFiles)
      navigateToScreen('reading')
      await runExplain(processed, selectedLang)
    } catch (err: unknown) {
      console.warn('Tray explain error:', err)
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
        navigateToScreen('home')
      }
      return updated
    })
  }

  // Handle "Try a sample" items (WEB-14)
  const handleSampleClick = async (sampleFilename: string) => {
    retryActionRef.current = () => handleSampleClick(sampleFilename)
    try {
      setCurrentError(null)
      const targetLang = resolveLang(selectedLang)
      const result = await fetchSampleResult(sampleFilename, targetLang)
      const res = await fetch(`/samples/${sampleFilename}`)
      const files: File[] = []
      if (res.ok) {
        const blob = await res.blob()
        const mimeType = sampleFilename.endsWith('.pdf') ? 'application/pdf' : 'image/jpeg'
        files.push(new File([blob], sampleFilename, { type: mimeType }))
      }
      const resultId = `sample-${sampleFilename}`
      currentResultIdRef.current = resultId
      originalResultRef.current = result
      translationCacheRef.current.set(`${resultId}:${targetLang}`, result)
      activeFilesRef.current = files
      setActiveFiles(files)
      setResultData(result)
      setShowOnboarding(false)
      navigateToScreen('result')
    } catch (err: unknown) {
      if (err instanceof DOMException && err.name === 'AbortError') return
      const msg = err instanceof Error ? err.message : 'Failed to load sample'
      setCurrentError({
        message: msg,
        messageLocal: getLocalFallbackError(selectedLang, 'generic'),
        statusCode: 0,
      })
      navigateToScreen('reading')
    }
  }

  // Handle changing language while on Result screen: honest failure flow (WEB-2)
  const handleChangeResultLang = async (newLang: string) => {
    const prevLang = selectedLang
    const targetLang = resolveLang(newLang)
    if (newLang === selectedLang && resultData?.language === targetLang) return

    setSelectedLang(newLang)
    setStoredLanguage(newLang)

    const sampleFile = activeFilesRef.current.find((file) => isSampleFile(file.name))
    if (sampleFile) {
      setIsTranslating(true)
      try {
        const translated = await fetchSampleResult(sampleFile.name, targetLang)
        const resultId = currentResultIdRef.current || `sample-${sampleFile.name}`
        currentResultIdRef.current = resultId
        translationCacheRef.current.set(`${resultId}:${targetLang}`, translated)
        setResultData(translated)
        setTranslateError(null)
      } catch (err: unknown) {
        setTranslateError({
          message: err instanceof Error ? err.message : 'Sample translation is not ready',
          messageLocal: err instanceof Error ? err.message : 'Sample translation is not ready',
          statusCode: 0,
        })
      } finally {
        setIsTranslating(false)
      }
      return
    }

    const resultId = currentResultIdRef.current
    const originalResult = originalResultRef.current || resultData

    if (!resultId || !originalResult) {
      if (activeFilesRef.current.length > 0) {
        runExplain(activeFilesRef.current, targetLang)
      }
      return
    }

    const cacheKey = `${resultId}:${targetLang}`
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
      const translated = await translateDocument(originalResult, targetLang, controller.signal)
      if (controller.signal.aborted) return

      translationCacheRef.current.set(cacheKey, translated)
      setResultData(translated)
      if (fileHashRef.current) await rememberRead(fileHashRef.current, targetLang, translated, resultId)
      setIsTranslating(false)
      console.log('telemetry: translate_ok', { status: 200 })

      if (currentResultIdRef.current) {
        await saveRecentTranslation(currentResultIdRef.current, targetLang, translated)
        await loadRecents()
      }
    } catch (err: unknown) {
      if (controller.signal.aborted) return

      // Try 2: Auto-retry translate once
      try {
        const retried = await translateDocument(originalResult, targetLang, controller.signal)
        if (controller.signal.aborted) return

        translationCacheRef.current.set(cacheKey, retried)
        setResultData(retried)
        if (fileHashRef.current) await rememberRead(fileHashRef.current, targetLang, retried, resultId)
        setIsTranslating(false)
        console.log('telemetry: translate_retry_ok', { status: 200 })

        if (currentResultIdRef.current) {
          await saveRecentTranslation(currentResultIdRef.current, targetLang, retried)
          await loadRecents()
        }
      } catch (retryErr: unknown) {
        if (controller.signal.aborted) return

        // Try 3: Fall back to /api/explain in that language
        if (activeFilesRef.current.length > 0) {
          try {
            const fallbackResult = await explainDocument(
              activeFilesRef.current,
              targetLang,
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

        // Try 4: Everything failed: show calm error and keep previous language
        setIsTranslating(false)
        setSelectedLang(prevLang)
        setStoredLanguage(prevLang)
        setTranslateFailedLang(newLang)
        const statusCode = (retryErr as any)?.statusCode || 500
        console.log('telemetry: failed', { status: statusCode })
      }
    }
  }

  const handleGoHome = () => {
    if (readingTimeoutRef.current) {
      clearTimeout(readingTimeoutRef.current)
      readingTimeoutRef.current = null
    }
    if (readingAbortControllerRef.current) {
      readingAbortControllerRef.current.abort('cancelled')
      readingAbortControllerRef.current = null
    }
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
    clearActiveSession()
    navigateToScreen('home')
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

  // Next step from the newest saved document that still has something to do.
  const nextUpAction = (() => {
    const today = new Date().toISOString().slice(0, 10)

    for (const item of recentResults) {
      const upcoming = (item.result?.actions || []).filter(
        (act) => act.due_date && act.due_date >= today && act.date_status !== 'passed'
      )
      if (upcoming.length === 0) continue
      upcoming.sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)))
      const act = upcoming[0]
      let formattedDate = act.due_date || ''
      try {
        formattedDate = new Intl.DateTimeFormat(resolveLang(selectedLang), {
          day: 'numeric',
          month: 'short',
        }).format(new Date(act.due_date || ''))
      } catch {
        /* keep the printed date */
      }
      return {
        text: act.text,
        date: act.due_date || '',
        formattedDate,
        recentItem: item,
      }
    }
    return null
  })()

  return (
    <div className="min-h-[100dvh] bg-bg text-ink flex justify-center">
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
        ref={galleryInputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={handleChooseFileChange}
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
      <main className={`w-full max-w-[430px] min-w-0 min-h-[100dvh] flex flex-col relative overflow-x-hidden ${screen === 'home' ? '' : 'p-5 pt-[max(1.25rem,env(safe-area-inset-top))] pb-[max(2rem,env(safe-area-inset-bottom))] gap-5'}`}>
        {screen === 'home' && showOnboarding && (
          <Onboarding onDone={() => { setShowOnboarding(false); setScreen('home') }} />
        )}
        {screen === 'home' && !showOnboarding && (
          <HomeScreen
            t={t}
            selectedLang={selectedLang}
            onSelectLang={handleSelectLang}
            isOnline={isOnline}
            nextUp={nextUpAction}
            onOpenNext={() => nextUpAction && handleOpenRecent(nextUpAction.recentItem)}
            onTakePhoto={handleTakePhotoClick}
            onChooseFiles={handleChooseFileClick}
            onChooseFolder={handleChooseFolderClick}
            onSample={handleSampleClick}
            recent={recentResults}
            onOpenRecent={handleOpenRecent}
            onRemoveRecent={handleDeleteRecentItem}
            onDeleteAll={handleDeleteAllRecent}
            saveEnabled={saveRecentEnabled}
            onToggleSave={handleToggleSaveRecent}
            onA11y={handleOpenA11y}
            library={libraryOpen}
            onOpenLibrary={() => setLibraryOpen(true)}
            onCloseLibrary={() => setLibraryOpen(false)}
            onRetryOnline={() => setIsOnline(typeof navigator !== 'undefined' ? navigator.onLine : true)}
          />
        )}

        {/* ========================================================
            SCREEN 2: TRAY
           ======================================================== */}
        {screen === 'tray' && (
          <TrayScreen
            files={stagedFiles}
            lang={resolveLang(selectedLang)}
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
            lang={resolveLang(selectedLang)}
            langName={(SUPPORTED_LANGS.find((l) => l.id === resolveLang(selectedLang)) || SUPPORTED_LANGS[1]).name}
            error={currentError}
            multiReportProgress={multiReportProgress}
            arrived={readingArrived}
            onRetry={() => {
              if (retryActionRef.current) {
                retryActionRef.current()
              } else if (activeFilesRef.current.length > 0) {
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
            onA11yClick={handleOpenA11y}
            multiReports={multiReportsData || undefined}
            onRetrySingleReport={handleRetrySingleReport}
          />
        )}
      </main>

      {/* Accessibility Panel Sheet (WEB-10) */}
      <A11ySheet
        isOpen={isA11yOpen}
        onClose={handleCloseA11y}
        t={t}
        lang={selectedLang}
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
      {mediaSheet && (
        <MediaSheet
          mode={mediaSheet}
          t={t}
          onAllow={handleAllowMedia}
          onClose={() => setMediaSheet(null)}
          onCamera={() => {
            setMediaSheet(null)
            takePhotoInputRef.current?.click()
          }}
          onGallery={() => {
            setMediaSheet(null)
            galleryInputRef.current?.click()
          }}
          onFiles={() => {
            setMediaSheet(null)
            chooseFileInputRef.current?.click()
          }}
        />
      )}

      {deleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-[#8A8F8C] p-0"
          onClick={() => setDeleteConfirm(null)}
          role="presentation"
        >
          <div
            role="dialog"
            aria-modal="true"
            className="w-full max-w-[430px] bg-[#F4F5F2] rounded-t-[40px] border-t-[1.5px] border-[#1A1A1A] p-6 flex flex-col gap-4"
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
                className="sv-press flex-1 h-12 rounded-full bg-[#B3361A] text-[#F4F5F2] border-[1.5px] border-[#1A1A1A] font-bold text-[15px]"
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
