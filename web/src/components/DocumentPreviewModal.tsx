import { useState, useRef, useEffect, type TouchEvent } from 'react'
import { CloseIcon, ChevronRightIcon } from './icons'

export interface PreviewFileItem {
  name: string
  type: string
  url: string
}

interface DocumentPreviewModalProps {
  isOpen: boolean
  onClose: () => void
  files: PreviewFileItem[]
  docTitle?: string
  t: Record<string, string>
}

export default function DocumentPreviewModal({
  isOpen,
  onClose,
  files,
  docTitle,
  t,
}: DocumentPreviewModalProps) {
  const [currentPage, setCurrentPage] = useState(0)
  const [scale, setScale] = useState(1)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const isDraggingRef = useRef(false)
  const dragStartRef = useRef({ x: 0, y: 0 })
  const initialDistanceRef = useRef<number | null>(null)
  const initialScaleRef = useRef(1)

  // Reset page and zoom on open
  useEffect(() => {
    if (isOpen) {
      setCurrentPage(0)
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }, [isOpen])

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose()
      } else if (e.key === 'ArrowRight') {
        handleNextPage()
      } else if (e.key === 'ArrowLeft') {
        handlePrevPage()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, currentPage, files.length])

  if (!isOpen || files.length === 0) return null

  const currentFile = files[Math.min(currentPage, files.length - 1)]
  const isPdf = currentFile.type.includes('pdf') || currentFile.name.toLowerCase().endsWith('.pdf')

  const handleNextPage = () => {
    if (currentPage < files.length - 1) {
      setCurrentPage((prev) => prev + 1)
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }

  const handlePrevPage = () => {
    if (currentPage > 0) {
      setCurrentPage((prev) => prev - 1)
      setScale(1)
      setPosition({ x: 0, y: 0 })
    }
  }

  // Touch pinch-zoom & pan
  const handleTouchStart = (e: TouchEvent) => {
    if (e.touches.length === 2) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      initialDistanceRef.current = dist
      initialScaleRef.current = scale
    } else if (e.touches.length === 1 && scale > 1) {
      isDraggingRef.current = true
      dragStartRef.current = {
        x: e.touches[0].clientX - position.x,
        y: e.touches[0].clientY - position.y,
      }
    }
  }

  const handleTouchMove = (e: TouchEvent) => {
    if (e.touches.length === 2 && initialDistanceRef.current !== null) {
      const dist = Math.hypot(
        e.touches[0].clientX - e.touches[1].clientX,
        e.touches[0].clientY - e.touches[1].clientY
      )
      const factor = dist / initialDistanceRef.current
      const newScale = Math.min(Math.max(initialScaleRef.current * factor, 1), 4)
      setScale(newScale)
      if (newScale === 1) setPosition({ x: 0, y: 0 })
    } else if (e.touches.length === 1 && isDraggingRef.current && scale > 1) {
      setPosition({
        x: e.touches[0].clientX - dragStartRef.current.x,
        y: e.touches[0].clientY - dragStartRef.current.y,
      })
    }
  }

  const handleTouchEnd = () => {
    initialDistanceRef.current = null
    isDraggingRef.current = false
  }

  const handleResetZoom = () => {
    setScale(1)
    setPosition({ x: 0, y: 0 })
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t.documentPreview || 'Document Preview'}
      className="fixed inset-0 z-50 flex flex-col bg-black/95 text-white animate-fade-in select-none"
    >
      {/* Top Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-black/60 backdrop-blur-md z-10 border-b border-white/10">
        <div className="flex flex-col min-w-0 pr-2">
          <span className="text-sm font-semibold truncate text-white">
            {docTitle || currentFile.name}
          </span>
          {files.length > 1 && (
            <span className="text-xs text-white/60">
              Page {currentPage + 1} of {files.length}
            </span>
          )}
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {scale > 1 && (
            <button
              type="button"
              onClick={handleResetZoom}
              className="text-xs px-2.5 py-1 bg-white/20 hover:bg-white/30 rounded-lg text-white font-medium transition-colors"
            >
              Reset
            </button>
          )}

          <button
            type="button"
            onClick={onClose}
            className="p-2 text-white/70 hover:text-white rounded-full bg-white/10 hover:bg-white/20 transition-colors"
            aria-label={t.close || 'Close'}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div
        className="flex-1 relative flex items-center justify-center overflow-hidden touch-none"
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        {isPdf ? (
          <div className="flex flex-col items-center gap-4 p-6 text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-white/10 flex items-center justify-center text-xl font-bold font-mono">
              PDF
            </div>
            <div className="flex flex-col gap-1">
              <span className="text-base font-semibold">{currentFile.name}</span>
              <span className="text-xs text-white/60">
                Original PDF document stored on this phone only
              </span>
            </div>
            <a
              href={currentFile.url}
              target="_blank"
              rel="noopener noreferrer"
              className="btn-press inline-flex items-center justify-center gap-2 px-5 py-2.5 bg-white text-black font-semibold text-sm rounded-xl hover:bg-neutral-200 transition-colors shadow-lg"
            >
              <span>{t.openOriginal || 'Open original in new tab'}</span>
              <ChevronRightIcon className="w-4 h-4" />
            </a>
          </div>
        ) : (
          <div
            className="w-full h-full flex items-center justify-center transition-transform duration-75 ease-out cursor-grab active:cursor-grabbing"
            style={{
              transform: `translate3d(${position.x}px, ${position.y}px, 0) scale(${scale})`,
            }}
          >
            <img
              src={currentFile.url}
              alt={`Page ${currentPage + 1}`}
              className="max-w-full max-h-full object-contain pointer-events-none select-none"
              draggable={false}
            />
          </div>
        )}

        {/* Page Switch Buttons if > 1 page */}
        {files.length > 1 && (
          <>
            {currentPage > 0 && (
              <button
                type="button"
                onClick={handlePrevPage}
                className="absolute left-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 border border-white/20 transition-colors shadow-lg"
                aria-label="Previous page"
              >
                <span className="block rotate-180">
                  <ChevronRightIcon className="w-5 h-5" />
                </span>
              </button>
            )}

            {currentPage < files.length - 1 && (
              <button
                type="button"
                onClick={handleNextPage}
                className="absolute right-3 top-1/2 -translate-y-1/2 p-2.5 rounded-full bg-black/60 hover:bg-black/80 text-white/90 border border-white/20 transition-colors shadow-lg"
                aria-label="Next page"
              >
                <ChevronRightIcon className="w-5 h-5" />
              </button>
            )}
          </>
        )}
      </div>

      {/* Footer reassurance */}
      <div className="py-2.5 px-4 text-center text-xs text-white/50 bg-black/60 border-t border-white/10">
        Saved on this phone only. Not sent to Google or Sarvam.
      </div>
    </div>
  )
}
