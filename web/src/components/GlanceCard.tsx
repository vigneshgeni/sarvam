import { useState, useEffect } from 'react'
import type { GlanceSection } from '../types'
import { getLocalisedDocType } from '../i18n'
import {
  CurrencyRupeeIcon,
  CalendarIcon,
  SparklesIcon,
  EyeIcon,
  CheckIcon,
} from './icons'

interface GlanceCardProps {
  glance?: GlanceSection
  docType?: string
  reportDateIso?: string | null
  lang: string
  t: Record<string, string>
  onCheckOriginal?: (quote?: string, page?: number) => void
}

function CountUpValue({ value }: { value: string }) {
  const [displayValue, setDisplayValue] = useState<string>(value)

  useEffect(() => {
    // If reduced motion is requested, show immediately
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const isReducedByA11y = document.documentElement.getAttribute('data-reduce-motion') === 'true'
    if (prefersReducedMotion || isReducedByA11y) {
      setDisplayValue(value)
      return
    }

    // Try extracting numeric part for count-up
    const match = value.match(/^([^0-9]*)([0-9,.]+)([^0-9]*)$/)
    if (!match) {
      setDisplayValue(value)
      return
    }

    const prefix = match[1]
    const numStr = match[2].replace(/,/g, '')
    const suffix = match[3]
    const targetNum = parseFloat(numStr)

    if (isNaN(targetNum) || targetNum <= 0) {
      setDisplayValue(value)
      return
    }

    const duration = 600 // ms
    const startTime = performance.now()

    const frame = (now: number) => {
      const elapsed = now - startTime
      const progress = Math.min(elapsed / duration, 1)
      const ease = 1 - Math.pow(1 - progress, 3) // ease-out cubic
      const current = Math.floor(targetNum * ease)

      // Reformat with commas if original had commas
      const formattedNum = value.includes(',') ? current.toLocaleString('en-IN') : String(current)
      setDisplayValue(`${prefix}${formattedNum}${suffix}`)

      if (progress < 1) {
        requestAnimationFrame(frame)
      } else {
        setDisplayValue(value)
      }
    }

    requestAnimationFrame(frame)
  }, [value])

  return <span className="tabular-nums font-mono font-bold">{displayValue}</span>
}

export default function GlanceCard({
  glance,
  docType,
  reportDateIso,
  lang,
  t,
  onCheckOriginal,
}: GlanceCardProps) {
  if (!glance) return null

  // Localised doc type
  const docTypeLabel = getLocalisedDocType(lang, docType)

  // Localised formatted date pill
  let formattedDate: string | null = null
  if (reportDateIso) {
    try {
      const d = new Date(reportDateIso)
      if (!isNaN(d.getTime())) {
        formattedDate = new Intl.DateTimeFormat(lang, {
          day: 'numeric',
          month: 'short',
          year: 'numeric',
        }).format(d)
      }
    } catch {
      // Fallback: keep null
    }
  }

  const keyValues = (glance.key_values || []).slice(0, 3)

  return (
    <div className="w-full bg-[#FFFFFF] border border-[#E6E6E1] rounded-[22px] p-5 shadow-sm flex flex-col gap-4 animate-card-in">
      {/* Top Header Pill Row */}
      <div className="flex flex-wrap items-center gap-2">
        {docTypeLabel && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#F0F0EB] text-[#15171A]">
            {docTypeLabel}
          </span>
        )}
        {formattedDate && (
          <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#E8F1FB] text-[#1D5FA8]">
            <CalendarIcon className="w-3.5 h-3.5 mr-1 text-[#1D5FA8]" />
            {formattedDate}
          </span>
        )}
      </div>

      {/* Main Headline */}
      <h2 className="text-xl font-bold text-[#15171A] leading-snug tracking-tight">
        {glance.headline}
      </h2>

      {/* Up to 3 Key Values */}
      {keyValues.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {keyValues.map((kv, idx) => {
            let iconTileBg = 'bg-[#F1ECFB]'
            let iconTileColor = 'text-[#6D45C9]'
            let IconComponent = SparklesIcon

            if (kv.kind === 'amount') {
              iconTileBg = 'bg-[#FFF4D6]'
              iconTileColor = 'text-[#9A6700]'
              IconComponent = CurrencyRupeeIcon
            } else if (kv.kind === 'date') {
              iconTileBg = 'bg-[#E8F1FB]'
              iconTileColor = 'text-[#1D5FA8]'
              IconComponent = CalendarIcon
            }

            return (
              <div
                key={idx}
                className="bg-[#FBF7EF] border border-[#F1EBDD] rounded-2xl p-3.5 flex flex-col justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`w-7 h-7 rounded-lg ${iconTileBg} ${iconTileColor} flex items-center justify-center shrink-0`}
                  >
                    <IconComponent className="w-4 h-4" />
                  </div>
                  <span className="text-xs font-medium text-[#5E636B] leading-tight">
                    {kv.label}
                  </span>
                </div>

                <div className="text-lg text-[#15171A]">
                  <CountUpValue value={kv.value} />
                </div>

                {/* Evidence chip */}
                <div className="pt-0.5">
                  {kv.evidence === 'matched' && (
                    <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#0E5B37] bg-[#E4F3EC] px-2 py-0.5 rounded-md">
                      <CheckIcon className="w-3 h-3 text-[#0E5B37]" />
                      {t.foundInDoc || 'Found in your document'}
                    </span>
                  )}
                  {kv.evidence === 'check_original' && (
                    <button
                      type="button"
                      onClick={() => onCheckOriginal?.()}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-[#475A7A] bg-[#EAEFF7] px-2 py-0.5 rounded-md hover:bg-[#DCE5F2] transition-colors"
                    >
                      <EyeIcon className="w-3 h-3 text-[#475A7A]" />
                      {t.checkAgainstOriginal || 'Check against original'}
                    </button>
                  )}
                  {kv.evidence === 'calculated' && (
                    <span className="inline-flex items-center text-[11px] font-medium text-[#6D45C9] bg-[#F1ECFB] px-2 py-0.5 rounded-md">
                      {t.calculatedChip || 'Calculated'}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
