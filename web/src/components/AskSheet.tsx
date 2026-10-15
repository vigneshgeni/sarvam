import { useState, useEffect, useRef } from 'react'
import type { ExplainResponse, AskResponse, AskTurn } from '../types'
import Sheet from './Sheet'
import {
  MicIcon,
  SendIcon,
  CloseIcon,
  PlayIcon,
  CheckIcon,
  AlertTriangleIcon,
} from './icons'
import { askDocument, transcribeAudio } from '../api'
import { saveRecentAsks } from '../utils/db'
import { resolveLang } from '../i18n'

interface AskSheetProps {
  isOpen: boolean
  onClose: () => void
  result: ExplainResponse
  files?: File[]
  lang: string
  t: Record<string, string>
  resultId?: string
  initialAsks?: AskTurn[]
  onSpeakAnswer?: (text: string) => void
}

export default function AskSheet({
  isOpen,
  onClose,
  result,
  files,
  lang,
  t,
  resultId,
  initialAsks,
  onSpeakAnswer,
}: AskSheetProps) {
  const [question, setQuestion] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isStillWorking, setIsStillWorking] = useState(false)
  const [turns, setTurns] = useState<AskTurn[]>(initialAsks || [])
  const [askError, setAskError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const recorderRef = useRef<MediaRecorder | null>(null)
  const silenceTimerRef = useRef<number | null>(null)
  const [recordSeconds, setRecordSeconds] = useState(0)
  const threadKey = resultId || `title:${result.title}`

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(`sarvam.ask.${threadKey}`)
      if (raw) {
        const saved = JSON.parse(raw) as AskTurn[]
        if (Array.isArray(saved) && saved.length) setTurns(saved)
        return
      }
    } catch {
      /* keep the saved result thread */
    }
    if (initialAsks?.length) setTurns(initialAsks)
  }, [threadKey])

  useEffect(() => {
    if (!turns.length) return
    try {
      sessionStorage.setItem(`sarvam.ask.${threadKey}`, JSON.stringify(turns))
    } catch {
      /* the saved result still holds the thread */
    }
    if (resultId) void saveRecentAsks(resultId, turns)
  }, [turns, threadKey, resultId])

  // Track 15s loading timer
  useEffect(() => {
    if (!isLoading) {
      setIsStillWorking(false)
      return
    }
    const timer = setTimeout(() => {
      setIsStillWorking(true)
    }, 15000)
    return () => clearTimeout(timer)
  }, [isLoading])

  // Clear answers when sheet closes
  useEffect(() => {
    if (!isOpen) {
      stopVoiceRecognition()
    }
  }, [isOpen])

  const stopVoiceRecognition = () => {
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop()
      } catch {}
      recognitionRef.current = null
    }
    if (recorderRef.current && recorderRef.current.state === 'recording') {
      try { recorderRef.current.stop() } catch {}
    }
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    setIsListening(false)
  }

  useEffect(() => {
    if (!isListening) {
      setRecordSeconds(0)
      return
    }
    const timer = window.setInterval(() => setRecordSeconds((seconds) => seconds + 1), 1000)
    return () => window.clearInterval(timer)
  }, [isListening])

  const handleToggleMic = async () => {
    setSpeechError(null)

    if (isListening) {
      stopVoiceRecognition()
      return
    }

    const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1)
    const mimeOrder = ios ? ['audio/mp4', 'audio/webm'] : ['audio/webm', 'audio/mp4']
    const mime = typeof MediaRecorder !== 'undefined'
      ? mimeOrder.find((type) => MediaRecorder.isTypeSupported(type)) || ''
      : ''

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream)
      const chunks: Blob[] = []
      recorder.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data)
      }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(chunks, { type: recorder.mimeType || mime || 'audio/webm' })
        void transcribeAudio(blob, resolveLang(lang)).then((text) => {
          if (text) setQuestion((prev) => (prev ? `${prev} ${text}` : text).slice(0, 500))
        }).catch(() => {
          /* the person can still type */
        })
        setIsListening(false)
      }
      recorderRef.current = recorder
      recorder.start()
      setIsListening(true)
      window.setTimeout(() => {
        if (recorder.state === 'recording') recorder.stop()
      }, 30000)
    } catch (err: any) {
      const denied = err?.name === 'NotAllowedError' || err?.name === 'PermissionDeniedError'
      if (denied) setSpeechError(t.micDenied || 'Microphone permission is off. You can still type.')
      stopVoiceRecognition()
    }
  }

  const handleAskSubmit = async (qText?: string) => {
    const targetQ = (qText || question).trim()
    if (!targetQ || isLoading) return

    stopVoiceRecognition()
    setIsLoading(true)
    setAskError(null)
    setQuestion('')

    const history = turns
      .slice(-6)
      .map((turn) => `Q: ${turn.question}\nA: ${turn.answer}`)
      .join('\n')
    const askOnce = () => askDocument({
      question: targetQ,
      lang: resolveLang(lang),
      result,
      files: files && files.length > 0 ? files : undefined,
      history: history || undefined,
    })

    try {
      let resp: AskResponse
      try {
        resp = await askOnce()
      } catch (err: any) {
        if (err?.statusCode === 503) resp = await askOnce()
        else throw err
      }
      setTurns((prev) => [...prev, {
        question: targetQ,
        answer: resp.not_found ? (t.askNotFound || "This document doesn't say") : resp.answer,
        quote: resp.quote || undefined,
        page: resp.page ?? undefined,
        not_found: resp.not_found,
        evidence: resp.evidence,
        answered_from: resp.answered_from,
      }])
    } catch (err: any) {
      setQuestion(targetQ)
      if (err.errorCode === 'ask_unverified') {
        setAskError(t.askUnverified || "I couldn't verify an answer. Check the original.")
      } else {
        setAskError(err.messageLocal || err.message || 'Could not get an answer. Please try again.')
      }
    } finally {
      setIsLoading(false)
    }
  }

  const suggestionChips = [
    t.askChip1 || 'What do I need to pay?',
    t.askChip2 || 'When is the deadline?',
    t.askChip3 || 'Who do I contact?',
  ]

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t.askBtnLabel || 'Ask'}
      maxHeight="max-h-[92vh]"
    >
      <div className="flex flex-col gap-4 pt-1">
        {/* Header */}
        <div className="flex items-start justify-between">
          <div className="flex flex-col gap-0.5">
            <h2 className="sv-display m-0 text-[36px] leading-none text-[#1A1A1A]">
              {t.askBtnLabel || 'Ask'}<span className="text-[#D9603B]">.</span>
            </h2>
            <span className="text-[14px] text-[#575B58]">{t.askHint || 'Type or speak, in any of 9 languages'}</span>
          </div>
          <button type="button" onClick={onClose} className="sv-press w-11 h-11 box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center" aria-label={t.close || 'Close'}>
            <CloseIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          {suggestionChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuestion(chip)
                handleAskSubmit(chip)
              }}
              className="sv-press h-10 px-3.5 rounded-[20px] border-[1.5px] border-[#1A1A1A] bg-transparent font-semibold text-[14px] text-[#1A1A1A]"
            >
              {chip}
            </button>
          ))}
        </div>

        {/* Input Bar with Mic and Counter */}
        <div className="flex flex-col gap-1">
          <div className="flex items-end gap-2">
            <textarea
              value={question}
              maxLength={500}
              rows={2}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  handleAskSubmit()
                }
              }}
              placeholder={t.askPlaceholder || 'Type your question…'}
              aria-label={t.askPlaceholder || 'Your question'}
              className="min-w-0 flex-1 resize-none bg-transparent border-[1.5px] border-[#1A1A1A] rounded-[24px] px-[18px] py-3 text-[15.5px] font-medium leading-snug text-[#1A1A1A] placeholder-[#575B58] outline-none"
            />
            <button
              type="button"
              onClick={() => void handleToggleMic()}
              className={`w-12 h-12 shrink-0 box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center ${isListening ? 'bg-[#D9603B] text-[#1A1A1A] animate-pulse' : 'bg-[#F4F5F2] text-[#1A1A1A]'}`}
              aria-label={isListening ? (t.stopListening || 'Stop') : (t.speakQuestion || 'Speak your question')}
            >
              {isListening ? <span className="font-mono text-[13px] font-bold">{recordSeconds}</span> : <MicIcon className="w-5 h-5" />}
            </button>
            <button
              type="button"
              disabled={!question.trim() || isLoading}
              onClick={() => handleAskSubmit()}
              className="sv-press w-12 h-12 shrink-0 box-border rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] disabled:opacity-40 text-[#1A1A1A] flex items-center justify-center"
              aria-label="Send"
            >
              {isLoading ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <SendIcon className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Character Counter (visible from 450) */}
          {question.length >= 450 && (
            <span className="text-[11px] font-mono text-[#5E636B] text-right px-1">
              {question.length}/500
            </span>
          )}

          {speechError && (
            <span className="text-xs text-[#B42318] px-1">{speechError}</span>
          )}
        </div>

        {/* Loading Indicator with "Still working..." after 15s */}
        {isLoading && (
          <div className="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-[#F6F6F3] border border-[#E6E6E1] text-xs text-[#5E636B] animate-card-in">
            <div className="w-3.5 h-3.5 border-2 border-[#034F46]/30 border-t-[#034F46] rounded-full animate-spin shrink-0" />
            <span>{isStillWorking ? (t.askStillWorking || 'Still working...') : (t.askLoading || 'Looking up answer in document...')}</span>
          </div>
        )}

        {/* Answer Display Card (never displayed if error is present) */}
        {turns.length > 0 && (
          <div className="flex flex-col gap-3 max-h-[42vh] overflow-y-auto">
            {turns.map((turn, index) => (
              <div key={`${index}-${turn.question.slice(0, 24)}`} className="flex flex-col gap-3">
                <div className="self-end max-w-[78%] bg-[#1A1A1A] text-[#F4F5F2] px-4 py-3 rounded-[24px_24px_6px_24px] text-[15.5px] leading-[1.35] break-words">
                  {turn.question}
                </div>
                <div className="self-start flex gap-2.5 max-w-[94%]">
                  <span aria-hidden="true" className="w-[34px] h-[34px] shrink-0 box-border rounded-full bg-[#034F46] border-[1.5px] border-[#1A1A1A] text-[#F4F5F2] flex items-center justify-center text-[15px] font-bold">S<span className="text-[#D9603B]">.</span></span>
                  <div className="flex flex-col gap-2.5 bg-[#F0D7FF] border-[1.5px] border-[#1A1A1A] px-4 py-3 rounded-[6px_24px_24px_24px]">
                    {turn.answered_from === 'summary' && (
                      <span className="text-[12px] font-semibold text-[#575B58]">{t.askAnsweredFromSummary || 'Answering from the summary'}</span>
                    )}
                    <p className="m-0 text-[15.5px] leading-[1.45] text-[#1A1A1A] break-words">{turn.answer}</p>
                    {turn.answered_from !== 'general' && turn.quote && (
                      <p className="m-0 text-[13px] text-[#3B3E3C]">“{turn.quote}”{turn.page ? ` · ${turn.page}` : ''}</p>
                    )}
                    <span className="flex gap-2 flex-wrap items-center">
                      {turn.answered_from === 'general' && (
                        <span className="text-[12.5px] font-semibold text-[#3B3E3C]">{t.askGeneral || 'General information, not from your document'}</span>
                      )}
                      {turn.answered_from !== 'general' && !turn.not_found && (
                      <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold">
                        <CheckIcon className="w-3.5 h-3.5 text-[#034F46]" />
                        {turn.evidence === 'check_original'
                          ? (t.checkAgainstOriginal || 'Check against original')
                          : (t.fromYourDocument || 'From your document')}
                      </span>
                      )}
                      {!turn.not_found && onSpeakAnswer && (
                        <button type="button" onClick={() => onSpeakAnswer(turn.answer)} className="sv-press inline-flex items-center gap-1 h-[30px] px-2.5 rounded-[15px] border-[1.5px] border-[#1A1A1A] bg-[#F4F5F2] font-semibold text-[12.5px]">
                          <PlayIcon className="w-3 h-3" />
                          {t.play || 'Play'}
                        </button>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error Card with Retry */}
        {askError && (
          <div className="bg-[#FFF4DE] border border-[#F4DDB0] rounded-xl p-3 flex items-center justify-between gap-2 text-xs text-[#5A3500]">
            <div className="flex items-center gap-2">
              <AlertTriangleIcon className="w-4 h-4 text-[#C2410C] shrink-0" />
              <span>{askError}</span>
            </div>
            <button
              type="button"
              onClick={() => handleAskSubmit()}
              className="px-2.5 py-1 bg-white border border-[#F4DDB0] rounded font-semibold text-xs text-[#5A3500] hover:bg-neutral-50"
            >
              Retry
            </button>
          </div>
        )}
      </div>
    </Sheet>
  )
}
