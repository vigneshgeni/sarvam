import { useState, useRef, useEffect } from 'react'
import { LANGUAGES, getDictionary } from './i18n'

export default function App() {
  const [selectedLang, setSelectedLang] = useState<string>('ta')
  const langRowRef = useRef<HTMLDivElement>(null)
  const chipRefs = useRef<Record<string, HTMLButtonElement | null>>({})

  const currentLangObj = LANGUAGES.find((l) => l.id === selectedLang) || LANGUAGES[0]
  const t = getDictionary(selectedLang)

  const handleSelectLang = (langId: string) => {
    setSelectedLang(langId)
    console.log(`Language selected: ${langId}`)
    const chip = chipRefs.current[langId]
    if (chip) {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }

  // Scroll selected language chip into view on initial mount
  useEffect(() => {
    const chip = chipRefs.current[selectedLang]
    if (chip) {
      chip.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    }
  }, [])

  const handleA11yClick = () => {
    console.log('Accessibility settings button clicked')
  }

  const handleTakePhoto = () => {
    console.log('Take photo button clicked')
  }

  const handleChooseFile = () => {
    console.log('Choose file button clicked')
  }

  const handleSampleClick = (sampleId: string, title: string) => {
    console.log(`Sample clicked: ${sampleId} (${title})`)
  }

  return (
    <div className="min-h-screen bg-bg text-ink flex justify-center">
      {/* Mobile-first frame: centered at max 430px on desktop */}
      <main className="w-full max-w-[430px] min-w-0 min-h-screen flex flex-col p-5 pb-8 gap-5 relative overflow-x-hidden">
        {/* Header: Logo with coral dot + Accessibility button */}
        <header className="flex items-center justify-between h-12 animate-card-in">
          <div className="font-heading font-bold text-[26px] tracking-tight text-ink select-none flex items-center">
            Sarvam<span className="text-logo-dot">.</span>
          </div>
          <button
            type="button"
            onClick={handleA11yClick}
            aria-label={t.a11yTitle}
            className="w-12 h-12 rounded-full border border-line bg-surface text-ink flex items-center justify-center hover:bg-soft transition-colors active:scale-95 focus:outline-none focus:ring-2 focus:ring-brand/40"
          >
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-ink"
            >
              <circle cx="12" cy="4.5" r="1.8" />
              <path d="M5 8.5l7 1.5 7-1.5M12 10v4.5M9 21l3-6.5 3 6.5" />
            </svg>
          </button>
        </header>

        {/* Language Selection Row: Horizontally scrolling with right-edge fade and Beta tags */}
        <div className="flex flex-col gap-2.5 animate-card-in-1 min-w-0">
          <div className="relative -mx-5 px-5 min-w-0">
            <div
              ref={langRowRef}
              className="flex gap-2 overflow-x-auto no-scrollbar py-0.5 min-w-0"
              role="tablist"
              aria-label="Language selection"
            >
              {LANGUAGES.map((lang) => {
                const isSelected = selectedLang === lang.id
                return (
                  <button
                    key={lang.id}
                    ref={(el) => {
                      chipRefs.current[lang.id] = el
                    }}
                    role="tab"
                    aria-selected={isSelected}
                    onClick={() => handleSelectLang(lang.id)}
                    className={`shrink-0 h-[44px] min-h-[44px] px-4 rounded-full text-[15px] font-semibold flex items-center gap-1.5 whitespace-nowrap transition-colors select-none active:scale-95 ${
                      isSelected
                        ? 'bg-ink text-surface border border-ink'
                        : 'bg-surface text-ink border border-line hover:border-muted/40'
                    }`}
                  >
                    <span>{lang.label}</span>
                    {lang.isBeta && (
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full ${
                          isSelected
                            ? 'bg-white/20 text-white'
                            : 'bg-soft text-muted'
                        }`}
                      >
                        {t.betaTag || 'Beta'}
                      </span>
                    )}
                  </button>
                )
              })}
              {/* Spacer so last item is not flush with right edge under fade */}
              <div className="w-4 shrink-0" aria-hidden="true" />
            </div>

            {/* Right-edge soft fade to indicate scrollability */}
            <div
              className="pointer-events-none absolute right-0 top-0 bottom-0 w-8 bg-gradient-to-l from-bg to-transparent"
              aria-hidden="true"
            />
          </div>

          {/* Beta preview note if a beta language is selected */}
          {currentLangObj.isBeta && (
            <div className="text-[13px] leading-relaxed text-muted bg-soft rounded-xl p-3 animate-card-in">
              {t.previewNote.replace('{lang}', currentLangObj.name)}
            </div>
          )}
        </div>

        {/* Greeting Heading */}
        <h1 className="text-[28px] sm:text-[30px] font-bold font-heading text-ink leading-[1.18] tracking-[-0.015em] m-0 animate-card-in-1">
          {t.hello}
        </h1>

        {/* Action Cards: Compact Green Take Photo + Outline Choose File */}
        <div className="flex flex-col gap-2.5 animate-card-in-2">
          {/* Primary Action: Compact green "Take photo" card (~88px tall) */}
          <button
            type="button"
            onClick={handleTakePhoto}
            className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-card bg-brand text-white text-left transition-transform active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand/40 min-h-[88px]"
          >
            <span className="w-12 h-12 sm:w-14 sm:h-14 rounded-[18px] bg-white/16 flex items-center justify-center shrink-0">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#FFFFFF"
                strokeWidth="1.9"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
                <circle cx="12" cy="13" r="3.5" />
              </svg>
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-1">
              <span className="text-[17px] sm:text-[18px] font-bold leading-tight">
                {t.takePhoto}
              </span>
              <span className="text-[13px] sm:text-[13.5px] leading-snug text-white/80">
                {t.takePhotoSub}
              </span>
            </span>
            <svg
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="#FFFFFF"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>

          {/* Secondary Action: White outline "Choose file" card */}
          <button
            type="button"
            onClick={handleChooseFile}
            className="w-full flex items-center gap-4 p-4 sm:p-5 rounded-card bg-surface border border-line text-ink text-left transition-colors hover:bg-soft/50 active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-brand/30 min-h-[76px] sm:min-h-[84px]"
          >
            <span className="w-11 h-11 sm:w-12 sm:h-12 rounded-[16px] bg-brand-soft text-brand flex items-center justify-center shrink-0">
              <svg
                width="22"
                height="22"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 15V4M7.5 8.5L12 4l4.5 4.5M5 19.5h14" />
              </svg>
            </span>
            <span className="flex-1 min-w-0 flex flex-col gap-0.5">
              <span className="text-[16px] font-bold text-ink">
                {t.chooseFile}
              </span>
              <span className="text-[13px] text-muted">
                {t.chooseFileSub}
              </span>
            </span>
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="shrink-0 text-muted"
            >
              <path d="M9 6l6 6-6 6" />
            </svg>
          </button>
        </div>

        {/* Try a sample section */}
        <section className="flex flex-col gap-2.5 animate-card-in-3" aria-labelledby="sample-heading">
          <div
            id="sample-heading"
            className="text-[12px] font-bold tracking-[0.08em] uppercase text-muted"
          >
            {t.samples}
          </div>

          <div className="bg-surface border border-line rounded-card overflow-hidden divide-y divide-line">
            {/* Sample 1: Blood test report */}
            <button
              type="button"
              onClick={() => handleSampleClick('lab', t.sample1Title)}
              className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-soft/40 active:bg-soft transition-colors min-h-[68px] focus:outline-none focus:bg-soft/40"
            >
              <span className="w-10 h-10 rounded-[12px] bg-soft flex items-center justify-center shrink-0 text-[11px] font-bold text-muted">
                PDF
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-ink leading-snug">
                  {t.sample1Title}
                </span>
                <span className="text-[13px] text-muted leading-tight">
                  {t.sample1Sub}
                </span>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            {/* Sample 2: Insurance claim letter */}
            <button
              type="button"
              onClick={() => handleSampleClick('ins', t.sample2Title)}
              className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-soft/40 active:bg-soft transition-colors min-h-[68px] focus:outline-none focus:bg-soft/40"
            >
              <span className="w-10 h-10 rounded-[12px] bg-soft flex items-center justify-center shrink-0 text-[11px] font-bold text-muted">
                PDF
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-ink leading-snug">
                  {t.sample2Title}
                </span>
                <span className="text-[13px] text-muted leading-tight">
                  {t.sample2Sub}
                </span>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>

            {/* Sample 3: Pension notice */}
            <button
              type="button"
              onClick={() => handleSampleClick('pen', t.sample3Title)}
              className="w-full flex items-center gap-3.5 p-3.5 sm:p-4 text-left hover:bg-soft/40 active:bg-soft transition-colors min-h-[68px] focus:outline-none focus:bg-soft/40"
            >
              <span className="w-10 h-10 rounded-[12px] bg-soft flex items-center justify-center shrink-0 text-[11px] font-bold text-muted">
                IMG
              </span>
              <span className="flex-1 min-w-0 flex flex-col gap-0.5">
                <span className="text-[15px] font-semibold text-ink leading-snug">
                  {t.sample3Title}
                </span>
                <span className="text-[13px] text-muted leading-tight">
                  {t.sample3Sub}
                </span>
              </span>
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="shrink-0 text-muted"
              >
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
          </div>
        </section>

        {/* Privacy Note */}
        <footer className="flex items-center gap-2 text-[13px] text-muted pt-2 animate-card-in-3">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="shrink-0"
          >
            <rect x="5" y="11" width="14" height="9" rx="2" />
            <path d="M8 11V8a4 4 0 0 1 8 0v3" />
          </svg>
          <span>{t.privacy}</span>
        </footer>
      </main>
    </div>
  )
}
