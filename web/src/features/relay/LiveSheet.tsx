/**
 * LiveSheet — Dark Gemini Live sheet over the camera/pages.
 *
 * Implements:
 * - Collapsible dark sheet (#1B1B1B, rgba(255,255,255,0.08) cards)
 * - Captions grouped by turn with aria-live="polite"
 * - Keyboard text input to talk to Gemini Live
 * - Wave animation and live state (Listening, Speaking, Reconnecting)
 * - Fallback model notice if active model is fallback
 * - End button
 */

import React, { useState, useRef, useEffect } from 'react'
import type { CaptionTurn } from './RelaySpikeScreen.js'

interface LiveSheetProps {
  isOpen: boolean
  isLive: boolean
  isSpeaking: boolean
  isReconnecting: boolean
  isUsingFallback?: boolean
  fallbackModelName?: string
  captions: CaptionTurn[]
  errorMsg?: string
  langLabel?: string
  onSendText: (text: string) => void
  onEnd: () => void
  onDismiss?: () => void
  onToggleMic?: () => void
  onToggleMicMode?: () => void
  isMuted?: boolean
  micMode?: 'vad' | 'hold'
  isHoldingTalk?: boolean
  onHoldTalkStart?: () => void
  onHoldTalkEnd?: () => void
}

export default function LiveSheet({
  isOpen,
  isLive,
  isSpeaking,
  isReconnecting,
  isUsingFallback,
  fallbackModelName,
  captions,
  errorMsg,
  langLabel = 'தமிழ் / EN',
  onSendText,
  onEnd,
  onDismiss,
  onToggleMic,
  onToggleMicMode,
  isMuted,
  micMode = 'vad',
  isHoldingTalk,
  onHoldTalkStart,
  onHoldTalkEnd,
}: LiveSheetProps) {
  const [expanded, setExpanded] = useState(false)
  const [inputText, setInputText] = useState('')
  const chatEndRef = useRef<HTMLDivElement | null>(null)

  // Auto-scroll chat to bottom
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [captions])

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setInputText('')
  }

  if (!isOpen) return null

  const sheetHeight = expanded ? 600 : 360

  return (
    <div
      data-testid="relay-live-sheet"
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `${sheetHeight}px`,
        zIndex: 50,
        background: '#1B1B1B',
        color: '#F5F4F2',
        borderTopLeftRadius: 28,
        borderTopRightRadius: 28,
        boxShadow: '0 -10px 30px rgba(0,0,0,0.4)',
        display: 'flex',
        flexDirection: 'column',
        transition: 'height 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
        fontFamily: 'DM Sans, system-ui, sans-serif',
      }}
    >
      {/* Handle */}
      <button
        type="button"
        onClick={() => setExpanded((prev) => !prev)}
        aria-expanded={expanded}
        aria-label={expanded ? 'Collapse Gemini Live sheet' : 'Expand Gemini Live sheet'}
        style={{
          flex: 'none',
          minHeight: 36,
          border: 0,
          background: 'transparent',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#F5F4F2',
          width: '100%',
        }}
      >
        <span
          style={{
            width: 40,
            height: 5,
            borderRadius: 3,
            background: 'rgba(255,255,255,0.35)',
          }}
        />
      </button>

      {/* Header Bar */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0 16px 8px',
        }}
      >
        {/* Live indicator / wave */}
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700 }}>
          <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 16 }}>
            <span
              style={{
                width: 3,
                height: 16,
                borderRadius: 2,
                background: '#E3B660',
                animation: isSpeaking ? 'sv-wave 0.8s ease-in-out infinite' : 'none',
                transform: isSpeaking ? undefined : 'scaleY(0.4)',
              }}
            />
            <span
              style={{
                width: 3,
                height: 16,
                borderRadius: 2,
                background: '#E3B660',
                animation: isSpeaking ? 'sv-wave 0.8s ease-in-out 0.2s infinite' : 'none',
                transform: isSpeaking ? undefined : 'scaleY(0.4)',
              }}
            />
            <span
              style={{
                width: 3,
                height: 16,
                borderRadius: 2,
                background: '#E3B660',
                animation: isSpeaking ? 'sv-wave 0.8s ease-in-out 0.4s infinite' : 'none',
                transform: isSpeaking ? undefined : 'scaleY(0.4)',
              }}
            />
          </span>

          <span>
            {isReconnecting
              ? 'Reconnecting…'
              : isSpeaking
                ? 'Gemini Live · speaking'
                : isLive
                  ? 'Gemini Live · listening'
                  : 'Connecting to Gemini…'}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {isReconnecting && (
            <span
              style={{
                fontSize: 11,
                fontWeight: 700,
                padding: '3px 8px',
                borderRadius: 10,
                background: '#C96846',
                color: '#1B1B1B',
              }}
            >
              Reconnecting
            </span>
          )}

          {onToggleMicMode && (
            <button
              type="button"
              onClick={onToggleMicMode}
              aria-label={`Switch to ${micMode === 'vad' ? 'Hold to Talk' : 'Open Mic'}`}
              style={{
                fontSize: 11,
                fontWeight: 600,
                padding: '4px 8px',
                borderRadius: 10,
                background: micMode === 'hold' ? '#C96846' : 'rgba(255,255,255,0.1)',
                border: '1px solid rgba(255,255,255,0.2)',
                color: '#F5F4F2',
                cursor: 'pointer',
              }}
            >
              {micMode === 'vad' ? 'VAD' : 'Hold'}
            </button>
          )}

          <span
            style={{
              fontSize: 12,
              fontWeight: 700,
              padding: '4px 10px',
              borderRadius: 12,
              background: 'rgba(255,255,255,0.12)',
            }}
          >
            {langLabel}
          </span>

          {onDismiss && (
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Close transcript"
              style={{
                width: 36,
                height: 36,
                borderRadius: 18,
                border: 0,
                background: 'rgba(255,255,255,0.12)',
                color: '#F5F4F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
              }}
            >
              <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Fallback note if applicable */}
      {isUsingFallback && (
        <div
          style={{
            flex: 'none',
            margin: '0 16px 6px',
            padding: '4px 10px',
            borderRadius: 8,
            background: 'rgba(227, 182, 96, 0.15)',
            border: '1px solid rgba(227, 182, 96, 0.4)',
            fontSize: 11.5,
            color: '#E3B660',
          }}
        >
          Using fallback model ({fallbackModelName || 'gemini-live-2.5-flash-native-audio'})
        </div>
      )}

      {/* Error note if present */}
      {errorMsg && (
        <div
          style={{
            flex: 'none',
            margin: '0 16px 6px',
            padding: '6px 10px',
            borderRadius: 8,
            background: 'rgba(229, 83, 61, 0.15)',
            border: '1px solid rgba(229, 83, 61, 0.4)',
            fontSize: 12,
            color: '#E5533D',
          }}
        >
          {errorMsg}
        </div>
      )}

      {/* Captions Turn Area (aria-live polite) */}
      <div
        aria-live="polite"
        style={{
          flex: 1,
          minHeight: 0,
          overflowY: 'auto',
          padding: '0 16px 8px',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
        }}
      >
        {captions.length === 0 ? (
          <div style={{ marginTop: 'auto', marginBottom: 'auto', textAlign: 'center', opacity: 0.45, fontSize: 14 }}>
            Ask in Tamil or English about what you see…
          </div>
        ) : (
          captions.map((turn) => {
            const isGemini = turn.who === 'Gemini'
            const isUser = turn.who === 'You'
            return (
              <div
                key={turn.id}
                style={{
                  alignSelf: isUser ? 'flex-end' : 'flex-start',
                  maxWidth: '85%',
                  padding: '9px 13px',
                  borderRadius: isUser ? '18px 18px 6px 18px' : '18px 18px 18px 6px',
                  background: isUser
                    ? 'rgba(255, 255, 255, 0.14)'
                    : isGemini
                      ? 'rgba(227, 182, 96, 0.12)'
                      : 'rgba(255, 255, 255, 0.08)',
                  border: isGemini ? '1px solid rgba(227, 182, 96, 0.25)' : undefined,
                  fontSize: 14.5,
                  lineHeight: 1.5,
                }}
              >
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    marginBottom: 2,
                    color: isGemini ? '#E3B660' : isUser ? '#D3E5E0' : '#C96846',
                  }}
                >
                  {turn.who} {!turn.isComplete && '•'}
                </div>
                <div style={{ wordBreak: 'break-word' }}>{turn.text || '…'}</div>
              </div>
            )
          })
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Bottom Bar: Mic + Input + End */}
      <div
        style={{
          flex: 'none',
          padding: '8px 16px 18px',
          background: 'rgba(15, 15, 15, 0.85)',
          display: 'flex',
          flexDirection: 'column',
          gap: 8,
        }}
      >
        {/* Hold to talk button if in hold mode */}
        {micMode === 'hold' && (
          <button
            type="button"
            onPointerDown={onHoldTalkStart}
            onPointerUp={onHoldTalkEnd}
            onPointerLeave={onHoldTalkEnd}
            onTouchStart={(e) => {
              e.preventDefault()
              onHoldTalkStart?.()
            }}
            onTouchEnd={(e) => {
              e.preventDefault()
              onHoldTalkEnd?.()
            }}
            aria-label="Hold to talk"
            aria-pressed={isHoldingTalk}
            style={{
              width: '100%',
              minHeight: 48,
              borderRadius: 16,
              border: 'none',
              background: isHoldingTalk ? '#E5533D' : '#C96846',
              color: '#F5F4F2',
              fontWeight: 700,
              fontSize: 15,
              cursor: 'pointer',
              userSelect: 'none',
              WebkitUserSelect: 'none',
            }}
          >
            {isHoldingTalk ? '🔴 Listening… (Release to stop)' : '🎙️ Hold to Talk'}
          </button>
        )}

        {/* Text Input Row + Action Buttons */}
        <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Mute button (for VAD mode) */}
          {micMode === 'vad' && onToggleMic && (
            <button
              type="button"
              onClick={onToggleMic}
              aria-label={isMuted ? 'Unmute microphone' : 'Mute microphone'}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                border: 0,
                background: isMuted ? '#E5533D' : 'rgba(255,255,255,0.15)',
                color: '#F5F4F2',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2}>
                <rect x="9" y="3" width="6" height="11" rx="3" />
                <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                {isMuted && <path d="M4 4l16 16" />}
              </svg>
            </button>
          )}

          {/* Text Input */}
          <input
            type="text"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            placeholder="Type a question…"
            aria-label="Type message to Gemini Live"
            style={{
              flex: 1,
              height: 44,
              padding: '0 14px',
              borderRadius: 22,
              background: 'rgba(255,255,255,0.1)',
              border: '1px solid rgba(255,255,255,0.2)',
              color: '#F5F4F2',
              fontSize: 14,
              outline: 'none',
            }}
          />

          {/* Send text button */}
          {inputText.trim() ? (
            <button
              type="submit"
              aria-label="Send message"
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                border: 0,
                background: '#E3B660',
                color: '#1B1B1B',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                fontWeight: 700,
                flex: 'none',
              }}
            >
              <svg viewBox="0 0 24 24" width={18} height={18} fill="none" stroke="currentColor" strokeWidth={2.4}>
                <path d="M5 12h14M12 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={onEnd}
              aria-label="End session"
              style={{
                height: 44,
                padding: '0 16px',
                borderRadius: 22,
                border: 0,
                background: '#E5533D',
                color: '#F5F4F2',
                fontWeight: 700,
                fontSize: 14,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              End
            </button>
          )}
        </form>
      </div>
    </div>
  )
}
