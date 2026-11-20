/**
 * LiveSheet — 3-detent collapsible Gemini Live bottom sheet over CameraScreen.
 *
 * Detents:
 * - collapsed (72 px bar): orb, status text, mic button, Add page button, End
 * - half (~360 px): horizontal scrollable pages strip + last few caption bubbles + input bar
 * - full (~82% height): horizontal pages strip + full scrollable transcript + input bar
 *
 * Interactions:
 * - Drag handle AND header area are draggable via Pointer Events (touch-action: none,
 *   no text selection while dragging, momentum snap with 250 ms ease).
 * - Tapping handle cycles collapsed -> half -> full -> collapsed.
 * - Keyboard: Enter/Space on handle cycles detents, Escape collapses; aria-expanded reflects open state.
 */

import React, { useState, useRef, useEffect } from 'react'
import type { CaptionTurn } from './RelaySpikeScreen.js'
import type { CapturedPage } from './pageStack.js'
import {
  clampSheetHeight,
  cycleSheetDetent,
  getDetentHeights,
  handleSheetKeyAction,
  resolveSheetDragEnd,
  SHEET_COLLAPSED_HEIGHT,
  type SheetDetent,
} from './sheetDetents.js'

interface LiveSheetProps {
  isOpen: boolean
  detent?: SheetDetent
  onDetentChange?: (detent: SheetDetent) => void
  isLive: boolean
  isSpeaking: boolean
  isThinking?: boolean
  isReconnecting: boolean
  isUsingFallback?: boolean
  fallbackModelName?: string
  captions: CaptionTurn[]
  pages?: CapturedPage[]
  selectedPageId?: string | null
  onOpenPage?: (index: number) => void
  onAddPage?: () => void
  canAddPage?: boolean
  showSoundBanner?: boolean
  onEnableSound?: () => void
  errorMsg?: string
  langLabel?: string
  t?: Record<string, string>
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
  detent: controlledDetent,
  onDetentChange,
  isLive,
  isSpeaking,
  isThinking = false,
  isReconnecting,
  isUsingFallback,
  fallbackModelName,
  captions,
  pages = [],
  selectedPageId = null,
  onOpenPage,
  onAddPage,
  canAddPage = true,
  showSoundBanner = false,
  onEnableSound,
  errorMsg,
  langLabel = 'தமிழ் / EN',
  t = {},
  onSendText,
  onEnd,
  onToggleMic,
  onToggleMicMode,
  isMuted,
  micMode = 'vad',
  isHoldingTalk,
  onHoldTalkStart,
  onHoldTalkEnd,
}: LiveSheetProps) {
  const [internalDetent, setInternalDetent] = useState<SheetDetent>('half')
  const detent = controlledDetent ?? internalDetent

  const setDetent = (next: SheetDetent) => {
    if (controlledDetent === undefined) {
      setInternalDetent(next)
    }
    onDetentChange?.(next)
  }

  const [inputText, setInputText] = useState('')
  const [viewportHeight, setViewportHeight] = useState<number>(() =>
    typeof window !== 'undefined' ? window.innerHeight : 844,
  )
  const [draggingHeight, setDraggingHeight] = useState<number | null>(null)

  const chatEndRef = useRef<HTMLDivElement | null>(null)
  const pagesStripRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef<{
    pointerId: number
    startY: number
    startHeight: number
    startDetent: SheetDetent
    lastY: number
    lastT: number
    velocityY: number
    moved: boolean
  } | null>(null)

  useEffect(() => {
    const onResize = () => setViewportHeight(window.innerHeight)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (detent !== 'collapsed') {
      chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
    }
  }, [captions, detent])

  // Auto-scroll pages strip to newest page when pages are appended
  useEffect(() => {
    if (pagesStripRef.current && pages.length > 0) {
      pagesStripRef.current.scrollLeft = pagesStripRef.current.scrollWidth
    }
  }, [pages.length])

  const heights = getDetentHeights(viewportHeight)
  const currentHeight = draggingHeight !== null ? draggingHeight : heights[detent]
  const isDragging = draggingHeight !== null
  const isCollapsed = detent === 'collapsed' && !isDragging

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = inputText.trim()
    if (!trimmed) return
    onSendText(trimmed)
    setInputText('')
  }

  // Pointer drag handlers shared by drag handle & header bar
  const onDragPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    // Ignore drags starting on interactive buttons inside the header (except the handle button itself)
    const target = e.target as HTMLElement | null
    if (target && target.closest('button') && !target.closest('[data-sheet-handle="true"]')) {
      return
    }
    try {
      e.currentTarget.setPointerCapture(e.pointerId)
    } catch {
      // Synthetic pointer events in tests may not support capture
    }
    const startH = heights[detent]
    dragRef.current = {
      pointerId: e.pointerId,
      startY: e.clientY,
      startHeight: startH,
      startDetent: detent,
      lastY: e.clientY,
      lastT: performance.now(),
      velocityY: 0,
      moved: false,
    }
  }

  const onDragPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    const dy = e.clientY - drag.startY
    if (Math.abs(dy) > 6) {
      drag.moved = true
    }
    if (!drag.moved) return
    const now = performance.now()
    const dt = Math.max(1, now - drag.lastT)
    drag.velocityY = (e.clientY - drag.lastY) / dt
    drag.lastY = e.clientY
    drag.lastT = now

    const nextHeight = clampSheetHeight(drag.startHeight - dy, viewportHeight)
    setDraggingHeight(nextHeight)
  }

  const onDragPointerEnd = (e: React.PointerEvent<HTMLElement>) => {
    const drag = dragRef.current
    if (!drag || drag.pointerId !== e.pointerId) return
    dragRef.current = null
    if (!drag.moved) {
      setDraggingHeight(null)
      return
    }
    const finalHeight = clampSheetHeight(drag.startHeight - (e.clientY - drag.startY), viewportHeight)
    const snapped = resolveSheetDragEnd({
      startDetent: drag.startDetent,
      startHeight: drag.startHeight,
      currentHeight: finalHeight,
      velocityY: drag.velocityY,
      viewportHeight,
    })
    setDraggingHeight(null)
    setDetent(snapped)
  }

  const handleHandleClick = () => {
    // Click fires after pointerup when there was no drag movement
    setDetent(cycleSheetDetent(detent))
  }

  const handleHandleKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>) => {
    const next = handleSheetKeyAction(detent, e.key)
    if (next) {
      e.preventDefault()
      setDetent(next)
    }
  }

  if (!isOpen) return null

  const statusText = isReconnecting
    ? t.relayStatusReconnecting || 'Reconnecting…'
    : isSpeaking
      ? t.relayOrbSpeaking || 'Speaking'
      : isThinking
        ? t.relayOrbThinking || 'Thinking…'
        : isLive
          ? t.relayOrbListening || 'Listening'
          : t.relayStatusConnecting || 'Connecting…'

  const shownCaptions = detent === 'half' ? captions.slice(-4) : captions
  const newestId = selectedPageId || (pages.length > 0 ? pages[pages.length - 1].id : null)

  return (
    <div
      data-testid="relay-live-sheet"
      data-detent={detent}
      style={{
        position: 'absolute',
        left: 0,
        right: 0,
        bottom: 0,
        height: `${isCollapsed ? SHEET_COLLAPSED_HEIGHT : currentHeight}px`,
        zIndex: 50,
        background: '#1B1B1B',
        color: '#F5F4F2',
        borderTopLeftRadius: isCollapsed ? 22 : 28,
        borderTopRightRadius: isCollapsed ? 22 : 28,
        boxShadow: '0 -10px 30px rgba(0,0,0,0.45)',
        borderTop: '1px solid rgba(255,255,255,0.12)',
        display: 'flex',
        flexDirection: 'column',
        transition: isDragging ? 'none' : 'height 250ms ease, border-radius 250ms ease',
        fontFamily: 'DM Sans, system-ui, sans-serif',
        userSelect: isDragging ? 'none' : undefined,
        WebkitUserSelect: isDragging ? 'none' : undefined,
        overflow: 'hidden',
      }}
    >
      {/* Draggable Handle + Header Zone */}
      <div
        data-testid="relay-sheet-drag-zone"
        onPointerDown={onDragPointerDown}
        onPointerMove={onDragPointerMove}
        onPointerUp={onDragPointerEnd}
        onPointerCancel={onDragPointerEnd}
        style={{
          flex: 'none',
          touchAction: 'none',
          userSelect: 'none',
          WebkitUserSelect: 'none',
        }}
      >
        {/* Drag Handle Pill */}
        <button
          type="button"
          data-sheet-handle="true"
          data-testid="relay-sheet-handle"
          onClick={handleHandleClick}
          onKeyDown={handleHandleKeyDown}
          aria-expanded={detent !== 'collapsed'}
          aria-label={
            detent === 'collapsed'
              ? t.relayExpandSheet || 'Expand Gemini Live sheet'
              : t.relayCollapseSheet || 'Resize Gemini Live sheet'
          }
          style={{
            width: '100%',
            minHeight: isCollapsed ? 18 : 34,
            border: 0,
            background: 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'grab',
            padding: 0,
            touchAction: 'none',
          }}
        >
          <span
            style={{
              width: 40,
              height: 4,
              borderRadius: 3,
              background: 'rgba(255,255,255,0.38)',
            }}
          />
        </button>

        {/* Collapsed 72 px Compact Bar */}
        {isCollapsed ? (
          <div
            data-testid="relay-sheet-collapsed-bar"
            style={{
              height: 54,
              padding: '0 12px 6px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 8,
            }}
          >
            {/* Orb + Status */}
            <button
              type="button"
              onClick={() => setDetent('half')}
              aria-label={t.relayExpandSheet || 'Expand Gemini Live sheet'}
              style={{
                flex: 1,
                minWidth: 0,
                minHeight: 44,
                border: 0,
                background: 'transparent',
                color: '#F5F4F2',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                cursor: 'pointer',
                textAlign: 'left',
                padding: 0,
              }}
            >
              <span
                data-testid="sheet-speaking-indicator"
                data-playing={isSpeaking ? 'true' : 'false'}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 16,
                  flex: 'none',
                  background: isSpeaking ? '#E3B660' : isThinking ? '#C96846' : '#214D47',
                  color: isSpeaking ? '#1B1B1B' : '#F5F4F2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  boxShadow: isSpeaking ? '0 0 0 4px rgba(227,182,96,0.28)' : 'none',
                  transition: 'background 180ms ease, box-shadow 180ms ease',
                }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
                  <path
                    d="M12 2c.6 5.2 4.8 9.4 10 10-5.2.6-9.4 4.8-10 10-.6-5.2-4.8-9.4-10-10 5.2-.6 9.4-4.8 10-10z"
                    fill="currentColor"
                  />
                </svg>
              </span>
              <span
                style={{
                  fontSize: 13.5,
                  fontWeight: 700,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
              >
                {statusText}
              </span>
            </button>

            {/* Mic button */}
            {onToggleMic && (
              <button
                type="button"
                onClick={onToggleMic}
                aria-label={isMuted ? t.relayUnmuteMic || 'Unmute microphone' : t.relayMuteMic || 'Mute microphone'}
                aria-pressed={isMuted}
                style={{
                  width: 44,
                  height: 44,
                  borderRadius: 22,
                  border: 0,
                  background: isMuted ? '#E5533D' : 'rgba(255,255,255,0.14)',
                  color: '#F5F4F2',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  cursor: 'pointer',
                  flex: 'none',
                }}
              >
                <svg viewBox="0 0 24 24" width={19} height={19} fill="none" stroke="currentColor" strokeWidth={2}>
                  <rect x="9" y="3" width="6" height="11" rx="3" />
                  <path d="M5 11a7 7 0 0 0 14 0M12 18v3" />
                  {isMuted && <path d="M4 4l16 16" />}
                </svg>
              </button>
            )}

            {/* Add page button (camera + plus) */}
            {onAddPage && (
              <button
                type="button"
                data-testid="sheet-add-page-btn"
                onClick={onAddPage}
                disabled={!canAddPage}
                aria-label={t.relayAddPage || 'Add page'}
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
                  cursor: canAddPage ? 'pointer' : 'not-allowed',
                  opacity: canAddPage ? 1 : 0.45,
                  flex: 'none',
                }}
              >
                <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.2}>
                  <path d="M4 8a2 2 0 0 1 2-2h2l1.5-2h5L16 6h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8z" />
                  <path d="M12 10v6M9 13h6" strokeLinecap="round" />
                </svg>
              </button>
            )}

            {/* End button */}
            <button
              type="button"
              onClick={onEnd}
              aria-label={t.relayEnd || 'End'}
              style={{
                height: 44,
                padding: '0 14px',
                borderRadius: 22,
                border: 0,
                background: '#E5533D',
                color: '#F5F4F2',
                fontWeight: 700,
                fontSize: 13.5,
                cursor: 'pointer',
                flex: 'none',
              }}
            >
              {t.relayEnd || 'End'}
            </button>
          </div>
        ) : (
          /* Half / Full Header Bar */
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 16px 8px',
              gap: 8,
            }}
          >
            {/* Playback-driven speaking indicator + status */}
            <div
              data-testid="sheet-speaking-indicator"
              data-playing={isSpeaking ? 'true' : 'false'}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 13.5, fontWeight: 700, minWidth: 0 }}
            >
              <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center', height: 16, flex: 'none' }}>
                <span
                  style={{
                    width: 3,
                    height: 16,
                    borderRadius: 2,
                    background: isSpeaking ? '#E3B660' : '#D3E5E0',
                    animation: isSpeaking ? 'sv-wave 0.8s ease-in-out infinite' : 'none',
                    transform: isSpeaking ? undefined : 'scaleY(0.4)',
                  }}
                />
                <span
                  style={{
                    width: 3,
                    height: 16,
                    borderRadius: 2,
                    background: isSpeaking ? '#E3B660' : '#D3E5E0',
                    animation: isSpeaking ? 'sv-wave 0.8s ease-in-out 0.2s infinite' : 'none',
                    transform: isSpeaking ? undefined : 'scaleY(0.4)',
                  }}
                />
                <span
                  style={{
                    width: 3,
                    height: 16,
                    borderRadius: 2,
                    background: isSpeaking ? '#E3B660' : '#D3E5E0',
                    animation: isSpeaking ? 'sv-wave 0.8s ease-in-out 0.4s infinite' : 'none',
                    transform: isSpeaking ? undefined : 'scaleY(0.4)',
                  }}
                />
              </span>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {`Gemini Live · ${statusText}`}
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6, flex: 'none' }}>
              {onAddPage && (
                <button
                  type="button"
                  data-testid="sheet-add-page-btn"
                  onClick={onAddPage}
                  disabled={!canAddPage}
                  aria-label={t.relayAddPage || 'Add page'}
                  style={{
                    minHeight: 44,
                    padding: '0 12px',
                    borderRadius: 999,
                    border: 0,
                    background: '#E3B660',
                    color: '#1B1B1B',
                    fontSize: 12.5,
                    fontWeight: 700,
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 5,
                    cursor: canAddPage ? 'pointer' : 'not-allowed',
                    opacity: canAddPage ? 1 : 0.45,
                  }}
                >
                  <svg viewBox="0 0 24 24" width={15} height={15} fill="none" stroke="currentColor" strokeWidth={2.4}>
                    <path d="M12 5v14M5 12h14" strokeLinecap="round" />
                  </svg>
                  {t.relayAddPage || 'Add page'}
                </button>
              )}

              {onToggleMicMode && (
                <button
                  type="button"
                  onClick={onToggleMicMode}
                  aria-label={`Switch to ${micMode === 'vad' ? 'Hold to Talk' : 'Open Mic'}`}
                  style={{
                    minHeight: 44,
                    minWidth: 44,
                    fontSize: 11.5,
                    fontWeight: 700,
                    padding: '0 10px',
                    borderRadius: 22,
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
                  fontSize: 11.5,
                  fontWeight: 700,
                  padding: '4px 8px',
                  borderRadius: 12,
                  background: 'rgba(255,255,255,0.12)',
                }}
              >
                {langLabel}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Body (visible in half & full detents) */}
      {!isCollapsed && (
        <>
          {/* Tap to turn on sound banner */}
          {showSoundBanner && onEnableSound && (
            <button
              type="button"
              data-testid="relay-sound-banner-sheet"
              onClick={onEnableSound}
              style={{
                flex: 'none',
                margin: '0 16px 6px',
                minHeight: 44,
                padding: '6px 12px',
                borderRadius: 12,
                background: '#E3B660',
                color: '#1B1B1B',
                border: 0,
                fontSize: 13,
                fontWeight: 700,
                cursor: 'pointer',
                textAlign: 'center',
              }}
            >
              {t.relayTapToTurnOnSound || 'Tap to turn on sound'}
            </button>
          )}

          {/* Horizontal Scanned Pages Strip */}
          {pages.length > 0 && (
            <div
              ref={pagesStripRef}
              data-testid="sheet-pages-strip"
              style={{
                flex: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                overflowX: 'auto',
                padding: '2px 16px 10px',
                borderBottom: '1px solid rgba(255,255,255,0.08)',
              }}
            >
              {pages.map((p, idx) => {
                const isSelected = p.id === newestId
                const pageNum = idx + 1
                return (
                  <button
                    key={p.id}
                    type="button"
                    data-testid={`sheet-page-thumb-${pageNum}`}
                    onClick={() => onOpenPage?.(idx)}
                    aria-label={(t.relayOpenPageN || 'Open page {n}').replace('{n}', String(pageNum))}
                    style={{
                      position: 'relative',
                      width: 48,
                      height: 60,
                      padding: 0,
                      borderRadius: 8,
                      border: isSelected ? '2px solid #E3B660' : '1.5px solid rgba(255,255,255,0.28)',
                      background: '#111',
                      overflow: 'hidden',
                      flex: 'none',
                      cursor: 'pointer',
                    }}
                  >
                    <img
                      src={p.dataUrl}
                      alt=""
                      style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    />
                    <span
                      style={{
                        position: 'absolute',
                        right: 2,
                        bottom: 2,
                        minWidth: 18,
                        height: 18,
                        padding: '0 4px',
                        borderRadius: 9,
                        background: isSelected ? '#E3B660' : 'rgba(27,27,27,0.85)',
                        color: isSelected ? '#1B1B1B' : '#F5F4F2',
                        fontSize: 10.5,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {pageNum}
                    </span>
                  </button>
                )
              })}
            </div>
          )}

          {/* Fallback note */}
          {isUsingFallback && (
            <div
              style={{
                flex: 'none',
                margin: '6px 16px 4px',
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

          {/* Error / Audio Help note */}
          {errorMsg && (
            <div
              style={{
                flex: 'none',
                margin: '6px 16px 4px',
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
            data-testid="sheet-captions-list"
            style={{
              flex: 1,
              minHeight: 0,
              overflowY: 'auto',
              padding: '8px 16px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
            }}
          >
            {shownCaptions.length === 0 ? (
              <div style={{ marginTop: 'auto', marginBottom: 'auto', textAlign: 'center', opacity: 0.65, fontSize: 13.5, display: 'flex', flexDirection: 'column', gap: 6 }}>
                <span>{t.relaySpeakHint || 'Speak now — Gemini sees what you show.'}</span>
                <span style={{ fontSize: 12, opacity: 0.78 }}>
                  {t.relayNoSoundHelp || 'No sound? Check the ring/silent switch and the volume.'}
                </span>
              </div>
            ) : (
              shownCaptions.map((turn) => {
                const isGemini = turn.who === 'Gemini'
                const isUser = turn.who === 'You'
                return (
                  <div
                    key={turn.id}
                    data-testid="sheet-caption-bubble"
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
              padding: '8px 16px max(16px, env(safe-area-inset-bottom, 16px))',
              background: 'rgba(15, 15, 15, 0.85)',
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
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
                {isHoldingTalk ? 'Listening… (Release to stop)' : 'Hold to talk'}
              </button>
            )}

            <form onSubmit={handleSend} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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

              <input
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                placeholder={t.relayTypeQuestion || 'Type a question…'}
                aria-label={t.relayTypeQuestion || 'Type message to Gemini Live'}
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
                  aria-label={t.relayEnd || 'End session'}
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
                  {t.relayEnd || 'End'}
                </button>
              )}
            </form>
          </div>
        </>
      )}
    </div>
  )
}
