import { useState, useEffect } from 'react'

export type ReadingStage = 'reading' | 'checking' | 'writing'

export interface ReadingStageOptions {
  files?: File[]
  targetLanguage?: string
  pageCount?: number
  currentStage?: ReadingStage
}

export interface ReadingStageResult {
  stage: ReadingStage
  progress: number
  sourceKind: 'pdf' | 'photo'
  fileCount: number
  pageCount: number
  targetLanguage: string
}

/**
 * useReadingStage Hook
 * Eases smoothly towards the next stage boundary without prematurely crossing it.
 * reading: 0.05 -> 0.33
 * checking: 0.35 -> 0.66
 * writing: 0.68 -> 0.95
 */
export function useReadingStage(options?: ReadingStageOptions): ReadingStageResult {
  const files = options?.files || []
  const targetLanguage = options?.targetLanguage || 'en'
  const fileCount = Math.max(1, files.length)
  const isPdf = files.some(
    (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf')
  )
  const sourceKind: 'pdf' | 'photo' = isPdf ? 'pdf' : 'photo'
  const pageCount = options?.pageCount || (isPdf ? 1 : fileCount)

  const [stage, setStage] = useState<ReadingStage>(options?.currentStage || 'reading')
  const [progress, setProgress] = useState<number>(0.08)

  // Sync external stage override if provided
  useEffect(() => {
    if (options?.currentStage) {
      setStage(options.currentStage)
    }
  }, [options?.currentStage])

  // Progress animation and easing
  useEffect(() => {
    const startTime = Date.now()

    // Determine boundaries for current stage
    let base = 0.05
    let max = 0.33
    if (stage === 'checking') {
      base = 0.35
      max = 0.66
    } else if (stage === 'writing') {
      base = 0.68
      max = 0.95
    }

    const interval = setInterval(() => {
      const elapsedSec = (Date.now() - startTime) / 1000

      // Stage automatic progression if currentStage not controlled
      if (!options?.currentStage) {
        if (elapsedSec > 4 && stage === 'reading') {
          setStage('checking')
          return
        }
        if (elapsedSec > 9 && stage === 'checking') {
          setStage('writing')
          return
        }
      }

      // Asymptotic approach: base + (max - base) * (1 - e^(-t / tau))
      const tau = 8.0 // time constant
      const fraction = 1 - Math.exp(-elapsedSec / tau)
      const current = base + (max - base) * fraction
      setProgress(Math.min(max, Math.max(base, current)))
    }, 100)

    return () => clearInterval(interval)
  }, [stage, options?.currentStage])

  return {
    stage,
    progress: Number(progress.toFixed(2)),
    sourceKind,
    fileCount,
    pageCount,
    targetLanguage,
  }
}

export default useReadingStage
