import { useRef } from 'react'
import { getDictionary } from '../i18n'
import type { StagedFile } from '../types'

interface TrayScreenProps {
  files: StagedFile[]
  lang: string
  onRemoveFile: (id: string) => void
  onAddPhoto: (file: File) => void
  onExplain: () => void
  onGoHome: () => void
}

export default function TrayScreen({
  files,
  lang,
  onRemoveFile,
  onAddPhoto,
  onExplain,
  onGoHome,
}: TrayScreenProps) {
  const t = getDictionary(lang)
  const addCameraInputRef = useRef<HTMLInputElement>(null)

  const isImageOnly = files.every((f) => f.type.startsWith('image/'))
  const canAddMoreImages = isImageOnly && files.length < 3

  const handleAddPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAddPhoto(e.target.files[0])
      // Reset input value so same file / next capture can trigger onChange
      e.target.value = ''
    }
  }

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const explainText =
    files.length > 1
      ? t.explainActionPlural?.replace('{count}', String(files.length)) ||
        `Explain all ${files.length} pages`
      : t.explainAction || 'Explain document'

  return (
    <div className="flex-1 flex flex-col justify-between animate-card-in">
      <div className="flex flex-col gap-4">
        {/* Top Header with Back button */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onGoHome}
            aria-label="Back"
            className="w-11 h-11 rounded-full border border-line bg-surface text-ink flex items-center justify-center hover:bg-soft transition-colors active:scale-95"
          >
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
          </button>
          <div className="flex-1 flex flex-col">
            <h1 className="font-heading font-bold text-[22px] text-ink leading-tight">
              {t.trayTitle || 'Ready to explain'}
            </h1>
            {isImageOnly && (
              <span className="text-[13px] font-semibold text-brand">
                {t.pageCounter
                  ?.replace('{current}', String(files.length))
                  .replace('{total}', '3') || `Page ${files.length} of 3`}
                {files.length === 3 ? ' (max)' : ''}
              </span>
            )}
          </div>
        </div>

        {/* Subtitle / Hint */}
        <p className="text-[14px] leading-relaxed text-muted">
          {isImageOnly
            ? t.takePhotoSub || 'One page or many. Sarvam reads them together.'
            : t.uploadSub || 'PDF or photos'}
        </p>

        {/* List of Captured / Staged Pages */}
        <div className="bg-surface border border-line rounded-card overflow-hidden divide-y divide-line shadow-sm">
          {files.map((f, i) => {
            const isPdf = f.type === 'application/pdf' || f.name.endsWith('.pdf')
            return (
              <div
                key={f.id}
                className="flex items-center gap-3.5 p-3.5 sm:p-4 min-h-[64px]"
              >
                {/* Thumbnail or Badge */}
                {f.previewUrl ? (
                  <img
                    src={f.previewUrl}
                    alt={f.name}
                    className="w-11 h-11 rounded-xl object-cover border border-line shrink-0"
                  />
                ) : (
                  <span
                    className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 text-[11px] font-bold ${
                      isPdf
                        ? 'bg-[#FDECEA] text-[#B42318]'
                        : 'bg-brand-soft text-brand'
                    }`}
                  >
                    {isPdf ? 'PDF' : 'IMG'}
                  </span>
                )}

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-ink truncate">
                    {isImageOnly ? `Page ${i + 1}` : f.name}
                  </span>
                  <span className="text-[12px] text-muted">
                    {formatFileSize(f.size)}
                  </span>
                </div>

                {/* Remove button */}
                <button
                  type="button"
                  onClick={() => onRemoveFile(f.id)}
                  aria-label={`${t.removePage || 'Remove page'}: ${f.name}`}
                  className="w-10 h-10 rounded-full border border-line text-muted hover:text-ink hover:bg-soft flex items-center justify-center shrink-0 transition-colors active:scale-90"
                >
                  <svg
                    width="17"
                    height="17"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M18 6L6 18M6 6l12 12" />
                  </svg>
                </button>
              </div>
            )
          })}
        </div>

        {/* Add next page button (up to 3 pages) for camera capture */}
        {canAddMoreImages && (
          <div>
            <input
              ref={addCameraInputRef}
              type="file"
              accept="image/*"
              capture="environment"
              onChange={handleAddPhotoChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => addCameraInputRef.current?.click()}
              className="w-full h-12 rounded-full border-2 border-dashed border-brand/40 bg-brand-soft/50 text-brand font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-brand-soft transition-colors active:scale-[0.99]"
            >
              <svg
                width="19"
                height="19"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14M5 12h14" />
              </svg>
              <span>{t.addPage || 'Add next page'}</span>
            </button>
          </div>
        )}
      </div>

      {/* Done / Explain Primary Action Button */}
      <div className="pt-6 pb-2">
        <button
          type="button"
          onClick={onExplain}
          className="w-full h-14 rounded-full bg-brand text-white font-bold text-[16px] shadow-sm flex items-center justify-center gap-2 hover:opacity-95 transition-transform active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand/40"
        >
          <span>{t.done || 'Done'} — {explainText}</span>
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M5 12h14M12 5l7 7-7 7" />
          </svg>
        </button>
      </div>
    </div>
  )
}
