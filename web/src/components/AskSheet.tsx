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
  EyeIcon,
  AlertTriangleIcon,
} from './icons'
import { askDocument } from '../api'

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
  const [answerData, setAnswerData] = useState<AskResponse | null>(null)
  const [askError, setAskError] = useState<string | null>(null)

  const recognitionRef = useRef<any>(null)
  const silenceTimerRef = useRef<number | null>(null)

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
      const langSpeechCodes: Record<string, string> = {
        ta: 'ta-IN',
        hi: 'hi-IN',
        en: 'en-IN',
        te: 'te-IN',
        ml: 'ml-IN',
        kn: 'kn-IN',
      }
      recognition.lang = langSpeechCodes[lang] || 'en-IN'

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

    try {
      const resp = await askDocument({
        question: targetQ,
        lang,
        result,
        files: files && files.length > 0 ? files : undefined,
      })
      setAnswerData(resp)
    } catch (err: any) {
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
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-base font-bold text-[#15171A]">
              {t.askBtnLabel || 'Ask'}
            </h2>
            <p className="text-xs text-[#5E636B]">
              Ask anything about this document in {lang.toUpperCase()}
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#5E636B] hover:text-[#15171A] rounded-full hover:bg-[#F0F0EB] transition-colors"
            aria-label={t.close || 'Close'}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Suggestion Chips */}
        <div className="flex flex-wrap gap-1.5">
          {suggestionChips.map((chip, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => {
                setQuestion(chip)
                handleAskSubmit(chip)
              }}
              className="btn-press px-3 py-1.5 bg-[#F0F0EB] hover:bg-[#E6E6E1] text-[#15171A] text-xs font-medium rounded-full transition-colors text-left"
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
              placeholder={t.askPlaceholder || 'Ask anything about this document...'}
              className="w-full bg-[#F6F6F3] border border-[#E6E6E1] rounded-2xl pl-3.5 pr-20 py-3 text-sm text-[#15171A] placeholder-[#5E636B] focus:outline-none focus:border-[#5B52D6]"
            />

            <div className="absolute right-2 flex items-center gap-1">
              {/* Mic Button */}
              <button
                type="button"
                onClick={handleToggleMic}
                className={`p-2 rounded-xl transition-all ${
                  isListening
                    ? 'bg-[#C2410C] text-white animate-pulse'
                    : 'text-[#5E636B] hover:text-[#15171A] hover:bg-neutral-200'
                }`}
                aria-label={isListening ? 'Stop listening' : 'Start voice input'}
              >
                {isListening ? (
                  <MicOffIcon className="w-4 h-4" />
                ) : (
                  <MicIcon className="w-4 h-4" />
                )}
              </button>

              {/* Submit Button */}
              <button
                type="button"
                disabled={!question.trim() || isLoading}
                onClick={() => handleAskSubmit()}
                className="btn-press p-2 bg-[#5B52D6] disabled:opacity-40 text-white rounded-xl shadow-sm hover:bg-[#483EB8] transition-colors"
                aria-label="Send question"
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

        {/* Answer Display Card */}
        {answerData && (
          <div className="bg-[#FFFFFF] border border-[#E6E6E1] rounded-2xl p-4 flex flex-col gap-3 shadow-sm animate-card-in">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-[#5B52D6] uppercase tracking-wider">
                Answer
              </span>
              <button
                type="button"
                onClick={() => setAnswerData(null)}
                className="text-xs text-[#5E636B] hover:text-[#15171A]"
              >
                Clear
              </button>
            </div>

            {/* If answered_from === 'summary' */}
            {answerData.answered_from === 'summary' && (
              <span className="text-[11px] font-medium text-[#5E636B] bg-[#F0F0EB] px-2 py-0.5 rounded w-fit">
                {t.askAnsweredFromSummary || 'Answering from the summary'}
              </span>
            )}

            {answerData.not_found ? (
              <div className="text-sm font-medium text-[#5E636B] italic">
                {t.askNotFound || "This document doesn't say"}
              </div>
            ) : (
              <p className="text-base font-semibold text-[#15171A] leading-relaxed">
                {answerData.answer}
              </p>
            )}

            {/* Quote Block if present */}
            {answerData.quote && (
              <div className="bg-[#FBF7EF] border-l-2 border-[#5B52D6] p-2.5 rounded-r-xl flex flex-col gap-1 text-xs">
                <span className="font-semibold text-[#5E636B]">
                  From your document{answerData.page ? `, page ${answerData.page}` : ''}:
                </span>
                <p className="text-[#15171A] italic">“{answerData.quote}”</p>
              </div>
            )}

            {/* Evidence Chip & Speak Button */}
            <div className="flex items-center justify-between pt-1">
              <div>
                {answerData.evidence === 'matched' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0E5B37] bg-[#E4F3EC] px-2 py-0.5 rounded-md">
                    <CheckIcon className="w-3 h-3 text-[#0E5B37]" />
                    {t.foundInDoc || 'Found in your document'}
                  </span>
                )}
                {answerData.evidence === 'check_original' && (
                  <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md">
                    <EyeIcon className="w-3 h-3 text-[#475A7A]" />
                    {t.checkAgainstOriginal || 'Check against original'}
                  </span>
                )}
              </div>

              {!answerData.not_found && onSpeakAnswer && (
                <button
                  type="button"
                  onClick={() => onSpeakAnswer(answerData.answer)}
                  className="btn-press inline-flex items-center gap-1 px-3 py-1 bg-[#ECEBFA] text-[#5B52D6] rounded-lg text-xs font-semibold hover:bg-[#D8D4EF] transition-colors"
                >
                  <PlayIcon className="w-3.5 h-3.5" />
                  {t.listenBtnLabel || 'Listen'}
                </button>
              )}
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
