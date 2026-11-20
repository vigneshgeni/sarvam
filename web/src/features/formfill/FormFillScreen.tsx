import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { FormDraft, FormField, UserProfile } from '../../types'
import { getSection, resolveLang } from '../../i18n'
import { transcribeAudio } from '../../api'
import { detectFormFields, extractFormValues } from './formfillApi'
import {
  NEVER_FILL_TYPES,
  buildFilledPdfFilename,
  buildMissingFieldsPrompt,
  clampBox,
  fillFieldsFromProfile,
  formatDateForForm,
  getMissingFields,
  isIdNumberField,
  maskIdValue,
  splitCharGrid,
} from './formMath.js'
import { buildFormPdf } from './pdfBuilder.js'
import { getUserProfile, saveFormDraft, saveUserProfile } from './profileStorage.js'
import type { FormFillLiveBridge } from './openFormFill'
import MyDetailsSheet from './MyDetailsSheet'

interface FormFillScreenProps {
  lang: string
  images: string[]
  initialTitle?: string
  sourcePdfBytes?: Uint8Array | null
  initialDraft?: FormDraft | null
  liveBridge?: FormFillLiveBridge | null
  isInRoom?: boolean
  onBack: () => void
  onDraftSaved?: () => void
}

interface ChatLine {
  role: 'user' | 'gemini'
  text: string
}

export default function FormFillScreen({
  lang,
  images,
  initialTitle,
  sourcePdfBytes,
  initialDraft,
  liveBridge,
  isInRoom = false,
  onBack,
  onDraftSaved,
}: FormFillScreenProps) {
  const ff = getSection(lang, 'formFill')
  const concreteLang = resolveLang(lang)

  const pageImages = useMemo(
    () => (initialDraft?.pageImages?.length ? initialDraft.pageImages : images),
    [initialDraft, images]
  )

  const [formTitle, setFormTitle] = useState(initialDraft?.title || initialTitle || 'KYC update form')
  const [fields, setFields] = useState<FormField[]>(initialDraft?.fields || [])
  const [values, setValues] = useState<Record<string, string>>(initialDraft?.values || {})
  const [fromProfileIds, setFromProfileIds] = useState<string[]>([])
  const [userSaidIds, setUserSaidIds] = useState<string[]>([])
  const [pageIdx, setPageIdx] = useState(0)

  const [detecting, setDetecting] = useState(!initialDraft?.fields?.length)
  const [detectError, setDetectError] = useState<string | null>(null)

  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [profileLoaded, setProfileLoaded] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  const [revealedIds, setRevealedIds] = useState<Record<string, boolean>>({})
  const [editingField, setEditingField] = useState<FormField | null>(null)
  const [editDraftVal, setEditDraftVal] = useState('')
  const [toast, setToast] = useState<string | null>(null)

  // Missing-field Q&A state
  const [chatLines, setChatLines] = useState<ChatLine[]>([])
  const [answerInput, setAnswerInput] = useState('')
  const [isRecording, setIsRecording] = useState(false)
  const [extracting, setExtracting] = useState(false)
  const [activeMissingIdx, setActiveMissingIdx] = useState(0)

  // Share / PDF sheet state
  const [shareOpen, setShareOpen] = useState(false)
  const [selectedFmt, setSelectedFmt] = useState<'pdf' | 'word' | 'gdoc'>('pdf')
  const [generatingPdf, setGeneratingPdf] = useState(false)
  const [generatedPdfBytes, setGeneratedPdfBytes] = useState<Uint8Array | null>(null)

  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const chunksRef = useRef<Blob[]>([])
  const livePromptSentRef = useRef(false)
  const draftIdRef = useRef<string | undefined>(initialDraft?.id)

  const showToast = useCallback((msg: string) => {
    setToast(msg)
    window.setTimeout(() => {
      setToast((prev) => (prev === msg ? null : prev))
    }, 2800)
  }, [])

  // Load saved profile from IndexedDB on mount
  useEffect(() => {
    let active = true
    getUserProfile('me').then((p) => {
      if (!active) return
      setProfile(p)
      setProfileLoaded(true)
      // First-time user with no saved details yet (and not reopening a saved draft)
      if (!p && !initialDraft) {
        setDetailsOpen(true)
      }
    })
    return () => {
      active = false
    }
  }, [initialDraft])

  const runDetection = useCallback(async () => {
    if (!pageImages.length) {
      setDetecting(false)
      return
    }
    setDetecting(true)
    setDetectError(null)
    try {
      const detected = await detectFormFields(pageImages, initialTitle)
      setFormTitle(detected.formTitle || initialTitle || 'Form')
      setFields(detected.fields)
      setDetecting(false)
    } catch {
      setDetectError(ff.detectError || 'Could not detect form boxes. Try again.')
      setDetecting(false)
    }
  }, [pageImages, initialTitle, ff.detectError])

  useEffect(() => {
    if (!initialDraft?.fields?.length) {
      void runDetection()
    }
  }, [initialDraft, runDetection])

  // Apply profile values whenever fields and profile are ready
  useEffect(() => {
    if (!profileLoaded || !fields.length || !profile) return
    const { values: filled, fromProfileIds: filledIds } = fillFieldsFromProfile(fields, profile)
    if (filledIds.length > 0) {
      setValues((prev) => {
        const merged = { ...prev }
        for (const id of filledIds) {
          if (!merged[id]) merged[id] = filled[id]
        }
        return merged
      })
      setFromProfileIds((prev) => Array.from(new Set([...prev, ...filledIds])))
    }
  }, [profileLoaded, fields, profile])

  const fillableFields = useMemo(
    () => fields.filter((f) => !NEVER_FILL_TYPES.has(f.type)),
    [fields]
  )

  const filledCount = useMemo(
    () =>
      fillableFields.filter((f) => {
        const v = values[f.id]
        return Boolean(v && String(v).trim())
      }).length,
    [fillableFields, values]
  )

  const missingFields = useMemo(() => getMissingFields(fields, values), [fields, values])
  const currentMissing = missingFields[Math.min(activeMissingIdx, Math.max(0, missingFields.length - 1))] || null

  // Build initial Gemini greeting line once detection finishes
  useEffect(() => {
    if (detecting || !fields.length) return
    setChatLines((prev) => {
      if (prev.length > 0) return prev
      const missingLabels = missingFields.map((f) => f.label).slice(0, 3).join(', ')
      const msg =
        missingFields.length > 0
          ? `I filled ${filledCount} of ${fields.length} boxes from your saved details. Still needed: ${missingLabels}.`
          : `I filled ${filledCount} of ${fields.length} boxes. The signature box is left for you to sign by hand.`
      return [
        { role: 'user', text: 'Fill this with my details.' },
        { role: 'gemini', text: msg },
      ]
    })
  }, [detecting, fields.length, filledCount, missingFields])

  // Extract values from user transcript via POST /api/formfill/extract
  const applyTranscript = useCallback(
    async (transcript: string, targetFields?: FormField[]) => {
      const text = transcript.trim()
      if (!text) return
      const targets = (targetFields && targetFields.length > 0 ? targetFields : missingFields).filter(
        (f) => !NEVER_FILL_TYPES.has(f.type)
      )
      if (targets.length === 0) return

      setChatLines((prev) => [...prev, { role: 'user', text }])
      setExtracting(true)
      try {
        const extracted = await extractFormValues(
          targets.map((f) => ({
            id: f.id,
            label: f.label,
            type: f.type,
            dateFormat: f.dateFormat,
            cells: f.cells,
          })),
          text
        )

        const newlyFilled: string[] = []
        setValues((prev) => {
          const next = { ...prev }
          for (const f of targets) {
            const rawVal = extracted[f.id]
            if (rawVal !== undefined && rawVal !== null && String(rawVal).trim() !== '') {
              let finalVal = String(rawVal).trim()
              if (f.type === 'date' && f.dateFormat) {
                finalVal = formatDateForForm(finalVal, f.dateFormat)
              }
              next[f.id] = finalVal
              newlyFilled.push(f.id)
            }
          }
          return next
        })

        if (newlyFilled.length > 0) {
          setUserSaidIds((prev) => Array.from(new Set([...prev, ...newlyFilled])))
          const remainingCount = Math.max(0, missingFields.length - newlyFilled.length)
          setChatLines((prev) => [
            ...prev,
            {
              role: 'gemini',
              text:
                remainingCount === 0
                  ? 'Done. The signature box is left for you to sign by hand. Please check the blue text before you save.'
                  : `Filled ${newlyFilled.length}. ${remainingCount} left.`,
            },
          ])
        } else if (targets.length === 1) {
          // Direct single-field fallback when the user typed a literal answer
          const single = targets[0]
          let direct = text
          if (single.type === 'date' && single.dateFormat) {
            direct = formatDateForForm(direct, single.dateFormat)
          }
          setValues((prev) => ({ ...prev, [single.id]: direct }))
          setUserSaidIds((prev) => Array.from(new Set([...prev, single.id])))
        }
      } catch {
        // Offline/error fallback for single missing field typed directly
        if (targets.length === 1) {
          const single = targets[0]
          setValues((prev) => ({ ...prev, [single.id]: text }))
          setUserSaidIds((prev) => Array.from(new Set([...prev, single.id])))
        }
      } finally {
        setExtracting(false)
        setAnswerInput('')
      }
    },
    [missingFields]
  )

  // Live session integration: send prompt once and listen to user turns
  useEffect(() => {
    if (!liveBridge?.isOpen || detecting || !missingFields.length || livePromptSentRef.current) return
    const prompt = buildMissingFieldsPrompt(missingFields)
    if (prompt) {
      livePromptSentRef.current = true
      liveBridge.sendPrompt(prompt)
    }
  }, [liveBridge, detecting, missingFields])

  useEffect(() => {
    if (!liveBridge?.isOpen || !liveBridge.onUserTranscript) return
    return liveBridge.onUserTranscript((transcript) => {
      void applyTranscript(transcript)
    })
  }, [liveBridge, applyTranscript])

  // Solo voice recording via MediaRecorder + /api/transcribe (with Web Speech fallback)
  const toggleVoiceInput = async () => {
    if (isRecording) {
      mediaRecorderRef.current?.stop()
      setIsRecording(false)
      return
    }

    if (typeof navigator !== 'undefined' && navigator.mediaDevices?.getUserMedia && typeof MediaRecorder !== 'undefined') {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
        const rec = new MediaRecorder(stream)
        chunksRef.current = []
        rec.ondataavailable = (e) => {
          if (e.data.size > 0) chunksRef.current.push(e.data)
        }
        rec.onstop = async () => {
          stream.getTracks().forEach((tr) => tr.stop())
          const blob = new Blob(chunksRef.current, { type: rec.mimeType || 'audio/webm' })
          if (blob.size > 0) {
            const transcript = await transcribeAudio(blob, concreteLang)
            if (transcript) {
              await applyTranscript(transcript)
            }
          }
        }
        mediaRecorderRef.current = rec
        rec.start()
        setIsRecording(true)
        return
      } catch {
        // Fall back to focusing input
      }
    }
    const el = document.querySelector<HTMLInputElement>('[data-testid="formfill-answer-input"]')
    el?.focus()
  }

  const handleTapBox = (field: FormField) => {
    if (field.type === 'signature') {
      showToast(ff.signatureHint || 'Leave blank — sign by hand after saving')
      return
    }
    if (field.type === 'photo') {
      showToast(ff.photoHint || 'Attach photo after printing')
      return
    }
    if (isIdNumberField(field) && !revealedIds[field.id]) {
      setRevealedIds((prev) => ({ ...prev, [field.id]: true }))
    }
    setEditingField(field)
    setEditDraftVal(values[field.id] || '')
  }

  const handleSaveEditedField = (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingField) return
    let nextVal = editDraftVal.trim()
    if (editingField.type === 'date' && editingField.dateFormat && nextVal) {
      nextVal = formatDateForForm(nextVal, editingField.dateFormat)
    }
    setValues((prev) => ({ ...prev, [editingField.id]: nextVal }))
    setEditingField(null)
  }

  const ensurePdfBytes = useCallback(async (): Promise<Uint8Array> => {
    setGeneratingPdf(true)
    try {
      const bytes = await buildFormPdf({
        pageImages,
        sourcePdfBytes,
        fields,
        values,
        formTitle,
      })
      setGeneratedPdfBytes(bytes)
      // Expose last generated PDF bytes on window in DEV/test builds for Playwright verification
      if (typeof window !== 'undefined') {
        ;(window as unknown as Record<string, unknown>).__sarvamLastFormPdf = bytes
      }
      return bytes
    } finally {
      setGeneratingPdf(false)
    }
  }, [pageImages, sourcePdfBytes, fields, values, formTitle])

  const handleOpenShare = async () => {
    setShareOpen(true)
    try {
      await ensurePdfBytes()
    } catch {
      showToast('Could not build PDF')
    }
  }

  const triggerDownload = (bytes: Uint8Array, fileName: string) => {
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const blob = new Blob([ab], { type: 'application/pdf' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = fileName
    document.body.appendChild(a)
    a.click()
    a.remove()
    window.setTimeout(() => URL.revokeObjectURL(url), 5000)
  }

  const handleSharePdf = async (mode: 'share' | 'download') => {
    const bytes = generatedPdfBytes || (await ensurePdfBytes())
    const fileName = buildFilledPdfFilename(formTitle)
    const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
    const file = new File([ab], fileName, { type: 'application/pdf' })

    if (
      mode === 'share' &&
      typeof navigator !== 'undefined' &&
      typeof navigator.canShare === 'function' &&
      typeof navigator.share === 'function'
    ) {
      try {
        if (navigator.canShare({ files: [file] })) {
          await navigator.share({ files: [file], title: formTitle })
          return
        }
      } catch (err: unknown) {
        if (err instanceof DOMException && err.name === 'AbortError') return
      }
    }

    triggerDownload(bytes, fileName)
    showToast(ff.pdfReadyToast || 'PDF ready')
  }

  const handleKeepDraft = async () => {
    let pdfBlob: Blob | null = null
    try {
      const bytes = generatedPdfBytes || (await ensurePdfBytes())
      const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer
      pdfBlob = new Blob([ab], { type: 'application/pdf' })
    } catch {
      pdfBlob = null
    }
    const saved = await saveFormDraft({
      id: draftIdRef.current,
      title: formTitle,
      pageImages,
      fields,
      values,
      pdfBlob,
      status: 'draft',
    })
    draftIdRef.current = saved.id
    onDraftSaved?.()
    showToast(ff.draftSavedToast || 'Saved to Recent as Draft · sign by hand')
    onBack()
  }

  const pageFields = useMemo(
    () => fields.filter((f) => (f.page || 0) === pageIdx),
    [fields, pageIdx]
  )

  const progressText =
    missingFields.length > 0
      ? (ff.progressNeedYou || '{filled} of {total} filled · {missing} need you')
          .replace('{filled}', String(filledCount))
          .replace('{total}', String(fields.length))
          .replace('{missing}', String(missingFields.length))
      : (ff.progressReady || '{filled} of {total} filled · sign by hand')
          .replace('{filled}', String(filledCount))
          .replace('{total}', String(fields.length))

  const formats = [
    {
      id: 'pdf' as const,
      name: ff.formatPdf || 'PDF',
      sub: ff.formatPdfSub || 'Looks like the paper form',
      note: ff.formatPdfNote || 'Your answers are written onto the scanned form, ready to print or send.',
    },
    {
      id: 'word' as const,
      name: ff.formatWord || 'Word',
      sub: ff.formatWordSub || 'Typed, editable',
      note: ff.formatWordNote || 'Word export is coming soon. Export as PDF today.',
    },
    {
      id: 'gdoc' as const,
      name: ff.formatGdoc || 'Google Doc',
      sub: ff.formatGdocSub || 'Needs Google',
      note: ff.formatGdocNote || 'Google Doc export is coming soon. Export as PDF today.',
    },
  ]

  const currentFormatNote = formats.find((f) => f.id === selectedFmt)?.note || formats[0].note

  return (
    <div
      data-testid="formfill-screen"
      className="fixed inset-0 z-30 flex justify-center bg-[#E9E6DF] text-[#1B1B1B]"
    >
      <div className="w-full max-w-[430px] h-[100dvh] flex flex-col overflow-hidden bg-[#E9E6DF] relative">
        {/* Top Bar */}
        <header className="flex-none h-[60px] flex items-center justify-between px-2 bg-[#F5F4F2] border-b border-[#EAE7E0]">
          <button
            type="button"
            onClick={onBack}
            aria-label={ff.back || 'Back'}
            className="w-11 h-11 flex items-center justify-center rounded-full"
          >
            <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M15 5l-7 7 7 7" />
            </svg>
          </button>

          <div className="flex flex-col items-center gap-0.5 min-w-0 px-1">
            <span className="text-[16px] font-bold truncate max-w-[210px]">{formTitle}</span>
            <span data-testid="formfill-progress" className="text-[12px] text-[#5E5E5A]">
              {detecting ? ff.detecting || 'Reading form boxes…' : progressText}
            </span>
          </div>

          <button
            type="button"
            onClick={() => setDetailsOpen(true)}
            aria-label={ff.myDetails || 'My details'}
            data-testid="formfill-my-details-btn"
            className="min-w-[44px] h-11 px-2 flex items-center justify-center"
          >
            <span className="px-2 py-1 rounded-lg bg-[#E3B660] text-[11px] font-bold text-[#1B1B1B]">
              {ff.badge || 'Form'}
            </span>
          </button>
        </header>

        {/* Room privacy pill */}
        {isInRoom && (
          <div className="flex-none px-4 py-1.5 bg-[#D3E5E0] text-[#214D47] text-[12px] font-bold text-center">
            {ff.roomPrivatePill || 'Only visible on your phone'}
          </div>
        )}

        {/* Scanned Form Page + Blue Handwriting Overlays */}
        <div className="flex-none h-[340px] flex flex-col items-center justify-center px-3 py-2 relative">
          {detecting ? (
            <div className="w-[300px] h-[306px] bg-white rounded-md shadow-md flex flex-col items-center justify-center gap-2 p-4">
              <span className="w-8 h-8 rounded-full border-2 border-[#214D47] border-t-transparent animate-spin" />
              <span className="text-[14px] font-semibold text-[#5E5E5A]">
                {ff.detecting || 'Reading form boxes…'}
              </span>
            </div>
          ) : detectError ? (
            <div className="w-[300px] h-[306px] bg-white rounded-md shadow-md flex flex-col items-center justify-center gap-3 p-5 text-center">
              <p className="m-0 text-[14px] text-[#1B1B1B] font-semibold">{detectError}</p>
              <button
                type="button"
                onClick={() => { void runDetection() }}
                className="min-h-[44px] px-5 rounded-full bg-[#214D47] text-white font-bold text-[14px]"
              >
                {ff.retry || 'Try again'}
              </button>
            </div>
          ) : (
            <div className="relative h-[306px] max-w-[356px] bg-white shadow-[0_6px_22px_rgba(0,0,0,0.16)] overflow-hidden">
              {pageImages[pageIdx] && (
                <img
                  src={pageImages[pageIdx]}
                  alt={formTitle}
                  className="block h-[306px] w-auto max-w-[356px] object-contain select-none"
                  draggable={false}
                />
              )}

              {/* Positioned interactive field overlays */}
              <div className="absolute inset-0">
                {pageFields.map((field) => {
                  const [x1, y1, x2, y2] = clampBox(field.box)
                  const rawVal = values[field.id] || ''
                  const isSig = field.type === 'signature'
                  const isPhoto = field.type === 'photo'
                  const isNeverFill = isSig || isPhoto
                  const isMissing = !isNeverFill && !rawVal.trim()
                  const isSensitive = isIdNumberField(field)
                  const isMasked = isSensitive && Boolean(rawVal) && !revealedIds[field.id]
                  const shownValue = isNeverFill
                    ? ''
                    : field.type === 'checkbox'
                    ? rawVal && ['true', 'yes', '1', 'checked', '✓'].includes(rawVal.toLowerCase())
                      ? '✓'
                      : ''
                    : isMasked
                    ? maskIdValue(rawVal, field.profileKey)
                    : rawVal

                  const bg = isNeverFill
                    ? 'rgba(227,182,96,0.28)'
                    : isMissing
                    ? 'rgba(201,104,70,0.20)'
                    : 'rgba(43,77,176,0.06)'

                  return (
                    <button
                      key={field.id}
                      type="button"
                      data-testid={`form-field-${field.id}`}
                      data-field-type={field.type}
                      data-filled={Boolean(shownValue) ? 'true' : 'false'}
                      aria-label={`${field.label}${isMasked ? ` (${ff.tapToReveal || 'Tap to reveal'})` : ''}`}
                      onClick={() => handleTapBox(field)}
                      style={{
                        left: `${x1 / 10}%`,
                        top: `${y1 / 10}%`,
                        width: `${(x2 - x1) / 10}%`,
                        height: `${(y2 - y1) / 10}%`,
                        background: bg,
                        fontFamily: "'Caveat', cursive",
                      }}
                      className="absolute border border-transparent hover:border-[#2B4DB0] flex items-center px-1 text-left overflow-hidden cursor-pointer"
                    >
                      {field.type === 'charGrid' && field.cells && shownValue ? (
                        <span className="w-full h-full grid text-[#2B4DB0] text-[13px] font-semibold leading-none items-center text-center" style={{ gridTemplateColumns: `repeat(${field.cells}, minmax(0, 1fr))` }}>
                          {splitCharGrid(shownValue, field.cells).map((ch, i) => (
                            <span key={i}>{ch}</span>
                          ))}
                        </span>
                      ) : (
                        <span className="text-[#2B4DB0] text-[14px] font-semibold leading-none truncate">
                          {shownValue}
                        </span>
                      )}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          <div className="w-full max-w-[356px] flex items-center justify-between mt-1 px-1">
            <span className="text-[10.5px] text-[#5E5E5A]">
              {ff.blueLegend || 'Blue = filled by Sarvam · you review before saving'}
            </span>
            {pageImages.length > 1 && (
              <div className="flex items-center gap-1.5 text-[11px] font-bold">
                <button
                  type="button"
                  disabled={pageIdx === 0}
                  onClick={() => setPageIdx((p) => Math.max(0, p - 1))}
                  className="px-2 py-0.5 rounded bg-white border border-[#1B1B1B] disabled:opacity-40"
                >
                  ‹
                </button>
                <span>
                  {(ff.pageOf || 'Page {n} of {total}')
                    .replace('{n}', String(pageIdx + 1))
                    .replace('{total}', String(pageImages.length))}
                </span>
                <button
                  type="button"
                  disabled={pageIdx >= pageImages.length - 1}
                  onClick={() => setPageIdx((p) => Math.min(pageImages.length - 1, p + 1))}
                  className="px-2 py-0.5 rounded bg-white border border-[#1B1B1B] disabled:opacity-40"
                >
                  ›
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Dark Bottom Sheet (Gemini Live / Missing Field Q&A) */}
        <section className="flex-1 min-h-0 flex flex-col bg-[#1B1B1B] text-[#F5F4F2] rounded-t-[28px]">
          <div className="flex-none flex items-center justify-between px-[18px] pt-3.5 pb-1.5">
            <div className="flex items-center gap-2.5">
              <span aria-hidden="true" className="inline-flex items-center gap-[3px] h-[18px]">
                <span className="sv-anim w-[3px] h-[14px] rounded-sm bg-[#E3B660]" />
                <span className="sv-anim w-[3px] h-[18px] rounded-sm bg-[#E3B660]" />
                <span className="sv-anim w-[3px] h-[12px] rounded-sm bg-[#E3B660]" />
              </span>
              <span className="text-[14px] font-bold">
                {liveBridge?.isOpen
                  ? ff.sheetHeaderLive || 'Gemini Live · filling with you'
                  : ff.sheetHeaderSolo || 'Fill missing boxes'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setDetailsOpen(true)}
              className="min-h-[36px] px-2.5 rounded-full bg-white/10 text-[12px] font-semibold text-[#D3E5E0]"
            >
              {ff.myDetails || 'My details'}
            </button>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-1.5 flex flex-col gap-2.5">
            {chatLines.map((line, i) => (
              <p key={i} className="m-0 text-[14px] leading-[1.45]">
                <b style={{ color: line.role === 'user' ? '#F6DCD2' : '#E3B660' }}>
                  {line.role === 'user' ? 'You:' : 'Gemini:'}
                </b>{' '}
                {line.text}
              </p>
            ))}

            {/* Status chips */}
            <div className="flex flex-wrap gap-1.5">
              <span className="px-2.5 py-1 rounded-xl bg-[#2E4F49] text-[#D3E5E0] text-[12px] font-bold">
                {(ff.chipFromDetails || '{n} from your details').replace('{n}', String(fromProfileIds.length))}
              </span>
              {missingFields.length > 0 ? (
                <span data-testid="formfill-missing-chip" className="px-2.5 py-1 rounded-xl bg-[#5a3a30] text-[#F6DCD2] text-[12px] font-bold">
                  {(ff.chipNeedYou || '{n} need you').replace('{n}', String(missingFields.length))}
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-xl bg-[#5a3a30] text-[#F6DCD2] text-[12px] font-bold">
                  {(ff.chipYouSaid || '{n} you said').replace('{n}', String(userSaidIds.length))}
                </span>
              )}
              <span className="px-2.5 py-1 rounded-xl bg-[#4a4230] text-[#E3B660] text-[12px] font-bold">
                {ff.chipSignByHand || 'Signature: by hand'}
              </span>
            </div>

            {/* Solo one-at-a-time missing field form (when no Live session is open) */}
            {!liveBridge?.isOpen && currentMissing && !detecting && (
              <form
                data-testid="formfill-missing-qa"
                onSubmit={(e) => {
                  e.preventDefault()
                  void applyTranscript(answerInput, [currentMissing])
                }}
                className="rounded-[18px] bg-white/[0.08] p-3 flex flex-col gap-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <span data-testid="formfill-current-question" className="text-[13.5px] font-bold text-[#E3B660]">
                    {(ff.askMissingPrompt || 'What should I put for {label}?').replace('{label}', currentMissing.label)}
                  </span>
                  {missingFields.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setActiveMissingIdx((i) => (i + 1) % missingFields.length)}
                      className="text-[12px] text-[#D3E5E0] underline shrink-0"
                    >
                      {ff.skipField || 'Skip'}
                    </button>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <input
                    data-testid="formfill-answer-input"
                    value={answerInput}
                    onChange={(e) => setAnswerInput(e.target.value)}
                    placeholder={(ff.typeAnswerPlaceholder || 'Type or speak {label}…').replace('{label}', currentMissing.label)}
                    className="flex-1 min-w-0 min-h-[44px] px-3 rounded-full bg-white text-[#1B1B1B] text-[14.5px] outline-none"
                  />
                  <button
                    type="button"
                    aria-label={isRecording ? ff.stopListening || 'Stop' : ff.answerByVoice || 'Answer by voice'}
                    onClick={() => { void toggleVoiceInput() }}
                    className="w-11 h-11 rounded-full shrink-0 flex items-center justify-center"
                    style={{ background: isRecording ? '#E5533D' : '#214D47', color: '#FFFFFF' }}
                  >
                    <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="11" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                    </svg>
                  </button>
                  <button
                    type="submit"
                    data-testid="formfill-answer-submit"
                    disabled={extracting || !answerInput.trim()}
                    className="min-h-[44px] px-4 rounded-full bg-[#E3B660] text-[#1B1B1B] font-bold text-[14px] disabled:opacity-50"
                  >
                    {ff.applyAnswer || 'Fill'}
                  </button>
                </div>
              </form>
            )}
          </div>

          {/* Bottom Action Bar */}
          <div className="flex-none flex items-center gap-2.5 px-4 pt-2 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
            {missingFields.length > 0 ? (
              <button
                type="button"
                data-testid="formfill-primary-cta"
                onClick={() => {
                  if (isRecording) {
                    void toggleVoiceInput()
                  } else if (answerInput.trim()) {
                    void applyTranscript(answerInput, currentMissing ? [currentMissing] : missingFields)
                  } else {
                    void toggleVoiceInput()
                  }
                }}
                className="sv-press flex-1 min-h-[54px] rounded-[28px] bg-[#E3B660] text-[#1B1B1B] font-bold text-[15.5px] flex items-center justify-center gap-2"
              >
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                </svg>
                <span>{isRecording ? ff.listening || 'Listening…' : ff.answerByVoice || 'Answer by voice'}</span>
              </button>
            ) : (
              <button
                type="button"
                data-testid="formfill-review-save-btn"
                onClick={() => { void handleOpenShare() }}
                className="sv-press flex-1 min-h-[54px] rounded-[28px] bg-[#E3B660] text-[#1B1B1B] font-bold text-[15.5px]"
              >
                {ff.reviewAndSave || 'Review and save'}
              </button>
            )}

            {missingFields.length > 0 && (
              <button
                type="button"
                data-testid="formfill-review-anyway-btn"
                onClick={() => { void handleOpenShare() }}
                className="sv-press min-h-[54px] px-4 rounded-[28px] bg-white/15 text-[#F5F4F2] font-bold text-[14.5px]"
              >
                {ff.reviewAndSave || 'Review and save'}
              </button>
            )}

            <button
              type="button"
              data-testid="formfill-later-btn"
              onClick={() => { void handleKeepDraft() }}
              className="sv-press min-h-[54px] px-4 rounded-[28px] bg-white/15 text-[#F5F4F2] font-bold text-[14.5px]"
            >
              {ff.later || 'Later'}
            </button>
          </div>
        </section>

        {/* Inline field edit dialog */}
        {editingField && (
          <div
            className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center"
            onClick={() => setEditingField(null)}
            role="presentation"
          >
            <form
              role="dialog"
              aria-modal="true"
              aria-label={(ff.editFieldTitle || 'Edit {label}').replace('{label}', editingField.label)}
              onClick={(e) => e.stopPropagation()}
              onSubmit={handleSaveEditedField}
              className="w-full max-w-[430px] bg-[#F5F4F2] text-[#1B1B1B] rounded-t-[28px] border-t-[2px] border-[#1B1B1B] p-5 flex flex-col gap-3"
            >
              <h3 className="m-0 text-[18px] font-bold">
                {(ff.editFieldTitle || 'Edit {label}').replace('{label}', editingField.label)}
              </h3>
              {editingField.type === 'checkbox' ? (
                <label className="flex items-center gap-3 min-h-[44px] text-[15px] font-semibold">
                  <input
                    type="checkbox"
                    checked={['true', 'yes', '1', 'checked', '✓'].includes(editDraftVal.toLowerCase())}
                    onChange={(e) => setEditDraftVal(e.target.checked ? 'true' : '')}
                    className="w-5 h-5"
                  />
                  <span>{editingField.label}</span>
                </label>
              ) : (
                <input
                  autoFocus
                  value={editDraftVal}
                  onChange={(e) => setEditDraftVal(e.target.value)}
                  placeholder={editingField.dateFormat || editingField.label}
                  className="w-full min-h-[48px] px-4 rounded-[16px] border-[2px] border-[#1B1B1B] bg-white text-[16px]"
                />
              )}
              <div className="flex gap-2.5">
                <button
                  type="button"
                  onClick={() => setEditingField(null)}
                  className="min-h-[48px] flex-1 rounded-full border-[2px] border-[#1B1B1B] bg-white font-bold"
                >
                  {ff.close || 'Close'}
                </button>
                <button
                  type="submit"
                  className="min-h-[48px] flex-1 rounded-full border-[2px] border-[#1B1B1B] bg-[#E3B660] font-bold"
                >
                  {ff.done || 'Done'}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Save / Share Sheet (matches FormFill.dc.html) */}
        {shareOpen && (
          <div
            className="absolute inset-0 z-40 bg-black/45 flex flex-col justify-end"
            onClick={() => setShareOpen(false)}
            role="presentation"
          >
            <div
              role="dialog"
              aria-modal="true"
              aria-label={ff.shareTitle || 'Your filled form is ready'}
              data-testid="formfill-share-sheet"
              onClick={(e) => e.stopPropagation()}
              className="bg-[#F5F4F2] text-[#1B1B1B] rounded-t-[28px] px-[22px] pt-[18px] pb-7 flex flex-col gap-3"
            >
              <div className="flex items-center justify-between">
                <h2 className="m-0 text-[20px] font-bold">{ff.shareTitle || 'Your filled form is ready'}</h2>
                <button
                  type="button"
                  onClick={() => setShareOpen(false)}
                  aria-label={ff.close || 'Close'}
                  className="w-11 h-11 rounded-full bg-[#EAE7E0] flex items-center justify-center"
                >
                  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1B1B1B" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6L6 18" />
                  </svg>
                </button>
              </div>

              <div className="flex gap-2" role="group" aria-label="Format">
                {formats.map((f) => {
                  const on = selectedFmt === f.id
                  return (
                    <button
                      key={f.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setSelectedFmt(f.id)}
                      className="flex-1 min-h-[64px] rounded-[18px] border-[2px] border-[#1B1B1B] flex flex-col items-center justify-center gap-0.5 px-1"
                      style={{ background: on ? '#E3B660' : '#FFFFFF' }}
                    >
                      <span className="text-[14.5px] font-bold">{f.name}</span>
                      <span className="text-[11px] text-[#5E5E5A]">{f.sub}</span>
                    </button>
                  )
                })}
              </div>

              <p className="m-0 text-[12.5px] text-[#5E5E5A]">
                {generatingPdf ? ff.generatingPdf || 'Creating PDF…' : currentFormatNote}
              </p>

              <div className="grid grid-cols-2 gap-2.5">
                <button
                  type="button"
                  data-testid="formfill-share-whatsapp"
                  disabled={generatingPdf}
                  onClick={() => { void handleSharePdf('share') }}
                  className="sv-press min-h-[52px] rounded-[26px] border-[2px] border-[#1B1B1B] bg-[#214D47] text-white text-[14.5px] font-bold"
                >
                  {ff.shareWhatsApp || 'WhatsApp'}
                </button>
                <button
                  type="button"
                  data-testid="formfill-share-email"
                  disabled={generatingPdf}
                  onClick={() => { void handleSharePdf('share') }}
                  className="sv-press min-h-[52px] rounded-[26px] border-[2px] border-[#1B1B1B] bg-white text-[#1B1B1B] text-[14.5px] font-bold"
                >
                  {ff.shareEmail || 'Email'}
                </button>
                <button
                  type="button"
                  data-testid="formfill-save-files"
                  disabled={generatingPdf}
                  onClick={() => { void handleSharePdf('download') }}
                  className="sv-press min-h-[52px] rounded-[26px] border-[2px] border-[#1B1B1B] bg-white text-[#1B1B1B] text-[14.5px] font-bold"
                >
                  {ff.saveToFiles || 'Save to Files'}
                </button>
                <button
                  type="button"
                  data-testid="formfill-keep-sarvam"
                  disabled={generatingPdf}
                  onClick={() => { void handleKeepDraft() }}
                  className="sv-press min-h-[52px] rounded-[26px] border-[2px] border-[#1B1B1B] bg-[#E3B660] text-[#1B1B1B] text-[14.5px] font-bold"
                >
                  {ff.keepInSarvam || 'Keep in Sarvam'}
                </button>
              </div>

              <div className="flex gap-2 text-[12.5px] leading-[1.45] text-[#2E4F49] px-3 py-2.5 rounded-[14px] bg-[#D3E5E0]">
                <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="#214D47" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="shrink-0 mt-0.5">
                  <path d="M12 3l7 3v5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V6z" />
                </svg>
                <span>
                  {ff.sharePrivacyNote ||
                    'Kept forms stay on this phone under Recent, marked "Draft · sign by hand". Your ID numbers are never read aloud in a call.'}
                </span>
              </div>
            </div>
          </div>
        )}

        {/* My Details setup / edit sheet */}
        <MyDetailsSheet
          isOpen={detailsOpen}
          lang={lang}
          initialProfile={profile}
          onClose={() => setDetailsOpen(false)}
          onSave={(saved) => {
            void saveUserProfile(saved).then((clean) => {
              setProfile(clean)
              setDetailsOpen(false)
            })
          }}
        />

        {/* In-app toast */}
        {toast && (
          <div
            role="status"
            aria-live="polite"
            className="absolute top-[68px] left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-full bg-[#1B1B1B] text-[#F5F4F2] text-[13px] font-semibold shadow-lg whitespace-nowrap"
          >
            {toast}
          </div>
        )}
      </div>
    </div>
  )
}
