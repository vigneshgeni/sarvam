import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from 'react'
import { RULER_PX_PER_SECOND, clockTime, dragToTime } from '../utils/lyrics'

interface ListenRulerProps {
  /** Last position reported by the player, in seconds. */
  time: number
  duration: number
  playing: boolean
  rate: number
  /** Loading, device voice (not seekable) or no audio yet: no dragging. */
  disabled?: boolean
  /** Live seek while the finger moves (called at most every ~150 ms). */
  onScrub: (seconds: number) => void
  /** Exact seek when the finger lifts. */
  onScrubEnd: (seconds: number) => void
  onScrubStart?: () => void
}

const PPS = RULER_PX_PER_SECOND
const LIVE_SEEK_MS = 150

function reduceMotion(): boolean {
  try {
    if (document.documentElement.dataset.reduceMotion === 'true') return true
    return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false
  } catch {
    return false
  }
}

/**
 * Centre-playhead ruler (approved Listen v3): the ruler slides under a fixed gold mark.
 * Drag left to go forward, right to go back. The voice follows the finger (live seeking) and
 * lands exactly where the finger lifts; play / pause stays as it was.
 * Between player updates the strip glides on its own (requestAnimationFrame), so it moves
 * smoothly instead of jumping every poll.
 */
export default function ListenRuler({
  time,
  duration,
  playing,
  rate,
  disabled = false,
  onScrub,
  onScrubEnd,
  onScrubStart,
}: ListenRulerProps) {
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const stripRef = useRef<HTMLDivElement | null>(null)
  const [width, setWidth] = useState(322)
  const [dragTime, setDragTime] = useState<number | null>(null)
  const dragRef = useRef<{ x: number; t: number; id: number } | null>(null)
  const lastLiveSeekRef = useRef(0)
  const pendingLiveRef = useRef<number | null>(null)
  const liveTimerRef = useRef<number | null>(null)
  // Extrapolation base: where the audio was, and when.
  const baseRef = useRef({ t: time, at: performance.now() })
  const propsRef = useRef({ playing, rate, duration, dragTime, width })
  propsRef.current = { playing, rate, duration, dragTime, width }

  const dur = Math.max(0, duration)

  // Measure the visible width (the gold mark sits in the middle).
  useEffect(() => {
    const el = viewportRef.current
    if (!el) return
    const measure = () => setWidth(el.clientWidth || 322)
    measure()
    if (typeof ResizeObserver === 'undefined') return
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  // New report from the player: soft-correct small drift, jump on a real seek.
  useEffect(() => {
    const now = performance.now()
    const p = propsRef.current
    const predicted = p.playing
      ? baseRef.current.t + ((now - baseRef.current.at) / 1000) * (p.rate || 1)
      : baseRef.current.t
    const diff = time - predicted
    baseRef.current = Math.abs(diff) < 0.35 && p.playing
      ? { t: predicted + diff * 0.35, at: now }
      : { t: time, at: now }
  }, [time])

  useEffect(() => {
    baseRef.current = { t: time, at: performance.now() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playing, rate])

  // Glide loop: moves the strip every frame without re-rendering the sheet.
  useEffect(() => {
    let frame = 0
    const tick = () => {
      const p = propsRef.current
      const strip = stripRef.current
      if (strip) {
        let t: number
        if (p.dragTime !== null) t = p.dragTime
        else if (p.playing && !reduceMotion()) {
          t = baseRef.current.t + ((performance.now() - baseRef.current.at) / 1000) * (p.rate || 1)
        } else t = baseRef.current.t
        t = Math.max(0, Math.min(Math.max(0, p.duration), t))
        strip.style.transform = `translateX(${(p.width / 2 - t * PPS).toFixed(2)}px)`
      }
      frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(frame)
  }, [])

  useEffect(() => () => {
    if (liveTimerRef.current) window.clearTimeout(liveTimerRef.current)
  }, [])

  const flushLiveSeek = () => {
    liveTimerRef.current = null
    const t = pendingLiveRef.current
    pendingLiveRef.current = null
    if (t === null) return
    lastLiveSeekRef.current = performance.now()
    onScrub(t)
  }

  const queueLiveSeek = (t: number) => {
    pendingLiveRef.current = t
    const since = performance.now() - lastLiveSeekRef.current
    if (since >= LIVE_SEEK_MS) {
      if (liveTimerRef.current) window.clearTimeout(liveTimerRef.current)
      flushLiveSeek()
    } else if (!liveTimerRef.current) {
      liveTimerRef.current = window.setTimeout(flushLiveSeek, LIVE_SEEK_MS - since)
    }
  }

  const currentShown = (): number => {
    const p = propsRef.current
    const t = p.playing && !reduceMotion()
      ? baseRef.current.t + ((performance.now() - baseRef.current.at) / 1000) * (p.rate || 1)
      : baseRef.current.t
    return Math.max(0, Math.min(dur, t))
  }

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (disabled || dur <= 0) return
    e.currentTarget.setPointerCapture?.(e.pointerId)
    const t = currentShown()
    dragRef.current = { x: e.clientX, t, id: e.pointerId }
    setDragTime(t)
    onScrubStart?.()
  }

  const onPointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    const t = dragToTime(d.t, e.clientX - d.x, dur)
    setDragTime(t)
    queueLiveSeek(t)
  }

  const endDrag = (e: ReactPointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const d = dragRef.current
    if (!d || d.id !== e.pointerId) return
    dragRef.current = null
    if (liveTimerRef.current) {
      window.clearTimeout(liveTimerRef.current)
      liveTimerRef.current = null
    }
    pendingLiveRef.current = null
    const t = cancelled ? d.t : dragToTime(d.t, e.clientX - d.x, dur)
    baseRef.current = { t, at: performance.now() }
    setDragTime(null)
    onScrubEnd(t)
  }

  const shown = dragTime ?? time
  const lastSecond = Math.ceil(dur)
  const ticks: ReactNode[] = []
  const labels: ReactNode[] = []
  for (let v = 0; v <= lastSecond; v++) {
    const major = v % 5 === 0
    ticks.push(
      <i
        key={v}
        className="listen-ruler-tick"
        style={{
          left: `${v * PPS - 2}px`,
          height: `${major ? 38 : 20}px`,
          background: v <= shown ? '#E9B44C' : '#5B5F5C',
        }}
      />
    )
    if (major) {
      labels.push(
        <span
          key={`l${v}`}
          className="listen-ruler-label tabular-nums"
          style={{ left: `${v * PPS}px`, color: Math.abs(v - shown) < 2.5 ? '#E9B44C' : '#8D928F' }}
        >
          {clockTime(v)}
        </span>
      )
    }
  }

  return (
    <div
      ref={viewportRef}
      className={`listen-ruler${dragTime !== null ? ' is-dragging' : ''}${disabled ? ' is-disabled' : ''}`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(e) => endDrag(e, false)}
      onPointerCancel={(e) => endDrag(e, true)}
      onLostPointerCapture={(e) => endDrag(e, false)}
      aria-hidden="true"
    >
      <div ref={stripRef} className="listen-ruler-strip" style={{ width: `${Math.ceil(dur * PPS + 8)}px` }}>
        {labels}
        {ticks}
      </div>
      <div className="listen-ruler-playhead">
        <i />
        <b />
      </div>
    </div>
  )
}
