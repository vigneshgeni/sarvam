import { useState } from 'react'
import { ensureOnboardingFonts } from '../../design/indicFont'
import { IconArrow } from '../../ui/icons'

const GREET: [string, string, string, string][] = [
  ['வணக்கம்', 'Noto Sans Tamil', '#F4F5F2', '#1A1A1A'],
  ['नमस्ते', 'Noto Sans Devanagari', '#E9B44C', '#1A1A1A'],
  ['నమస్కారం', 'Noto Sans Telugu', '#D9603B', '#1A1A1A'],
  ['നമസ്കാരം', 'Noto Sans Malayalam', '#1A1A1A', '#F4F5F2'],
  ['नमस्कार', 'Noto Sans Devanagari', '#F4F5F2', '#1A1A1A'],
  ['নমস্কার', 'Noto Sans Bengali', '#E9B44C', '#1A1A1A'],
  ['ନମସ୍କାର', 'Noto Sans Oriya', '#D9603B', '#1A1A1A'],
  ['ನಮಸ್ಕಾರ', 'Noto Sans Kannada', '#1A1A1A', '#F4F5F2'],
  ['Hello', 'DM Sans', '#F4F5F2', '#1A1A1A'],
]
const SHIFTS = [-46, 34, -22, 50, -54, 20, -30, 42, -6]

function finish(onDone: () => void) {
  try {
    sessionStorage.setItem('sarvam.onboardingSeen', '1')
  } catch {
    /* ignore */
  }
  onDone()
}

export default function Onboarding({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0)
  ensureOnboardingFonts()
  return (
    <div className="sv-screen-in box-border h-[100dvh] max-h-[100dvh] overflow-hidden bg-[#F4F5F2] text-[#1A1A1A] px-5 pt-[max(12px,env(safe-area-inset-top))] pb-[max(12px,env(safe-area-inset-bottom))] flex flex-col gap-3">
      <div className="flex items-center justify-between shrink-0">
        {step === 0 ? (
          <span className="text-[26px] font-bold tracking-[-0.8px]">
            Sarvam<span className="text-[#D9603B]">.</span>
          </span>
        ) : (
          <button type="button" aria-label="Back" onClick={() => setStep((s) => s - 1)} className="sv-press w-12 h-12 rounded-full border-[1.5px] border-[#1A1A1A] bg-transparent flex items-center justify-center">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M15 5l-7 7 7 7" /></svg>
          </button>
        )}
        <button type="button" onClick={() => finish(onDone)} className="h-11 px-4 text-[15px] font-semibold text-[#1A1A1A] bg-transparent border-0">
          Skip
        </button>
      </div>

      {step === 0 && (
        <div className="flex-1 min-h-0 bg-[#034F46] rounded-[32px] relative overflow-hidden flex flex-col items-center justify-center gap-1.5 p-4">
          <span aria-hidden="true" className="absolute w-[220px] h-[220px] rounded-full border-2 border-dashed border-[#3E7F75]" />
          {GREET.map(([word, font, bg, ink], i) => (
            <span
              key={word}
              className="pill relative inline-flex items-center h-8 px-3.5 rounded-full border-[1.5px] border-[#1A1A1A] text-[15px] font-semibold shrink-0"
              style={{
                fontFamily: `${font}, sans-serif`,
                background: bg,
                color: ink,
                marginLeft: Math.round(SHIFTS[i] * 1.4),
                rotate: i % 2 ? '3deg' : '-3deg',
                animationDelay: `${i * 0.35}s`,
              }}
            >
              {word}
            </span>
          ))}
        </div>
      )}
      {step === 1 && (
        <div className="rise flex-1 min-h-0 bg-[#1A1A1A] rounded-[32px] flex flex-col items-center justify-center gap-3 p-5">
          <div className="w-[150px] h-[190px] rounded-[18px] border-[1.5px] border-[#F4F5F2] bg-[#F4F5F2] p-4 flex flex-col gap-2">
            <span className="h-2 w-2/3 rounded bg-[#1A1A1A]" />
            <span className="h-1.5 w-full rounded bg-[#E2E5E0]" />
            <span className="h-1.5 w-4/5 rounded bg-[#E2E5E0]" />
          </div>
          <div className="w-[210px] rounded-3xl bg-[#F0D7FF] border-[1.5px] border-[#1A1A1A] p-4 text-[14px] font-semibold text-[#1A1A1A]">
            Pay ₹2,450 by 12 Nov. That is 29 days away.
          </div>
          <span className="inline-flex items-center h-8 px-3 rounded-full bg-[#D9603B] border-[1.5px] border-[#1A1A1A] text-[12px] font-bold">
            Checked with your document
          </span>
        </div>
      )}
      {step === 2 && (
        <div className="flex-1 min-h-0 bg-[#E9B44C] rounded-[32px] relative overflow-hidden flex items-center justify-center">
          <span className="ring absolute w-40 h-40 rounded-full border-[3px] border-[#034F46]" />
          <span className="ring absolute w-40 h-40 rounded-full border-[3px] border-[#034F46]" style={{ animationDelay: '1.2s' }} />
          <span className="relative w-20 h-20 rounded-full bg-[#034F46] border-[1.5px] border-[#1A1A1A] flex items-center justify-center text-[#F4F5F2] text-2xl">▶</span>
          <span className="absolute right-8 bottom-10 w-16 rounded-2xl border-[1.5px] border-[#1A1A1A] overflow-hidden bg-[#F4F5F2] text-center">
            <span className="block bg-[#D9603B] text-[11px] font-bold py-1">NOV</span>
            <span className="sv-display block text-[28px] leading-none py-1">30</span>
          </span>
        </div>
      )}

      <div className="flex flex-col gap-2 shrink-0">
        <h1 className="sv-display m-0 text-[34px] leading-[1.05] tracking-[-0.4px]">
          {step === 0 && 'Read any document, in your language.'}
          {step === 1 && 'Plain words, checked against the page.'}
          {step === 2 && 'Listen, or ask a question.'}
        </h1>
        <p className="m-0 text-[16px] leading-[1.4] text-[#3B3E3C]">
          {step === 0 && 'Photograph a bill, letter or report. Sarvam reads it in Tamil, Hindi, Telugu and six more.'}
          {step === 1 && 'Amounts and dates stay as they are printed. Sarvam marks what it found in your document.'}
          {step === 2 && 'Hear the explanation, then ask about a line you do not understand.'}
        </p>
      </div>

      <div className="flex items-center justify-between shrink-0">
        <span aria-label={`Step ${step + 1} of 3`} className="flex gap-1.5">
          {[0, 1, 2].map((i) => (
            <span key={i} className="h-2 rounded" style={{ width: i === step ? 26 : 8, background: i === step ? 'var(--sv-fill)' : '#C4C8C3' }} />
          ))}
        </span>
        {step < 2 ? (
          <button type="button" onClick={() => setStep((s) => s + 1)} className="sv-press h-[52px] shrink-0 inline-flex items-center gap-2.5 px-[22px] rounded-full border-[1.5px] border-[#1A1A1A] bg-[#E9B44C] text-[#1A1A1A] text-[16px] font-bold">
            Next
            <IconArrow size={18} stroke="#1A1A1A" />
          </button>
        ) : (
          <button type="button" onClick={() => finish(onDone)} className="sv-press h-[52px] shrink-0 inline-flex items-center gap-2.5 px-[22px] rounded-full border-[1.5px] border-[#1A1A1A] bg-[#1A1A1A] text-[#F4F5F2] text-[16px] font-bold">
            Get started
          </button>
        )}
      </div>
    </div>
  )
}
