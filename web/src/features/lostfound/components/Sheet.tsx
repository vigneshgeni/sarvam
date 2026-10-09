import React, { useEffect, useRef, useState } from 'react'

interface SheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  ariaLabel?: string
  children: React.ReactNode
  full?: boolean
}

/** Own copy of the shared Sheet (do not import web/src/components/Sheet). */
export default function Sheet({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  full = false,
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const touchStartYRef = useRef<number>(0)
  const currentTranslateYRef = useRef<number>(0)
  const [dragOffset, setDragOffset] = useState(0)

  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      document.body.style.overflow = 'hidden'
    } else {
      document.body.style.overflow = ''
      if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
        previousFocusRef.current.focus()
      }
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else if (document.activeElement === last) {
          e.preventDefault()
          first.focus()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  useEffect(() => {
    if (isOpen && sheetRef.current) {
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )
      if (focusables.length > 0) focusables[0].focus()
      else sheetRef.current.focus()
    }
  }, [isOpen])

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY
  }
  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - touchStartYRef.current
    if (deltaY > 0) {
      currentTranslateYRef.current = deltaY
      setDragOffset(deltaY)
    }
  }
  const handleTouchEnd = () => {
    if (currentTranslateYRef.current > 75) onClose()
    currentTranslateYRef.current = 0
    setDragOffset(0)
  }

  if (!isOpen) return null

  return (
    <div className="lf-sheet-wrap" role="dialog" aria-modal="true" aria-label={title || ariaLabel || 'Dialog'}>
      <div className="lf-scrim" onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`lf-sheet ${full ? 'full' : ''}`}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset > 0 ? 'none' : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className="lf-grab" />
        {children}
      </div>
    </div>
  )
}
