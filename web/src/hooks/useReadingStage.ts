import { useEffect, useState } from 'react'

export type ReadingStage = 'reading' | 'checking' | 'writing'

export interface ReadingStageOptions {
  files?: File[]
  targetLanguage?: string
  pageCount?: number
  currentStage?: ReadingStage
  /** True once the explanation has arrived. The ring reaches 100 only then. */
  arrived?: boolean
}

export interface ReadingStageResult {
  stage: ReadingStage
  progress: number
  percent: number
  almost: boolean
  sourceKind: 'pdf' | 'photo'
  fileCount: number
  pageCount: number
  targetLanguage: string
  expectedSeconds: number
}

export function expectedReadingSeconds(photos: number, pages: number): number {
  if (photos > 0) return 9 * Math.max(1, photos)
  return 8 + 6 * Math.max(1, pages)
}

/** Ease inside the current band. The next band starts where this one ends. */
export function readingProgress(elapsedSec: number, expectedSec: number): {
  stage: ReadingStage
  percent: number
  almost: boolean
} {
  const total = Math.max(1, expectedSec)
  if (elapsedSec >= total) return { stage: 'writing', percent: 95, almost: true }
  const t = Math.max(0, elapsedSec) / total
  const ease = (start: number, end: number, unit: number) => {
    const x = Math.min(1, Math.max(0, unit))
    return start + (end - start) * (1 - (1 - x) ** 2)
  }
  if (t < 0.35) return { stage: 'reading', percent: ease(0, 35, t / 0.35), almost: false }
  if (t < 0.7) return { stage: 'checking', percent: ease(35, 70, (t - 0.35) / 0.35), almost: false }
  return { stage: 'writing', percent: ease(70, 95, (t - 0.7) / 0.3), almost: false }
}

export function useReadingStage(options?: ReadingStageOptions): ReadingStageResult {
  const files = options?.files || []
  const fileKey = files.map((file) => `${file.name}:${file.size}:${file.lastModified}`).join('|')
  const targetLanguage = options?.targetLanguage || 'en'
  const fileCount = Math.max(1, files.length)
  const isPdf = files.some(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  )
  const sourceKind: 'pdf' | 'photo' = isPdf ? 'pdf' : 'photo'
  const photos = files.filter((f) => f.type.startsWith('image/')).length
  const [pageCount, setPageCount] = useState(options?.pageCount || (isPdf ? 1 : fileCount))
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (options?.pageCount) {
      setPageCount(options.pageCount)
      return
    }
    if (!isPdf) {
      setPageCount(fileCount)
      return
    }
    let cancelled = false
    Promise.all(files.filter((f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')).map(countPdfPages))
      .then((counts) => {
        if (!cancelled) setPageCount(Math.max(1, counts.reduce((sum, n) => sum + n, 0)))
      })
      .catch(() => {
        if (!cancelled) setPageCount(1)
      })
    return () => {
      cancelled = true
    }
  }, [fileKey, fileCount, isPdf, options?.pageCount])

  useEffect(() => {
    if (options?.arrived) return
    const started = Date.now()
    const timer = setInterval(() => setElapsed((Date.now() - started) / 1000), 100)
    return () => clearInterval(timer)
  }, [fileKey, options?.arrived])

  const expectedSeconds = expectedReadingSeconds(photos, pageCount)
  const live = options?.arrived
    ? { stage: 'writing' as const, percent: 100, almost: false }
    : readingProgress(elapsed, expectedSeconds)

  return {
    stage: options?.currentStage || live.stage,
    progress: Number((live.percent / 100).toFixed(2)),
    percent: Math.round(live.percent),
    almost: live.almost,
    sourceKind,
    fileCount,
    pageCount,
    targetLanguage,
    expectedSeconds,
  }
}

async function countPdfPages(file: File): Promise<number> {
  const slice = file.slice(0, Math.min(file.size, 1_500_000))
  const text = new TextDecoder('latin1').decode(await slice.arrayBuffer())
  return Math.max(1, (text.match(/\/Type\s*\/Page(?!s)/g) || []).length)
}

export default useReadingStage
