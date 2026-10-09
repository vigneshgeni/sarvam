import { useEffect, useState } from 'react'
import type { ExplainResponse } from '../../types'
import {
  buildFeedbackPayload,
  isBuiltInSample,
  localResultId,
  type FeedbackPayload,
} from './payload.js'
import { REASON_CODES, feedbackCopy, type ReasonCode } from './strings.js'

interface FeedbackBlockProps {
  result: ExplainResponse
  lang: string
  files: { name: string }[]
}

type Phase = 'ask' | 'reasons' | 'sending' | 'sent' | 'error'

function storageKeyFor(id: string): string {
  return `sarvam.feedback.${id}`
}

function readRated(key: string): boolean {
  try {
    return localStorage.getItem(key) === 'up' || localStorage.getItem(key) === 'down'
  } catch {
    return false
  }
}

function rememberRating(key: string, rating: 'up' | 'down'): void {
  try {
    localStorage.setItem(key, rating)
  } catch {
    // Private mode can block storage. The server write still stands.
  }
}

export default function FeedbackBlock({ result, lang, files }: FeedbackBlockProps) {
  const copy = feedbackCopy(lang)
  const docType = result.doc_type || result.document_type || ''
  const resultId = localResultId({
    title: result.title || '',
    language: result.language || '',
    docType: String(docType),
    lang,
    summary: result.summary || [],
  })
  const storageKey = storageKeyFor(resultId)
  const [phase, setPhase] = useState<Phase>('ask')
  const [selected, setSelected] = useState<ReasonCode[]>([])
  const [pending, setPending] = useState<FeedbackPayload | null>(null)

  useEffect(() => {
    setPhase(readRated(storageKey) ? 'sent' : 'ask')
    setSelected([])
    setPending(null)
  }, [storageKey])

  async function send(payload: FeedbackPayload) {
    setPending(payload)
    setPhase('sending')
    try {
      const { sendFeedback } = await import('./client.js')
      await sendFeedback(payload)
      rememberRating(storageKey, payload.rating)
      setPhase('sent')
    } catch {
      setPhase('error')
    }
  }

  function submit(rating: 'up' | 'down', reasons?: ReasonCode[]) {
    try {
      const payload = buildFeedbackPayload({
        rating,
        lang,
        docType,
        sample: isBuiltInSample(files.map((file) => file.name)),
        ...(rating === 'down' ? { reasons: reasons ?? [] } : {}),
      })
      void send(payload)
    } catch {
      setPhase('error')
    }
  }

  function onYes() {
    if (phase === 'sending') return
    submit('up')
  }

  function onNo() {
    if (phase === 'sending') return
    if (phase === 'ask') {
      setPhase('reasons')
      return
    }
    submit('down', selected)
  }

  function toggleReason(code: ReasonCode) {
    setSelected((current) =>
      current.includes(code) ? current.filter((item) => item !== code) : [...current, code],
    )
  }

  const showReasons =
    phase === 'reasons' ||
    ((phase === 'sending' || phase === 'error') && pending?.rating === 'down')
  const busy = phase === 'sending'

  return (
    <section lang={lang} aria-labelledby="feedback-prompt" className="flex flex-col gap-3 pt-1">
      {phase === 'sent' ? (
        <p className="text-base text-[#15171A] leading-relaxed text-center">{copy.thanks}</p>
      ) : (
        <>
          <h2 id="feedback-prompt" className="text-base font-bold text-[#15171A] text-center">
            {copy.prompt}
          </h2>
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              className="focus-ring min-h-[44px] min-w-[44px] rounded-full border-2 border-[#146B4E] bg-[#146B4E] px-3 text-base font-bold text-white disabled:opacity-60"
              onClick={onYes}
              disabled={busy}
              aria-pressed={pending?.rating === 'up' && phase !== 'ask'}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <ThumbIcon up />
                {copy.yes}
              </span>
            </button>
            <button
              type="button"
              className={`focus-ring min-h-[44px] min-w-[44px] rounded-full border-2 px-3 text-base font-bold disabled:opacity-60 ${
                showReasons
                  ? 'border-[#C2410C] bg-[#C2410C] text-white'
                  : 'border-[#15171A] bg-white text-[#15171A]'
              }`}
              onClick={onNo}
              disabled={busy}
              aria-expanded={showReasons}
              aria-pressed={showReasons}
            >
              <span className="inline-flex items-center justify-center gap-2">
                <ThumbIcon />
                {copy.no}
              </span>
            </button>
          </div>

          {showReasons && (
            <div className="flex flex-col gap-2">
              <p id="feedback-reasons-label" className="text-base font-semibold text-[#15171A]">
                {copy.whatWasWrong}
              </p>
              <div role="group" aria-labelledby="feedback-reasons-label" className="flex flex-wrap gap-2">
                {REASON_CODES.map((code) => {
                  const pressed = selected.includes(code)
                  return (
                    <button
                      key={code}
                      type="button"
                      className={`focus-ring min-h-[44px] rounded-full border-2 px-3 text-base font-semibold ${
                        pressed
                          ? 'border-[#1E1838] bg-[#1E1838] text-white'
                          : 'border-[#E6E6E1] bg-white text-[#15171A]'
                      }`}
                      aria-pressed={pressed}
                      onClick={() => toggleReason(code)}
                      disabled={busy}
                    >
                      {copy.reasons[code]}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {phase === 'error' && (
            <div className="flex flex-col items-center gap-2">
              <p role="alert" className="text-base text-[#B42318] text-center">
                {copy.sendFailed}
              </p>
              <button
                type="button"
                className="focus-ring min-h-[44px] min-w-[44px] rounded-full border-2 border-[#15171A] bg-white px-4 text-base font-bold text-[#15171A]"
                onClick={() => {
                  if (pending?.rating === 'down') submit('down', selected)
                  else if (pending) void send(pending)
                }}
                disabled={busy}
              >
                {copy.tryAgain}
              </button>
            </div>
          )}
        </>
      )}
    </section>
  )
}

function ThumbIcon({ up = false }: { up?: boolean }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      className={`h-5 w-5 ${up ? '' : 'rotate-180'}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M7 11v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1h3z" />
      <path d="M7 11l4.2-7.2A2 2 0 0 1 14.7 5L14 9h5.2a2 2 0 0 1 2 2.3l-1.2 7A2 2 0 0 1 18 20H7" />
    </svg>
  )
}
