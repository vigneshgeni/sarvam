export type PhoneKind = 'ios' | 'android' | 'other'

export function phoneKind(): PhoneKind {
  if (typeof navigator === 'undefined') return 'other'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return 'ios'
  if (/Android/i.test(ua)) return 'android'
  return 'other'
}

export function mediaAccessGranted(): boolean {
  try {
    return localStorage.getItem('sarvam.mediaAccess') === 'granted'
  } catch {
    return false
  }
}

export function grantMediaAccess() {
  try {
    localStorage.setItem('sarvam.mediaAccess', 'granted')
  } catch {
    /* the choice still works for this visit */
  }
}

export default function MediaSheet({
  mode,
  t,
  onAllow,
  onClose,
  onCamera,
  onGallery,
  onFiles,
}: {
  mode: 'ask' | 'choose'
  t: Record<string, string>
  onAllow: () => void
  onClose: () => void
  onCamera: () => void
  onGallery: () => void
  onFiles: () => void
}) {
  const phone = phoneKind()
  const body =
    phone === 'ios'
      ? t.mediaAccessIos ||
        'Sarvam will ask for the camera and Photo Library. A photo or file stays on this iPhone until you choose it to be read.'
      : phone === 'android'
        ? t.mediaAccessAndroid ||
          'Sarvam will ask for the camera, gallery and files. A photo or file stays on this phone until you choose it to be read.'
        : t.mediaAccessOther ||
          'Sarvam will ask for the camera and your photos. A photo or file stays on this device until you choose it to be read.'
  const galleryLabel =
    phone === 'android'
      ? t.galleryAndroid || 'Choose from gallery'
      : t.galleryPhotos || 'Choose from Photos'

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-[#8A8F8C]" onClick={onClose} role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="sv-media-title"
        className="w-full max-w-[430px] bg-[#F4F5F2] rounded-t-[40px] border-t-[1.5px] border-[#1A1A1A] p-6 pb-[max(1.5rem,env(safe-area-inset-bottom))] flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="sv-media-title" className="sv-display text-[32px] leading-none m-0">
          {mode === 'ask'
            ? t.mediaAccessTitle || 'Allow photos and files?'
            : t.photoChoiceTitle || 'Add a page'}
          <span className="text-[#D9603B]">.</span>
        </h2>
        {mode === 'ask' ? (
          <>
            <p className="m-0 text-[16px] leading-[1.5] text-[#3B3E3C]">{body}</p>
            <button type="button" className="sv-press h-12 rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] text-[16px] font-bold" onClick={onAllow}>
              {t.mediaAllow || 'Allow access'}
            </button>
            <button type="button" className="sv-press h-12 rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent text-[16px] font-bold" onClick={onClose}>
              {t.mediaNotNow || 'Not now'}
            </button>
          </>
        ) : (
          <div className="flex flex-col gap-2.5">
            <button type="button" className="sv-press h-14 rounded-[22px] border-[1.5px] border-[#1A1A1A] bg-[#034F46] text-[#F4F5F2] text-[16px] font-bold text-left px-4" onClick={onCamera}>
              {t.takePhoto || 'Take photo'}
            </button>
            <button type="button" className="sv-press h-14 rounded-[22px] border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] text-[16px] font-bold text-left px-4" onClick={onGallery}>
              {galleryLabel}
            </button>
            <button type="button" className="sv-press h-14 rounded-[22px] border-[1.5px] border-[#1A1A1A] bg-[#F4F5F2] text-[16px] font-bold text-left px-4" onClick={onFiles}>
              {t.chooseFiles || 'Choose files'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
