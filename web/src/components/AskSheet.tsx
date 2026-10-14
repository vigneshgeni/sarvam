import { useState, useEffect, useRef } from 'react'
import type { ExplainResponse, AskResponse } from '../types'
import Sheet from './Sheet'
import {
  MicIcon,
  MicOffIcon,
  SendIcon,
  CloseIcon,
  PlayIcon,
  CheckIcon,
  AlertTriangleIcon,
} from './icons'
import { askDocument } from '../api'
import { resolveLang } from '../i18n'

interface AskSheetProps {
  isOpen: boolean
  onClose: () => void
  result: ExplainResponse
  files?: File[]
  lang: string
  t: Record<string, string>
  onSpeakAnswer?: (text: string) => void
}

export default function AskSheet({
  isOpen,
  onClose,
  result,
  files,
  lang,
  t,
  onSpeakAnswer,
}: AskSheetProps) {
  const [question, setQuestion] = useState('')
  const [isListening, setIsListening] = useState(false)
  const [speechError, setSpeechError] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [isStillWorking, setIsStillWorking] = useState(false)
  const [answerData, setAnswerData] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<number | null>(null)

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
    if (silenceTimerRef.current) {
      clearTimeout(silenceTimerRef.current)
      silenceTimerRef.current = null
    }
    setIsListening(false)
  }

  // Handle SpeechRecognition
  const handleToggleMic = () => {
    setSpeechError(null)

    if (isListening) {
      stopVoiceRecognition()
      return
    }

    const SpeechRec =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition

    if (!SpeechRec) {
      setSpeechError(
        'Voice input is not supported in this browser. Please use your keyboard microphone.'
      )
      return
    }

    try {
      const recognition = new SpeechRec()
      recognitionRef.current = recognition
      recognition.continuous = false
      recognition.interimResults = true

      // Map language code to speech code (e.g. ta-IN, hi-IN, en-IN)
      const concreteLang = resolveLang(lang)
      const langSpeechCodes: Record<string, string> = {
        ta: 'ta-IN',
        hi: 'hi-IN',
        en: 'en-IN',
        te: 'te-IN',
        ml: 'ml-IN',
        kn: 'kn-IN',
        mr: 'mr-IN',
        bn: 'bn-IN',
        or: 'or-IN',
      }
      recognition.lang = langSpeechCodes[concreteLang] || 'en-IN'

      recognition.onstart = () => {
        setIsListening(true)
      }

      recognition.onresult = (event: any) => {
        let transcript = ''
        for (let i = 0; i < event.results.length; i++) {
          transcript += event.results[i][0].transcript
        }
        setQuestion(transcript.slice(0, 500))

        // Reset silence timer
        if (silenceTimerRef.current) clearTimeout(silenceTimerRef.current)
        silenceTimerRef.current = window.setTimeout(() => {
          stopVoiceRecognition()
        }, 3000)
      }

      recognition.onerror = (event: any) => {
        if (event.error !== 'no-speech') {
          setSpeechError(
            'Microphone access denied or error. Try using your keyboard microphone.'
          )
        }
        stopVoiceRecognition()
      }

      recognition.onend = () => {
        stopVoiceRecognition()
      }

      recognition.start()
    } catch {
      setSpeechError('Microphone could not be started.')
      stopVoiceRecognition()
    }
  }

  const handleAskSubmit = async (qText?: string) => {
    const targetQ = (qText || question).trim()
    if (!targetQ || isLoading) return

    stopVoiceRecognition()
    setIsLoading(true)
    setAskError(null)
    setAnswerData(null)

    try {
      const resp = await askDocument({
        question: targetQ,
        lang: resolveLang(lang),
        result,
        files: files && files.length > 0 ? files : undefined,
      })
      setAnswerData(resp)
    } catch (err: any) {
      setAnswerData(null)
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
          <div className="relative flex items-center">
            <input
              type="text"
              value={question}
              maxLength={500}
              onChange={(e) => setQuestion(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  handleAskSubmit()
                }
              }}
              placeholder={t.askPlaceholder || 'Type your question…'}
              aria-label={t.askPlaceholder || 'Your question'}
              className="w-full bg-transparent border-[1.5px] border-[#1A1A1A] rounded-[32px] pl-[18px] pr-[116px] h-14 text-[15.5px] font-medium text-[#1A1A1A] placeholder-[#575B58] outline-none"
            />

            <div className="absolute right-1.5 flex items-center gap-2">
              <button
                type="button"
                onClick={handleToggleMic}
                className={`w-12 h-12 box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center ${isListening ? 'bg-[#1A1A1A] text-[#F4F5F2]' : 'bg-[#D9603B] text-[#1A1A1A]'}`}
                aria-label={isListening ? 'Stop listening' : 'Speak your question'}
              >
                {isListening ? <MicOffIcon className="w-5 h-5" /> : <MicIcon className="w-5 h-5" />}
              </button>
              <button
                type="button"
                disabled={!question.trim() || isLoading}
                onClick={() => handleAskSubmit()}
                className="sv-press w-12 h-12 box-border rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] disabled:opacity-40 text-[#1A1A1A] flex items-center justify-center"
                aria-label="Send"
              >
                {isLoading ? (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <SendIcon className="w-4 h-4" />
                )}
              </button>
            </div>
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
            <div className="w-3.5 h-3.5 border-2 border-[#5B52D6]/30 border-t-[#5B52D6] rounded-full animate-spin shrink-0" />
            <span>{isStillWorking ? (t.askStillWorking || 'Still working...') : (t.askLoading || 'Looking up answer in document...')}</span>
          </div>
        )}

        {/* Answer Display Card (never displayed if error is present) */}
        {!askError && answerData && (
          <div className="flex flex-col gap-3">
            {question.trim() && (
              <div className="self-end max-w-[78%] bg-[#1A1A1A] text-[#F4F5F2] px-4 py-3 rounded-[24px_24px_6px_24px] text-[15.5px] leading-[1.35]">
                {question}
              </div>
            )}
            <div className="self-start flex gap-2.5 max-w-[94%]">
              <span aria-hidden="true" className="w-[34px] h-[34px] shrink-0 box-border rounded-full bg-[#034F46] border-[1.5px] border-[#1A1A1A] text-[#F4F5F2] flex items-center justify-center text-[15px] font-bold">S<span className="text-[#D9603B]">.</span></span>
              <div className="flex flex-col gap-2.5 bg-[#F0D7FF] border-[1.5px] border-[#1A1A1A] px-4 py-3 rounded-[6px_24px_24px_24px]">
                {answerData.answered_from === 'summary' && (
                  <span className="text-[12px] font-semibold text-[#575B58]">{t.askAnsweredFromSummary || 'Answering from the summary'}</span>
                )}
                <p className="m-0 text-[15.5px] leading-[1.45] text-[#1A1A1A]">
                  {answerData.not_found ? (t.askNotFound || "This document doesn't say") : answerData.answer}
                </p>
                {answerData.quote && (
                  <p className="m-0 text-[13px] text-[#3B3E3C]">“{answerData.quote}”{answerData.page ? ` · ${answerData.page}` : ''}</p>
                )}
                <span className="flex gap-2 flex-wrap items-center">
                  <span className="inline-flex items-center gap-1 text-[12.5px] font-semibold">
                    <CheckIcon className="w-3.5 h-3.5 text-[#034F46]" />
                    {answerData.evidence === 'check_original'
                      ? (t.checkAgainstOriginal || 'Check against original')
                      : (t.fromYourDocument || 'From your document')}
                  </span>
                  {!answerData.not_found && onSpeakAnswer && (
                    <button type="button" onClick={() => onSpeakAnswer(answerData.answer)} className="sv-press inline-flex items-center gap-1 h-[30px] px-2.5 rounded-[15px] border-[1.5px] border-[#1A1A1A] bg-[#F4F5F2] font-semibold text-[12.5px]">
                      <PlayIcon className="w-3 h-3" />
                      {t.play || 'Play'}
                    </button>
                  )}
                </span>
              </div>
            </div>
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
