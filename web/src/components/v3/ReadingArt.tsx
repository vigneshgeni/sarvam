import { useEffect, useState } from 'react'
import type { ReadingLetter } from '../../design/catalog'

function useShownPage(total: number, enabled: boolean) {
  const [page, setPage] = useState(1)
  useEffect(() => {
    setPage(1)
    if (!enabled || total <= 1) return
    const reduceMotion =
      window.matchMedia('(prefers-reduced-motion: reduce)').matches ||
      document.documentElement.getAttribute('data-reduce-motion') === 'true'
    if (reduceMotion) return
    const timer = window.setInterval(() => {
      setPage((current) => (current >= total ? 1 : current + 1))
    }, 1500)
    return () => window.clearInterval(timer)
  }, [enabled, total])
  return Math.min(page, total)
}

export default function ReadingArt({ variant, pages }: { variant: ReadingLetter; pages: number }) {
  const total = Math.max(1, pages)
  const shown = useShownPage(total, variant === 'B')
  if (variant === 'B') {
    const sheets = Math.min(total, 3)
    return (
      <div className="h-[300px] bg-[#1A1A1A] rounded-[40px] relative overflow-hidden border-[1.5px] border-[#1A1A1A]">
        {Array.from({ length: sheets }, (_, i) => (
          <div key={i} className="pg" style={{ ['--r0' as string]: `${(i - 1) * 8}deg`, ['--r' as string]: `${(i - 1) * 6}deg`, animationDelay: `${i * 0.5}s` }}>
            <span /><span style={{ width: '70%' }} /><span />
          </div>
        ))}
        <div className="flash" />
        <div className="sweep" />
        <span className="absolute bottom-4 left-0 right-0 text-center text-[13px] font-bold text-[#F4F5F2]">
          Page {shown} of {total}
        </span>
      </div>
    )
  }
  if (variant === 'C') {
    const glyphs = ['அ', 'अ', 'అ', 'അ', 'অ', 'ଅ', 'ಅ', 'अ', 'A']
    return (
      <div className="h-[300px] bg-[#E9B44C] rounded-[40px] relative overflow-hidden border-[1.5px] border-[#1A1A1A] flex items-center justify-center">
        <span className="orbit">
          <i style={{ left: '8%', top: '40%', background: '#D9603B' }} />
          <i style={{ right: '10%', top: '18%', background: '#034F46' }} />
          <i style={{ left: '42%', bottom: '6%', background: '#1A1A1A' }} />
        </span>
        {glyphs.map((g, i) => (
          <span key={g + i} className="glyph" style={{ animationDelay: `${i * 0.6}s`, color: '#1A1A1A' }}>{g}</span>
        ))}
      </div>
    )
  }
  if (variant === 'D') {
    return (
      <div className="sv-scan-d h-[300px] bg-[#F4F5F2] rounded-[40px] relative overflow-hidden border-[1.5px] border-[#1A1A1A]">
        <div className="lens" aria-hidden="true">
          <span className="block w-14 h-14 rounded-full border-[3px] border-[#D9603B]" />
        </div>
        <div className="absolute left-8 top-10 right-16 flex flex-col gap-3">
          <span className="mk" style={{ ['--hl' as string]: '#F8D9CB', width: '80%' }} />
          <span className="mk" style={{ ['--hl' as string]: '#CFE5E0', width: '60%', animationDelay: '.4s' }} />
          <span className="mk" style={{ ['--hl' as string]: '#F8D9CB', width: '90%', animationDelay: '.8s' }} />
        </div>
        <span className="chip" style={{ right: 16, top: 28, animationDelay: '.7s' }}>₹ Amount</span>
        <span className="chip" style={{ left: 20, bottom: 70, animationDelay: '1.4s' }}>Due date</span>
        <span className="chip" style={{ right: 24, bottom: 28, animationDelay: '2.7s' }}>To-do</span>
      </div>
    )
  }
  return (
    <div className="sv-scan-a h-[300px] bg-[#034F46] rounded-[40px] relative overflow-hidden flex items-center justify-center border-[1.5px] border-[#1A1A1A]">
      <span aria-hidden="true" className="absolute w-[250px] h-[250px] rounded-full border-2 border-dashed border-[#2E6E64]" />
      <div role="img" aria-label="Sarvam scanning your document" className="relative w-[150px] h-[196px]">
        <div className="absolute inset-0 rotate-[7deg] translate-x-[14px] translate-y-1 bg-[#E9B44C] border-[1.5px] border-[#1A1A1A] rounded-[18px]" />
        <div className="absolute inset-0 bg-[#F4F5F2] border-[1.5px] border-[#1A1A1A] rounded-[18px] p-5 px-4 box-border flex flex-col gap-2.5 overflow-hidden">
          <span className="h-[9px] w-[55%] rounded-[5px] bg-[#1A1A1A]" />
          <span className="ln" />
          <span className="ln w-[78%]" style={{ animationDelay: '.3s' }} />
          <span className="ln w-[88%]" style={{ animationDelay: '.6s' }} />
          <span className="h-[22px] w-full rounded-md bg-[#F8D9CB] border-[1.5px] border-[#1A1A1A] box-border" />
          <span className="ln w-[70%]" style={{ animationDelay: '.9s' }} />
          <span className="ln w-[90%]" style={{ animationDelay: '1.2s' }} />
          <span className="ln w-[60%]" style={{ animationDelay: '1.5s' }} />
          <div className="scanline" aria-hidden="true">
            <span className="absolute left-0 right-0 top-0 h-11 bg-[#D9603B] opacity-20" />
            <span className="absolute left-0 right-0 bottom-0 h-[3px] rounded-sm bg-[#D9603B]" />
          </div>
        </div>
        <span className="bob absolute -right-[54px] bottom-1.5 h-[34px] px-3 box-border border-[1.5px] border-[#1A1A1A] rounded-full bg-[#F4F5F2] inline-flex items-center text-[13px] font-bold">₹</span>
      </div>
    </div>
  )
}
