import { useState, useEffect } from 'react'
import type { A11ySettings } from '../types'
import Sheet from './Sheet'
import { CloseIcon } from './icons'

interface A11ySheetProps {
  isOpen: boolean
  onClose: () => void
  t: Record<string, string>
}

export const DEFAULT_A11Y_SETTINGS: A11ySettings = {
  textSize: 100,
  lineSpacing: 'normal',
  easyRead: false,
  highContrast: false,
  reduceMotion: false,
  largerTapTargets: false,
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

  try {
    localStorage.setItem('sarvam.a11y', JSON.stringify(settings))
  } catch {}
}

export default function A11ySheet({ isOpen, onClose, t }: A11ySheetProps) {
  const [settings, setSettings] = useState<A11ySettings>(getStoredA11ySettings)

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

  return (
    <Sheet
      isOpen={isOpen}
      onClose={onClose}
      title={t.makeEasierToRead || 'Make it easier to read'}
      maxHeight="max-h-[92vh]"
    >
      <div className="flex flex-col gap-5 pt-1">
        {/* Header */}
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-bold text-[#15171A]">
            {t.makeEasierToRead || 'Make it easier to read'}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="p-2 text-[#5E636B] hover:text-[#15171A] rounded-full hover:bg-[#F0F0EB] transition-colors"
            aria-label={t.close || 'Close'}
          >
            <CloseIcon className="w-5 h-5" />
          </button>
        </div>

        {/* Live Preview Card */}
        <div className="bg-[#FBF7EF] border border-[#F1EBDD] rounded-2xl p-4 flex flex-col gap-1.5 shadow-inner">
          <span className="text-[11px] font-semibold uppercase tracking-wider text-[#5E636B]">
            {t.preview || 'Preview'}
          </span>
          <p
            className="text-base text-[#15171A]"
            style={{
              fontSize: `${(settings.textSize / 100) * 16}px`,
              lineHeight: settings.lineSpacing === 'relaxed' ? 1.9 : 1.5,
              letterSpacing: settings.easyRead ? '0.04em' : 'normal',
              fontFamily: settings.easyRead
                ? '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif'
                : undefined,
            }}
          >
            Your health insurance renewal premium of ₹14,500 is due by 15 November 2026.
          </p>
        </div>

        {/* Options List */}
        <div className="flex flex-col gap-4">
          {/* 1. Text Size Chips */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[#15171A]">
              {t.textSize || 'Text size'}
            </span>
            <div className="grid grid-cols-4 gap-2">
              {[100, 115, 130, 150].map((size) => (
                <button
                  key={size}
                  type="button"
                  onClick={() => handleUpdate('textSize', size as any)}
                  className={`py-2 rounded-xl text-xs font-bold transition-all ${
                    settings.textSize === size
                      ? 'bg-[#1E1838] text-white shadow-sm'
                      : 'bg-[#F0F0EB] text-[#5E636B] hover:text-[#15171A]'
                  }`}
                >
                  {size}%
                </button>
              ))}
            </div>
          </div>

          {/* 2. Line Spacing */}
          <div className="flex flex-col gap-2">
            <span className="text-xs font-semibold text-[#15171A]">
              {t.lineSpacing || 'Line spacing'}
            </span>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleUpdate('lineSpacing', 'normal')}
                className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                  settings.lineSpacing === 'normal'
                    ? 'bg-[#1E1838] text-white shadow-sm'
                    : 'bg-[#F0F0EB] text-[#5E636B] hover:text-[#15171A]'
                }`}
              >
                {t.lineSpacingNormal || 'Normal'}
              </button>
              <button
                type="button"
                onClick={() => handleUpdate('lineSpacing', 'relaxed')}
                className={`py-2 rounded-xl text-xs font-semibold transition-all ${
                  settings.lineSpacing === 'relaxed'
                    ? 'bg-[#1E1838] text-white shadow-sm'
                    : 'bg-[#F0F0EB] text-[#5E636B] hover:text-[#15171A]'
                }`}
              >
                {t.lineSpacingRelaxed || 'Relaxed'}
              </button>
            </div>
          </div>

          {/* 3. Toggles */}
          <div className="divide-y divide-[#F0F0EB]">
            {/* Easier to Read Mode */}
            <label className="py-3 flex items-center justify-between cursor-pointer">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#15171A]">
                  {t.easyReadMode || 'Easier-to-read mode'}
                </span>
                <span className="text-xs text-[#5E636B]">
                  System font stack, wider letter spacing
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.easyRead}
                onChange={(e) => handleUpdate('easyRead', e.target.checked)}
                className="w-5 h-5 rounded text-[#5B52D6] focus:ring-0"
              />
            </label>

            {/* High Contrast */}
            <label className="py-3 flex items-center justify-between cursor-pointer">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#15171A]">
                  {t.highContrast || 'High contrast'}
                </span>
                <span className="text-xs text-[#5E636B]">
                  Higher visual distinction and crisp edges
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.highContrast}
                onChange={(e) => handleUpdate('highContrast', e.target.checked)}
                className="w-5 h-5 rounded text-[#5B52D6] focus:ring-0"
              />
            </label>

            {/* Reduce Motion */}
            <label className="py-3 flex items-center justify-between cursor-pointer">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#15171A]">
                  {t.reduceMotion || 'Reduce motion'}
                </span>
                <span className="text-xs text-[#5E636B]">
                  Turns off card slide-ins and visual waveforms
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.reduceMotion}
                onChange={(e) => handleUpdate('reduceMotion', e.target.checked)}
                className="w-5 h-5 rounded text-[#5B52D6] focus:ring-0"
              />
            </label>

            {/* Larger Tap Targets */}
            <label className="py-3 flex items-center justify-between cursor-pointer">
              <div className="flex flex-col">
                <span className="text-sm font-semibold text-[#15171A]">
                  {t.largerTapTargets || 'Larger tap targets'}
                </span>
                <span className="text-xs text-[#5E636B]">
                  Increases interactive button padding to min 52px
                </span>
              </div>
              <input
                type="checkbox"
                checked={settings.largerTapTargets}
                onChange={(e) => handleUpdate('largerTapTargets', e.target.checked)}
                className="w-5 h-5 rounded text-[#5B52D6] focus:ring-0"
              />
            </label>
          </div>
        </div>

        {/* Reset button */}
        <div className="pt-2">
          <button
            type="button"
            onClick={handleReset}
            className="w-full py-2.5 bg-[#F0F0EB] text-[#15171A] hover:bg-[#E6E6E1] text-xs font-bold rounded-xl transition-colors"
          >
            {t.reset || 'Reset all to defaults'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}
