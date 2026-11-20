import { useRef } from 'react'
import { getSection } from '../../i18n'

interface FormFillPickerSheetProps {
  isOpen: boolean
  lang: string
  onClose: () => void
  onPickImages: (images: string[], formTitle?: string, sourcePdfBytes?: Uint8Array | null) => void
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result || ''))
    reader.onerror = () => reject(reader.error || new Error('File read failed'))
    reader.readAsDataURL(file)
  })
}

async function pdfFirstPageToPlaceholderImage(file: File): Promise<{ dataUrl: string; pdfBytes: Uint8Array }> {
  const buf = await file.arrayBuffer()
  const pdfBytes = new Uint8Array(buf)
  // Create a clean synthetic preview canvas representing the PDF page so FormFillScreen can render overlays
  const canvas = document.createElement('canvas')
  canvas.width = 794
  canvas.height = 1123
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#1B1B1B'
    ctx.font = 'bold 28px sans-serif'
    ctx.fillText(file.name.replace(/\.pdf$/i, ''), 48, 84)
    ctx.fillStyle = '#5E5E5A'
    ctx.font = '18px sans-serif'
    ctx.fillText('Fillable PDF document loaded', 48, 126)
  }
  return { dataUrl: canvas.toDataURL('image/jpeg', 0.85), pdfBytes }
}

export default function FormFillPickerSheet({
  isOpen,
  lang,
  onClose,
  onPickImages,
}: FormFillPickerSheetProps) {
  const ff = getSection(lang, 'formFill')
  const cameraRef = useRef<HTMLInputElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  if (!isOpen) return null

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList || fileList.length === 0) return
    const files = Array.from(fileList).slice(0, 10)
    const first = files[0]
    const isPdf = first.type === 'application/pdf' || first.name.toLowerCase().endsWith('.pdf')

    if (isPdf) {
      const { dataUrl, pdfBytes } = await pdfFirstPageToPlaceholderImage(first)
      onClose()
      onPickImages([dataUrl], first.name.replace(/\.pdf$/i, ''), pdfBytes)
      return
    }

    const images: string[] = []
    for (const f of files) {
      if (f.type.startsWith('image/') || /\.(jpe?g|png|webp)$/i.test(f.name)) {
        images.push(await fileToDataUrl(f))
      }
    }
    if (images.length > 0) {
      onClose()
      onPickImages(images, first.name.replace(/\.[^.]+$/, ''))
    }
  }

  const handleSampleKyc = async () => {
    try {
      const res = await fetch('/samples/sample-kyc-form.jpg')
      if (!res.ok) throw new Error('Sample fetch failed')
      const blob = await res.blob()
      const file = new File([blob], 'sample-kyc-form.jpg', { type: 'image/jpeg' })
      const dataUrl = await fileToDataUrl(file)
      onClose()
      onPickImages([dataUrl], 'KYC update form')
    } catch {
      // Fallback: draw synthetic KYC form onto canvas if static file unavailable
      const canvas = document.createElement('canvas')
      canvas.width = 794
      canvas.height = 1040
      const ctx = canvas.getContext('2d')
      if (ctx) {
        ctx.fillStyle = '#FFFFFF'
        ctx.fillRect(0, 0, canvas.width, canvas.height)
        ctx.fillStyle = '#1B1B1B'
        ctx.font = 'bold 24px sans-serif'
        ctx.fillText('BANK ACCOUNT - KYC UPDATE FORM (SAMPLE)', 44, 66)
        ctx.fillRect(44, 82, 706, 3)
        const labels = [
          'Full Name',
          'Date of Birth (DD-MM-YYYY)',
          'Mobile Number',
          'Address',
          'PAN (10 chars)',
          'Occupation',
          'Nominee Name',
          'Nominee Relation',
          'Applicant Signature',
        ]
        labels.forEach((lbl, idx) => {
          const y = 148 + idx * 88
          ctx.fillStyle = '#333333'
          ctx.font = '18px sans-serif'
          ctx.fillText(lbl, 44, y)
          ctx.strokeStyle = '#888888'
          ctx.lineWidth = 1.5
          ctx.strokeRect(300, y - 28, 450, 44)
        })
      }
      onClose()
      onPickImages([canvas.toDataURL('image/jpeg', 0.85)], 'KYC update form')
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 bg-black/45 flex items-end justify-center"
      onClick={onClose}
      role="presentation"
    >
      <input
        ref={cameraRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
        className="hidden"
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        multiple
        onChange={(e) => {
          void handleFiles(e.target.files)
          e.target.value = ''
        }}
        className="hidden"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={ff.pickerTitle || 'Fill a form'}
        data-testid="formfill-picker-sheet"
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[430px] bg-[#F5F4F2] text-[#1B1B1B] rounded-t-[28px] border-t-[2px] border-[#1B1B1B] px-5 pt-4 pb-7 flex flex-col gap-3.5"
      >
        <div className="flex items-center justify-between">
          <div>
            <h2 className="m-0 text-[21px] font-bold">{ff.pickerTitle || 'Fill a form'}</h2>
            <p className="m-0 text-[13.5px] text-[#5E5E5A]">
              {ff.pickerSub || 'Take a photo of the form, pick an image or PDF, or try the sample KYC form.'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={ff.close || 'Close'}
            className="w-11 h-11 rounded-full bg-[#EAE7E0] flex items-center justify-center shrink-0"
          >
            <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="#1B1B1B" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>

        <button
          type="button"
          data-testid="formfill-pick-camera"
          onClick={() => cameraRef.current?.click()}
          className="sv-press min-h-[54px] px-4 rounded-[22px] border-[2px] border-[#1B1B1B] bg-[#214D47] text-white font-bold text-[15.5px] flex items-center justify-between"
        >
          <span>{ff.takePhoto || 'Take photo'}</span>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
            <circle cx="12" cy="13" r="4" />
          </svg>
        </button>

        <button
          type="button"
          data-testid="formfill-pick-files"
          onClick={() => fileRef.current?.click()}
          className="sv-press min-h-[54px] px-4 rounded-[22px] border-[2px] border-[#1B1B1B] bg-white text-[#1B1B1B] font-bold text-[15.5px] flex items-center justify-between"
        >
          <span>{ff.chooseFromFiles || 'Choose from files'}</span>
          <svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
            <polyline points="14 2 14 8 20 8" />
          </svg>
        </button>

        <button
          type="button"
          data-testid="formfill-pick-sample"
          onClick={() => { void handleSampleKyc() }}
          className="sv-press min-h-[52px] px-4 rounded-[22px] border-[2px] border-[#1B1B1B] bg-[#E3B660] text-[#1B1B1B] font-bold text-[15px] flex items-center justify-between"
        >
          <span>{ff.trySampleKyc || 'Try sample KYC form'}</span>
          <span className="text-[11px] font-bold uppercase px-2 py-0.5 rounded-lg bg-[#1B1B1B] text-[#F5F4F2]">Sample</span>
        </button>
      </div>
    </div>
  )
}
