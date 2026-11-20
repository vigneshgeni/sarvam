/**
 * PageViewer — Full-screen scanned page viewer for Live Relay.
 *
 * Features:
 * - Fitted page image with pointer-event pinch-to-zoom, double-tap zoom (1x <-> 2.2x), and pan when zoomed
 * - Swipe left/right between pages when zoom === 1
 * - "Page N of M" header and Close (X) button (>= 44 px)
 * - "Discuss this page" (re-sends page image to Gemini with "(Now looking at page N)" once per open)
 * - "Delete page" with inline confirmation
 * - touch-action: none on the image viewport so gestures never fight browser scroll/zoom
 */

import React, { useState, useRef, useEffect } from 'react'
import type { CapturedPage } from './pageStack.js'

interface PageViewerProps {
  pages: CapturedPage[]
  initialIndex: number
  isGeminiConnected: boolean
  onClose: () => void
  onDiscussPage: (page: CapturedPage, pageNumber: number) => void
  onDeletePage: (pageId: string) => void
  t: Record<string, string>
}

interface Point {
  x: number
  y: number
}

const MIN_SCALE = 1
const MAX_SCALE = 4
const DOUBLE_TAP_SCALE = 2.2
const SWIPE_THRESHOLD_PX = 56

function distance(a: Point, b: Point): number {
  const dx = a.x - b.x
  const dy = a.y - b.y
  return Math.hypot(dx, dy)
}

export default function PageViewer({
  pages,
  initialIndex,
  isGeminiConnected,
  onClose,
  onDiscussPage,
  onDeletePage,
  t,
}: PageViewerProps) {
  const safeInitial = Math.max(0, Math.min(pages.length - 1, initialIndex))
  const [currentIndex, setCurrentIndex] = useState(safeInitial)
  const [scale, setScale] = useState(1)
  const [translate, setTranslate] = useState<Point>({ x: 0, y: 0 })
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [discussedIds, setDiscussedIds] = useState<Record<string, boolean>>({})

  // Pointer tracking for pinch / pan / swipe / double-tap
  const pointersRef = useRef<Map<number, Point>>(new Map())
  const pinchStartDistRef = useRef<number | null>(null)
  const pinchStartScaleRef = useRef<number>(1)
  const dragStartRef = useRef<{ x: number; y: number; tx: number; ty: number; t: number } | null>(null)
  const lastTapRef = useRef<{ t: number; x: number; y: number } | null>(null)

  // Clamp index if pages array shrinks after a delete
  useEffect(() => {
    if (pages.length === 0) {
      onClose()
      return
    }
    if (currentIndex >= pages.length) {
      setCurrentIndex(pages.length - 1)
    }
  }, [pages.length, currentIndex, onClose])

  // Reset zoom/pan and delete confirm when switching pages
  useEffect(() => {
    setScale(1)
    setTranslate({ x: 0, y: 0 })
    setConfirmDelete(false)
  }, [currentIndex])

  // Keyboard navigation: Escape closes, Left/Right switches pages
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        e.stopPropagation()
        if (confirmDelete) {
          setConfirmDelete(false)
        } else {
          onClose()
        }
      } else if (e.key === 'ArrowLeft' && currentIndex > 0) {
        e.preventDefault()
        setCurrentIndex((i) => Math.max(0, i - 1))
      } else if (e.key === 'ArrowRight' && currentIndex < pages.length - 1) {
        e.preventDefault()
        setCurrentIndex((i) => Math.min(pages.length - 1, i + 1))
      }
    }
    window.addEventListener('keydown', onKeyDown, true)
    return () => window.removeEventListener('keydown', onKeyDown, true)
  }, [confirmDelete, currentIndex, onClose, pages.length])

  if (pages.length === 0) return null

  const currentPage = pages[Math.min(currentIndex, pages.length - 1)]
  const pageNumber = Math.min(currentIndex, pages.length - 1) + 1
  const alreadyDiscussed = Boolean(discussedIds[currentPage.id])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2) {
      const pts = Array.from(pointersRef.current.values())
      pinchStartDistRef.current = distance(pts[0], pts[1])
      pinchStartScaleRef.current = scale
      dragStartRef.current = null
    } else if (pointersRef.current.size === 1) {
      dragStartRef.current = {
        x: e.clientX,
        y: e.clientY,
        tx: translate.x,
        ty: translate.y,
        t: Date.now(),
      }
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!pointersRef.current.has(e.pointerId)) return
    pointersRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY })

    if (pointersRef.current.size === 2 && pinchStartDistRef.current && pinchStartDistRef.current > 0) {
      const pts = Array.from(pointersRef.current.values())
      const curDist = distance(pts[0], pts[1])
      const nextScale = Math.max(
        MIN_SCALE,
        Math.min(MAX_SCALE, pinchStartScaleRef.current * (curDist / pinchStartDistRef.current)),
      )
      setScale(nextScale)
      if (nextScale <= 1.02) {
        setTranslate({ x: 0, y: 0 })
      }
      return
    }

    if (pointersRef.current.size === 1 && dragStartRef.current && scale > 1.02) {
      const dx = e.clientX - dragStartRef.current.x
      const dy = e.clientY - dragStartRef.current.y
      const maxOffset = 220 * (scale - 1)
      setTranslate({
        x: Math.max(-maxOffset, Math.min(maxOffset, dragStartRef.current.tx + dx)),
        y: Math.max(-maxOffset, Math.min(maxOffset, dragStartRef.current.ty + dy)),
      })
    }
  }

  const handlePointerUpOrCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    const start = dragStartRef.current
    const wasSingle = pointersRef.current.size === 1
    pointersRef.current.delete(e.pointerId)
    if (pointersRef.current.size < 2) {
      pinchStartDistRef.current = null
    }
    if (!wasSingle || !start) return
    dragStartRef.current = null

    const dx = e.clientX - start.x
    const dy = e.clientY - start.y
    const dt = Date.now() - start.t

    // Horizontal swipe between pages when not zoomed in
    if (scale <= 1.05 && Math.abs(dx) >= SWIPE_THRESHOLD_PX && Math.abs(dx) > Math.abs(dy) * 1.2) {
      if (dx < 0 && currentIndex < pages.length - 1) {
        setCurrentIndex((i) => Math.min(pages.length - 1, i + 1))
      } else if (dx > 0 && currentIndex > 0) {
        setCurrentIndex((i) => Math.max(0, i - 1))
      }
      lastTapRef.current = null
      return
    }

    // Double-tap to toggle zoom
    if (Math.hypot(dx, dy) < 14 && dt < 300) {
      const now = Date.now()
      const prev = lastTapRef.current
      if (prev && now - prev.t < 320 && Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < 36) {
        if (scale > 1.1) {
          setScale(1)
          setTranslate({ x: 0, y: 0 })
        } else {
          setScale(DOUBLE_TAP_SCALE)
          setTranslate({ x: 0, y: 0 })
        }
        lastTapRef.current = null
      } else {
        lastTapRef.current = { t: now, x: e.clientX, y: e.clientY }
      }
    }
  }

  const handleDiscuss = () => {
    if (alreadyDiscussed) return
    setDiscussedIds((prev) => ({ ...prev, [currentPage.id]: true }))
    onDiscussPage(currentPage, pageNumber)
  }

  const handleConfirmDelete = () => {
    setConfirmDelete(false)
    onDeletePage(currentPage.id)
  }

  const counterLabel = (t.relayPageOfTotal || 'Page {n} of {total}')
    .replace('{n}', String(pageNumber))
    .replace('{total}', String(pages.length))

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={counterLabel}
      data-testid="relay-page-viewer"
      data-page-index={pageNumber}
      style={{
        position: 'absolute',
        inset: 0,
        zIndex: 80,
        background: '#0E0E0E',
        color: '#F5F4F2',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'DM Sans, system-ui, sans-serif',
        userSelect: 'none',
        WebkitUserSelect: 'none',
      }}
    >
      {/* Top Bar */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: 'max(12px, env(safe-area-inset-top, 12px)) 16px 10px',
          background: 'rgba(14, 14, 14, 0.92)',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <span
          data-testid="page-viewer-counter"
          style={{
            fontSize: 16,
            fontWeight: 700,
            color: '#F5F4F2',
          }}
        >
          {counterLabel}
        </span>

        <button
          type="button"
          data-testid="page-viewer-close"
          onClick={onClose}
          aria-label={t.close || 'Close'}
          style={{
            width: 44,
            height: 44,
            borderRadius: 22,
            border: 0,
            background: 'rgba(255,255,255,0.14)',
            color: '#F5F4F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.4}>
            <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
          </svg>
        </button>
      </div>

      {/* Image Viewport (pinch / double-tap / swipe) */}
      <div
        data-testid="page-viewer-stage"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUpOrCancel}
        onPointerCancel={handlePointerUpOrCancel}
        style={{
          flex: 1,
          minHeight: 0,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          touchAction: 'none',
          background: '#080808',
        }}
      >
        <img
          src={currentPage.dataUrl}
          alt={counterLabel}
          draggable={false}
          data-testid="page-viewer-image"
          style={{
            maxWidth: '100%',
            maxHeight: '100%',
            objectFit: 'contain',
            transform: `translate3d(${translate.x}px, ${translate.y}px, 0) scale(${scale})`,
            transition: pointersRef.current.size === 0 ? 'transform 160ms ease-out' : 'none',
            pointerEvents: 'none',
          }}
        />

        {/* Prev / Next touch buttons for accessibility & easy navigation */}
        {currentIndex > 0 && (
          <button
            type="button"
            data-testid="page-viewer-prev"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCurrentIndex((i) => Math.max(0, i - 1))}
            aria-label={t.relayPreviousPage || 'Previous page'}
            style={{
              position: 'absolute',
              left: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: 22,
              border: 0,
              background: 'rgba(14,14,14,0.68)',
              color: '#F5F4F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="M15 5l-7 7 7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {currentIndex < pages.length - 1 && (
          <button
            type="button"
            data-testid="page-viewer-next"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => setCurrentIndex((i) => Math.min(pages.length - 1, i + 1))}
            aria-label={t.relayNextPage || 'Next page'}
            style={{
              position: 'absolute',
              right: 10,
              top: '50%',
              transform: 'translateY(-50%)',
              width: 44,
              height: 44,
              borderRadius: 22,
              border: 0,
              background: 'rgba(14,14,14,0.68)',
              color: '#F5F4F2',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
            }}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2.4}>
              <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </button>
        )}

        {/* Delete confirmation inline dialog */}
        {confirmDelete && (
          <div
            role="alertdialog"
            aria-modal="true"
            data-testid="page-viewer-delete-confirm"
            onPointerDown={(e) => e.stopPropagation()}
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(14,14,14,0.82)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: 24,
              zIndex: 10,
            }}
          >
            <div
              style={{
                width: '100%',
                maxWidth: 320,
                background: '#F4F5F2',
                color: '#1B1B1B',
                borderRadius: 24,
                border: '2px solid #1B1B1B',
                padding: 20,
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div style={{ fontFamily: 'Fraunces, Georgia, serif', fontSize: 20, fontWeight: 600 }}>
                {t.relayDeletePageTitle || 'Delete this page?'}
              </div>
              <div style={{ fontSize: 14, color: '#3D3B37' }}>
                {t.relayDeletePageBody || 'This removes the page from your scanned stack.'}
              </div>
              <div style={{ display: 'flex', gap: 10, marginTop: 4 }}>
                <button
                  type="button"
                  onClick={() => setConfirmDelete(false)}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 999,
                    border: '1.5px solid #1B1B1B',
                    background: 'transparent',
                    color: '#1B1B1B',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {t.cancel || 'Cancel'}
                </button>
                <button
                  type="button"
                  data-testid="page-viewer-delete-yes"
                  onClick={handleConfirmDelete}
                  style={{
                    flex: 1,
                    minHeight: 44,
                    borderRadius: 999,
                    border: 0,
                    background: '#E5533D',
                    color: '#F5F4F2',
                    fontWeight: 700,
                    fontSize: 14,
                    cursor: 'pointer',
                  }}
                >
                  {t.relayDeletePage || 'Delete page'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Footer Actions */}
      <div
        style={{
          flex: 'none',
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '12px 16px max(18px, env(safe-area-inset-bottom, 18px))',
          background: 'rgba(14, 14, 14, 0.94)',
          borderTop: '1px solid rgba(255,255,255,0.1)',
        }}
      >
        <button
          type="button"
          data-testid="page-viewer-discuss"
          onClick={handleDiscuss}
          disabled={!isGeminiConnected || alreadyDiscussed}
          style={{
            flex: 1,
            minHeight: 48,
            padding: '0 16px',
            borderRadius: 999,
            border: 0,
            background: alreadyDiscussed ? '#214D47' : '#E3B660',
            color: alreadyDiscussed ? '#F5F4F2' : '#1B1B1B',
            fontSize: 15,
            fontWeight: 700,
            cursor: !isGeminiConnected || alreadyDiscussed ? 'default' : 'pointer',
            opacity: !isGeminiConnected ? 0.5 : 1,
          }}
        >
          {alreadyDiscussed
            ? t.relayPageSentToGemini || 'Sent to Gemini'
            : t.relayDiscussPage || 'Discuss this page'}
        </button>

        <button
          type="button"
          data-testid="page-viewer-delete"
          onClick={() => setConfirmDelete(true)}
          aria-label={t.relayDeletePage || 'Delete page'}
          style={{
            minHeight: 48,
            padding: '0 16px',
            borderRadius: 999,
            border: '1.5px solid rgba(229, 83, 61, 0.7)',
            background: 'rgba(229, 83, 61, 0.14)',
            color: '#F5F4F2',
            fontSize: 14,
            fontWeight: 700,
            cursor: 'pointer',
          }}
        >
          {t.relayDeletePage || 'Delete page'}
        </button>
      </div>
    </div>
  )
}
