import { useRef } from 'react'
import { getDictionary } from '../i18n'
import type { StagedFile } from '../types'

interface TrayScreenProps {
  files: StagedFile[]
  lang: string
  onRemoveFile: (id: string) => void
  onMoveUp: (index: number) => void
  onMoveDown: (index: number) => void
  onAddPhoto: (file: File) => void
  onAddFiles?: (files: File[]) => void
  onExplain: () => void
  onGoHome: () => void
  errorMessage?: string | null
}

export default function TrayScreen({
  files,
  lang,
  onRemoveFile,
  onMoveUp,
  onMoveDown,
  onAddPhoto,
  onAddFiles,
  onExplain,
  onGoHome,
  errorMessage,
}: TrayScreenProps) {
  const t = getDictionary(lang)
  const addCameraInputRef = useRef<HTMLInputElement>(null)
  const addFilesInputRef = useRef<HTMLInputElement>(null)

  const isPdf = (f: StagedFile) =>
    f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')

  const hasPhotos = files.some((f) => !isPdf(f))
  const hasPdfs = files.some((f) => isPdf(f))
  const hasMixed = hasPhotos && hasPdfs

  const isPhotosOnly = hasPhotos && !hasPdfs
  const isPdfsOnly = hasPdfs && !hasPhotos

  // Limits per Item 8:
  // Photos = pages of ONE document, max 10
  // PDFs = each its own report, max 5, total <= 25 MB
  const maxPhotos = 10
  const maxPdfs = 5
  const maxPdfBytes = 25 * 1024 * 1024

  const totalPdfSize = files
    .filter(isPdf)
    .reduce((acc, f) => acc + (f.size || 0), 0)

  const isPhotosOverLimit = isPhotosOnly && files.length > maxPhotos
  const isPdfsCountOverLimit = isPdfsOnly && files.length > maxPdfs
  const isPdfsSizeOverLimit = isPdfsOnly && totalPdfSize > maxPdfBytes

  const hasValidationError =
    hasMixed || isPhotosOverLimit || isPdfsCountOverLimit || isPdfsSizeOverLimit || files.length === 0

  const canAddMorePhotos = isPhotosOnly && files.length < maxPhotos
  const canAddMorePdfs = isPdfsOnly && files.length < maxPdfs

  const handleAddPhotoChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onAddPhoto(e.target.files[0])
      e.target.value = ''
    }
  }

  const handleAddFilesChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      if (onAddFiles) {
        onAddFiles(Array.from(e.target.files))
      }
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
            {isPhotosOnly && (
              <span className="text-[13px] font-semibold text-brand">
                {t.pageCounter
                  ?.replace('{current}', String(files.length))
                  .replace('{total}', String(maxPhotos)) ||
                  `Page ${files.length} of ${maxPhotos}`}
                {files.length === maxPhotos ? ' (max)' : ''}
              </span>
            )}
            {isPdfsOnly && (
              <span className="text-[13px] font-semibold text-brand">
                {files.length} / {maxPdfs} PDFs · {formatFileSize(totalPdfSize)} / 25 MB
              </span>
            )}
          </div>
        </div>

        {/* Global or Custom Error Message */}
        {errorMessage && (
          <div className="w-full bg-[#FDECEA] border border-[#F8B4B4] rounded-xl p-3 text-[13.5px] leading-relaxed text-[#B42318] flex items-center gap-2.5 animate-card-in">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>{errorMessage}</span>
          </div>
        )}

        {/* Rule Warning: Mixed Files (Photos + PDFs) */}
        {hasMixed && (
          <div className="w-full bg-[#FFF4DE] border border-[#F4DDB0] rounded-xl p-3 text-[13.5px] leading-relaxed text-[#5A3500] flex items-start gap-2.5 animate-card-in">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 mt-0.5 text-[#B42318]"
            >
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" />
              <line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
            <span>
              {t.mixedFilesError ||
                'Please choose either photos or PDFs, not both'}
            </span>
          </div>
        )}

        {/* Rule Warning: Photos > 10 */}
        {isPhotosOverLimit && (
          <div className="w-full bg-[#FDECEA] border border-[#F8B4B4] rounded-xl p-3 text-[13.5px] leading-relaxed text-[#B42318] flex items-center gap-2.5 animate-card-in">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              {t.maxPhotosError || 'You can add up to 10 photos'}
            </span>
          </div>
        )}

        {/* Rule Warning: PDFs > 5 */}
        {isPdfsCountOverLimit && (
          <div className="w-full bg-[#FDECEA] border border-[#F8B4B4] rounded-xl p-3 text-[13.5px] leading-relaxed text-[#B42318] flex items-center gap-2.5 animate-card-in">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              {t.maxPdfsError || 'You can add up to 5 PDFs'}
            </span>
          </div>
        )}

        {/* Rule Warning: PDF size > 25MB */}
        {isPdfsSizeOverLimit && (
          <div className="w-full bg-[#FDECEA] border border-[#F8B4B4] rounded-xl p-3 text-[13.5px] leading-relaxed text-[#B42318] flex items-center gap-2.5 animate-card-in">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <span>
              {t.maxPdfSizeError || 'Total size of PDFs must be 25 MB or less'}
            </span>
          </div>
        )}

        {/* Subtitle / Hint */}
        <p className="text-[14px] leading-relaxed text-muted m-0">
          {isPhotosOnly
            ? t.takePhotoSub || 'One page or many. Sarvam reads them together.'
            : isPdfsOnly
            ? `${files.length} PDF reports. Each PDF will be explained separately.`
            : t.uploadSub || 'PDF or photos'}
        </p>

        {/* List of Captured / Staged Pages with Reorder & Remove */}
        <div className="bg-surface border border-line rounded-card overflow-hidden divide-y divide-line shadow-sm">
          {files.map((f, i) => {
            const isFilePdf = isPdf(f)
            return (
              <div
                key={f.id}
                className="flex items-center gap-2.5 sm:gap-3.5 p-3 sm:p-4 min-h-[64px]"
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
                      isFilePdf
                        ? 'bg-[#FDECEA] text-[#B42318]'
                        : 'bg-brand-soft text-brand'
                    }`}
                  >
                    {isFilePdf ? 'PDF' : 'IMG'}
                  </span>
                )}

                {/* Details */}
                <div className="flex-1 min-w-0 flex flex-col gap-0.5">
                  <span className="text-[15px] font-semibold text-ink truncate">
                    {isPhotosOnly ? `Page ${i + 1}` : f.name}
                  </span>
                  <span className="text-[12px] text-muted">
                    {formatFileSize(f.size)}
                  </span>
                </div>

                {/* Reorder Buttons (Move Up / Down) */}
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onMoveUp(i)}
                    disabled={i === 0}
                    aria-label={`${t.reorderUp || 'Move up'}: ${f.name}`}
                    className="w-8 h-8 rounded-full border border-line text-muted hover:text-ink hover:bg-soft flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 15l-6-6-6 6" />
                    </svg>
                  </button>

                  <button
                    type="button"
                    onClick={() => onMoveDown(i)}
                    disabled={i === files.length - 1}
                    aria-label={`${t.reorderDown || 'Move down'}: ${f.name}`}
                    className="w-8 h-8 rounded-full border border-line text-muted hover:text-ink hover:bg-soft flex items-center justify-center transition-colors disabled:opacity-30 disabled:pointer-events-none"
                  >
                    <svg
                      width="15"
                      height="15"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M6 9l6 6 6-6" />
                    </svg>
                  </button>

                  {/* Remove button */}
                  <button
                    type="button"
                    onClick={() => onRemoveFile(f.id)}
                    aria-label={`${t.removePage || 'Remove page'}: ${f.name}`}
                    className="w-8 h-8 rounded-full border border-line text-muted hover:text-[#B42318] hover:bg-soft flex items-center justify-center transition-colors active:scale-90 ml-1"
                  >
                    <svg
                      width="15"
                      height="15"
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
              </div>
            )
          })}
        </div>

        {/* Add more photos button (up to 10 photos) */}
        {canAddMorePhotos && (
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

        {/* Add more PDFs button (up to 5 PDFs) */}
        {canAddMorePdfs && (
          <div>
            <input
              ref={addFilesInputRef}
              type="file"
              accept=".pdf,application/pdf"
              multiple
              onChange={handleAddFilesChange}
              className="hidden"
            />
            <button
              type="button"
              onClick={() => addFilesInputRef.current?.click()}
              className="w-full h-12 rounded-full border-2 border-dashed border-line bg-surface text-ink font-semibold text-[14px] flex items-center justify-center gap-2 hover:bg-soft transition-colors active:scale-[0.99]"
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
              <span>Add PDF</span>
            </button>
          </div>
        )}
      </div>

      {/* Done / Explain Action Button */}
      <div className="pt-6 pb-2">
        <button
          type="button"
          onClick={onExplain}
          disabled={hasValidationError}
          className="w-full h-14 rounded-full bg-brand text-white font-bold text-[16px] shadow-sm flex items-center justify-center gap-2 hover:opacity-95 transition-transform active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand/40 disabled:opacity-40 disabled:pointer-events-none"
        >
          <span>
            {t.done || 'Done'} — {explainText}
          </span>
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
