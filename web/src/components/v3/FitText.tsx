import { useLayoutEffect, useRef } from 'react'
import { fittedPx } from '../../utils/fitText.js'

/** One-line figure that shrinks to its box and never paints outside it. */
export default function FitText({
  text,
  max = 44,
  min = 15,
  className = '',
}: {
  text: string
  max?: number
  min?: number
  className?: string
}) {
  const ref = useRef<HTMLSpanElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    const box = el?.parentElement
    if (!el || !box) return
    const fit = () => {
      el.style.fontSize = `${max}px`
      el.style.width = 'max-content'
      el.style.maxWidth = 'none'
      const size = fittedPx(el.scrollWidth, box.clientWidth, max, min)
      el.style.fontSize = `${size}px`
      el.style.width = '100%'
      el.style.maxWidth = '100%'
    }
    fit()
    void document.fonts?.ready.then(() => {
      if (el.isConnected) fit()
    })
    if (typeof ResizeObserver === 'undefined') return
    const obs = new ResizeObserver(fit)
    obs.observe(box)
    return () => obs.disconnect()
  }, [text, max, min])
  return (
    <span ref={ref} className={`sv-fit-figure sv-display tabular-nums ${className}`} style={{ fontSize: max }}>
      {text}
    </span>
  )
}
