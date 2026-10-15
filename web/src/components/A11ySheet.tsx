import { useState, useEffect } from 'react'
import type { A11ySettings } from '../types'
import Sheet from './Sheet'
import { CloseIcon } from './icons'
import { IconMoon, IconSun } from '../ui/icons'
import { applyDarkTheme, readDarkTheme } from '../design/theme'

interface A11ySheetProps {
  isOpen: boolean
  onClose: () => void
  t: Record<string, string>
  lang?: string
}

export const DEFAULT_A11Y_SETTINGS: A11ySettings = {
  textSize: 100,
  lineSpacing: 'normal',
  easyRead: false,
  highContrast: false,
  reduceMotion: false,
  largerTapTargets: false,
  readAloud: false,
  slowVoice: false,
}

export function getStoredA11ySettings(): A11ySettings {
  try {
    const raw = localStorage.getItem('sarvam.a11y')
    if (raw) {
      return { ...DEFAULT_A11Y_SETTINGS, ...JSON.parse(raw) }
    }
  } catch {
    // fallback
  }
  return DEFAULT_A11Y_SETTINGS
}

export function applyA11ySettings(settings: A11ySettings): void {
  if (typeof document === 'undefined') return
  const html = document.documentElement

  html.setAttribute('data-text-size', String(settings.textSize))
  html.setAttribute('data-line-spacing', settings.lineSpacing)
  html.setAttribute('data-easy-read', String(settings.easyRead))
  html.setAttribute('data-high-contrast', String(settings.highContrast))
  html.setAttribute('data-reduce-motion', String(settings.reduceMotion))
  html.setAttribute('data-larger-targets', String(settings.largerTapTargets))
  html.setAttribute('data-read-aloud', String(!!settings.readAloud))
  html.setAttribute('data-slow-voice', String(!!settings.slowVoice))

  try {
    localStorage.setItem('sarvam.a11y', JSON.stringify(settings))
  } catch {}
}

export default function A11ySheet({ isOpen, onClose, t, lang = 'en' }: A11ySheetProps) {
  const [settings, setSettings] = useState<A11ySettings>(getStoredA11ySettings)
  const [dark, setDark] = useState(readDarkTheme)

  useEffect(() => {
    const sync = () => setDark(readDarkTheme())
    window.addEventListener('sarvam-theme', sync)
    return () => window.removeEventListener('sarvam-theme', sync)
  }, [])

  useEffect(() => {
    applyA11ySettings(settings)
  }, [settings])

  const handleUpdate = <K extends keyof A11ySettings>(key: K, val: A11ySettings[K]) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: val }
      applyA11ySettings(next)
      return next
    })
  }

  const handleReset = () => {
    setSettings(DEFAULT_A11Y_SETTINGS)
    applyA11ySettings(DEFAULT_A11Y_SETTINGS)
  }

  const myLanguage = lang !== 'en' && lang !== 'auto'
  const largerOn = settings.textSize > 100
  const sizeIndex = settings.textSize >= 150 ? 2 : settings.textSize >= 115 ? 1 : 0
  const previewPx = [16, 20, 26][sizeIndex]

  const tiles: {
    id: string
    label: string
    on: boolean
    bg: string
    ink: string
    glyph?: string
    toggle: () => void
  }[] = [
    {
      id: 'big',
      label: t.largerText || 'Larger text',
      on: largerOn,
      bg: '#D9603B',
      ink: '#1A1A1A',
      glyph: 'Aa',
      toggle: () => handleUpdate('textSize', largerOn ? 100 : 130),
    },
    {
      id: 'speak',
      label: t.readAloud || 'Read aloud',
      on: !!settings.readAloud,
      bg: '#034F46',
      ink: '#F4F5F2',
      toggle: () => handleUpdate('readAloud', !settings.readAloud),
    },
    {
      id: 'contrast',
      label: t.highContrast || 'High contrast',
      on: settings.highContrast,
      bg: '#1A1A1A',
      ink: '#F4F5F2',
      toggle: () => handleUpdate('highContrast', !settings.highContrast),
    },
    {
      id: 'simple',
      label: t.simpleWords || 'Simple words',
      on: settings.easyRead,
      bg: '#E9B44C',
      ink: '#1A1A1A',
      toggle: () => handleUpdate('easyRead', !settings.easyRead),
    },
    {
      id: 'slow',
      label: t.slowerVoice || 'Slower voice',
      on: !!settings.slowVoice,
      bg: '#D9603B',
      ink: '#FFFFFF',
      toggle: () => handleUpdate('slowVoice', !settings.slowVoice),
    },
    {
      id: 'lang',
      label: t.myLanguage || 'My language',
      on: myLanguage,
      bg: '#CFE5E0',
      ink: '#1A1A1A',
      glyph: 'அ',
      toggle: () => undefined,
    },
  ]

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t.a11yTitle || 'Make Sarvam easier'}
      maxHeight="max-h-[92vh]"
    >
      <div className="flex flex-col gap-[18px] pt-1 pb-2">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="w-11 h-11 box-border rounded-full border-[3px] border-[#FADCD1] bg-[#D9603B] flex items-center justify-center shrink-0">
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="#FFFFFF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="4.6" r="1.7" fill="#FFFFFF" stroke="none" />
                <path d="M5 8.6c2.4.8 4.6 1.1 7 1.1s4.6-.3 7-1.1" />
                <path d="M12 9.8v4.4" />
                <path d="M12 14.2l-3.4 6" />
                <path d="M12 14.2l3.4 6" />
              </svg>
            </span>
            <h2 className="sv-display m-0 text-[28px] leading-none text-[#1A1A1A]">
              {t.a11yTitle || 'Make Sarvam easier'}<span className="text-[#D9603B]">.</span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="sv-press w-11 h-11 box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center shrink-0"
            aria-label={t.close || 'Close'}
          >
            <CloseIcon className="w-[18px] h-[18px]" />
          </button>
        </div>

        <button
          type="button"
          aria-pressed={dark}
          onClick={() => applyDarkTheme(!dark)}
          className="sv-press h-14 px-4 rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-between text-[16px] font-bold"
        >
          <span className="inline-flex items-center gap-2.5">
            {dark ? <IconSun size={20} /> : <IconMoon size={20} />}
            {dark ? (t.lightTheme || 'Light') : (t.darkTheme || 'Dark')}
          </span>
          <span className="text-[13px]">{dark ? (t.onWord || 'On') : (t.offWord || 'Off')}</span>
        </button>

        <div className="grid grid-cols-3 gap-2.5">
          {tiles.map((tile) => (
            <button
              key={tile.id}
              type="button"
              aria-pressed={tile.on}
              onClick={tile.toggle}
              className="sv-press flex flex-col items-center gap-2 px-1.5 pt-3.5 pb-3 rounded-[22px] border-[1.5px] border-[#1A1A1A] text-[#1A1A1A]"
              style={{ background: tile.on ? '#E9B44C' : 'transparent', color: tile.on ? '#1A1A1A' : undefined }}
            >
              <span className="w-[52px] h-[52px] box-border rounded-full border-[1.5px] border-[#1A1A1A] flex items-center justify-center" style={{ background: tile.bg, color: tile.ink }}>
                {tile.id === 'big' || tile.id === 'lang' ? (
                  <span className="text-[20px] font-extrabold" style={{ color: tile.ink }}>{tile.glyph}</span>
                ) : tile.id === 'speak' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tile.ink} strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M4 9.5v5h3.5L12 18V6L7.5 9.5z" /><path d="M15.5 9a4 4 0 0 1 0 6" /><path d="M18 6.5a7.5 7.5 0 0 1 0 11" /></svg>
                ) : tile.id === 'contrast' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke={tile.ink} strokeWidth="2.2" /><path d="M12 4a8 8 0 0 1 0 16z" fill={tile.ink} /></svg>
                ) : tile.id === 'simple' ? (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tile.ink} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><path d="M5 7h14M5 12h10M5 17h6" /></svg>
                ) : (
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke={tile.ink} strokeWidth="2.2" strokeLinecap="round" aria-hidden="true"><circle cx="12" cy="13" r="7.5" /><path d="M12 9v4l2.5 2" /><path d="M10 3h4" /></svg>
                )}
              </span>
              <span className="text-[13.5px] font-semibold leading-[1.2] text-center">{tile.label}</span>
              <span className="text-[12px] font-bold px-2.5 py-0.5 rounded-[10px]" style={tile.on ? { background: 'var(--sv-fill)', color: 'var(--sv-on-dark)' } : { border: '1.5px solid var(--sv-fill)', color: 'var(--sv-ink)' }}>
                {tile.on ? (t.onWord || 'On') : (t.offWord || 'Off')}
              </span>
            </button>
          ))}
        </div>

        <div className="flex flex-col gap-2.5">
          <span className="text-[12.5px] font-bold tracking-[1.2px] text-[#575B58]">{(t.textSize || 'TEXT SIZE').toUpperCase()}</span>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: t.normalText || 'Normal text', size: 100 as const, px: 16 },
              { label: t.largeText || 'Large text', size: 130 as const, px: 20 },
              { label: t.extraLargeText || 'Extra large text', size: 150 as const, px: 26 },
            ].map((z) => {
              const selected = (z.size === 100 && sizeIndex === 0) || (z.size === 130 && sizeIndex === 1) || (z.size === 150 && sizeIndex === 2)
              return (
                <button
                  key={z.size}
                  type="button"
                  aria-pressed={selected}
                  aria-label={z.label}
                  onClick={() => handleUpdate('textSize', z.size)}
                  className="sv-press h-12 rounded-2xl border-[1.5px] border-[#1A1A1A] font-extrabold text-[#1A1A1A]"
                  style={{ background: selected ? '#E9B44C' : 'transparent', color: selected ? '#1A1A1A' : undefined, fontSize: z.px }}
                >
                  A
                </button>
              )
            })}
          </div>
        </div>

        <p className="m-0 text-[15px] leading-[1.5] text-[#3B3E3C] border-[1.5px] border-[#1A1A1A] rounded-[28px] px-4 py-3.5">
          {t.preview || 'Preview'}:{' '}
          <span style={{ fontSize: previewPx, fontWeight: 700, background: settings.highContrast ? 'var(--sv-fill)' : 'transparent', color: settings.highContrast ? 'var(--sv-on-dark)' : 'var(--sv-ink)', padding: settings.highContrast ? '2px 4px' : undefined }}>
            {t.a11yPreview || 'Your claim of ₹31,200 is approved.'}
          </span>
        </p>

        <div className="flex flex-col gap-2">
          <button type="button" onClick={() => handleUpdate('reduceMotion', !settings.reduceMotion)} className="sv-press h-12 rounded-full border-[1.5px] border-[#1A1A1A] px-4 text-left text-[15px] font-semibold" style={{ background: settings.reduceMotion ? '#E9B44C' : 'transparent', color: settings.reduceMotion ? '#1A1A1A' : undefined }}>
            {t.reduceMotion || 'Reduce motion'}
          </button>
          <button type="button" onClick={() => handleUpdate('largerTapTargets', !settings.largerTapTargets)} className="sv-press h-12 rounded-full border-[1.5px] border-[#1A1A1A] px-4 text-left text-[15px] font-semibold" style={{ background: settings.largerTapTargets ? '#E9B44C' : 'transparent', color: settings.largerTapTargets ? '#1A1A1A' : undefined }}>
            {t.largerTapTargets || 'Larger tap targets'}
          </button>
          <button type="button" onClick={handleReset} className="sv-press h-12 rounded-full border-[1.5px] border-[#1A1A1A] text-[15px] font-semibold">
            {t.reset || 'Reset all to defaults'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
