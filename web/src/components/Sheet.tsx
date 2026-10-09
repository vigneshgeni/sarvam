import React, { useEffect, useRef, useState } from 'react'

interface SheetProps {
  isOpen: boolean
  onClose: () => void
  title?: string
  ariaLabel?: string
  children: React.ReactNode
  maxHeight?: string
}

export default function Sheet({
  isOpen,
  onClose,
  title,
  ariaLabel,
  children,
  maxHeight = 'max-h-[88vh]',
}: SheetProps) {
  const sheetRef = useRef<HTMLDivElement>(null)
  const previousFocusRef = useRef<HTMLElement | null>(null)
  const touchStartYRef = useRef<number>(0)
  const currentTranslateYRef = useRef<number>(0)
  const [dragOffset, setDragOffset] = useState<number>(0)

  // Save previous active element to restore focus on close
  useEffect(() => {
    if (isOpen) {
      previousFocusRef.current = document.activeElement as HTMLElement
      // Lock background scroll
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

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
      // Focus trapping
      if (e.key === 'Tab' && sheetRef.current) {
        const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
        if (focusables.length === 0) return
        const first = focusables[0]
        const last = focusables[focusables.length - 1]
        if (e.shiftKey) {
          if (document.activeElement === first) {
            e.preventDefault()
            last.focus()
          }
        } else {
          if (document.activeElement === last) {
            e.preventDefault()
            first.focus()
          }
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  // Focus the sheet on open
  useEffect(() => {
    if (isOpen && sheetRef.current) {
      const focusables = sheetRef.current.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      )
      if (focusables.length > 0) {
        focusables[0].focus()
      } else {
        sheetRef.current.focus()
      }
    }
  }, [isOpen])

  // Swipe-down touch handlers
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY
  }

  const handleTouchMove = (e: React.TouchEvent) => {
    const deltaY = e.touches[0].clientY - touchStartYRef.current
    if (deltaY > 0) {
      // Dragging down
      currentTranslateYRef.current = deltaY
      setDragOffset(deltaY)
    }
  }

  const handleTouchEnd = () => {
    if (currentTranslateYRef.current > 75) {
      onClose()
    }
    currentTranslateYRef.current = 0
    setDragOffset(0)
  }

  if (!isOpen) return null

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col justify-end isolate"
      role="dialog"
      aria-modal="true"
      aria-label={title || ariaLabel || 'Dialog'}
    >
      {/* Scrim (backdrop) with fade */}
      <div
        className="fixed inset-0 bg-black/45 backdrop-blur-[2px] transition-opacity duration-200 scrim-enter"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Sheet panel with slide-up / swipe down */}
      <div
        ref={sheetRef}
        tabIndex={-1}
        className={`relative z-10 w-full max-w-[430px] mx-auto bg-white rounded-t-[28px] shadow-2xl flex flex-col overflow-hidden outline-none ${maxHeight} sheet-enter`}
        style={{
          transform: dragOffset > 0 ? `translateY(${dragOffset}px)` : undefined,
          transition: dragOffset > 0 ? 'none' : undefined,
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {/* Drag handle */}
        <div className="w-full pt-3 pb-2 flex justify-center items-center cursor-grab active:cursor-grabbing">
          <div className="w-10 h-1 bg-[#D8D8D2] rounded-full" />
        </div>

        {/* Content wrapper */}
        <div className="flex-1 overflow-y-auto px-5 pb-8 pt-1">{children}</div>
      </div>
    </div>
  )
}
