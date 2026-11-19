/**
 * Listen v3 helpers (pure, tested): exact sentence timings from the voice server, the sentence
 * being read at a time, and the centre-ruler maths (drag left = forward).
 */

export interface SpeechSegment {
  text: string
  start: number
  end: number
}

/** Parses the X-Sarvam-Segments header value (base64 of UTF-8 JSON). Bad input gives []. */
export function parseSegmentsHeader(value: string | null | undefined): SpeechSegment[] {
  if (!value) return []
  try {
    const binary = atob(value.trim())
    const bytes = new Uint8Array(binary.length)
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
    const list = JSON.parse(new TextDecoder('utf-8').decode(bytes))
    return cleanSegments(list)
  } catch {
    return []
  }
}

/** Keeps well-formed segments, sorted by start. */
export function cleanSegments(list: unknown): SpeechSegment[] {
  if (!Array.isArray(list)) return []
  return list
    .filter(
      (s): s is SpeechSegment =>
        !!s &&
        typeof (s as SpeechSegment).text === 'string' &&
        (s as SpeechSegment).text.trim() !== '' &&
        Number.isFinite((s as SpeechSegment).start) &&
        Number.isFinite((s as SpeechSegment).end) &&
        (s as SpeechSegment).end >= (s as SpeechSegment).start
    )
    .map((s) => ({ text: s.text.trim(), start: s.start, end: s.end }))
    .sort((a, b) => a.start - b.start)
}

/**
 * The sentence being read at `time`: the last one that has started (the one just read stays up
 * through the short pause before the next). Same rule as the Live Activity.
 */
export function segmentIndexAt(segments: SpeechSegment[], time: number): number {
  if (!segments.length) return 0
  let found = 0
  for (let i = 0; i < segments.length; i++) {
    if (segments[i].start <= time + 0.05) found = i
  }
  return found
}

/** Estimate when there are no timings: by the share of characters already spoken. */
export function estimatedIndexAt(sentences: string[], time: number, total: number): number {
  if (!sentences.length || total <= 0) return 0
  const ratio = Math.min(0.999, Math.max(0, time / total))
  const totalChars = sentences.reduce((acc, s) => acc + s.length, 0) || 1
  let accumulated = 0
  for (let i = 0; i < sentences.length; i++) {
    accumulated += sentences[i].length
    if (ratio <= accumulated / totalChars) return i
  }
  return sentences.length - 1
}

/** In-app ruler: 18 px per second, label every 5 s (approved prototype). */
export const RULER_PX_PER_SECOND = 18

/** Position after dragging the ruler by dx px from where the drag started (left = forward). */
export function dragToTime(startTime: number, dx: number, duration: number, pxPerSecond = RULER_PX_PER_SECOND): number {
  const t = startTime - dx / pxPerSecond
  return Math.max(0, Math.min(Math.max(0, duration), t))
}

/** "0:13" (minutes without padding, like the prototype). */
export function clockTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds <= 0) return '0:00'
  const m = Math.floor(seconds / 60)
  const s = Math.floor(seconds % 60)
  return `${m}:${String(s).padStart(2, '0')}`
}

/** Screen-reader text for the position: "0:13 of 0:28". */
export function positionText(time: number, duration: number): string {
  return `${clockTime(time)} of ${clockTime(duration)}`
}
