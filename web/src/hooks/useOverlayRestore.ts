import { useEffect, useState, useCallback } from 'react'
import { restoreActiveOverlay } from './overlayCore'

export interface OverlayRestoreOptions {
  currentData?: any
  onRestore?: (savedData: any) => void
  onClose?: (message?: string) => void
}

export interface OverlayRestoreResult {
  isRestored: boolean
  data: any | null
  restoreSession: () => any | null
}

export { restoreActiveOverlay }

/**
 * Hook to safeguard overlays from blank white screens when backgrounded/returning from WhatsApp.
 * Listens for pageshow and visibilitychange events.
 */
export function useOverlayRestore(options?: OverlayRestoreOptions): OverlayRestoreResult {
  const [data, setData] = useState<any | null>(options?.currentData || null)
  const [isRestored, setIsRestored] = useState<boolean>(false)

  const checkAndRestore = useCallback(() => {
    const outcome = restoreActiveOverlay(data || options?.currentData, {
      onRestore: (saved) => {
        setData(saved)
        setIsRestored(true)
        options?.onRestore?.(saved)
      },
      onClose: (msg) => {
        setData(null)
        setIsRestored(false)
        options?.onClose?.(msg)
      },
    })
    return outcome.data
  }, [data, options])

  useEffect(() => {
    // Initial check on mount
    checkAndRestore()

    if (typeof window === 'undefined') return

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkAndRestore()
      }
    }

    const handlePageShow = () => {
      checkAndRestore()
    }

    document.addEventListener('visibilitychange', handleVisibilityChange)
    window.addEventListener('pageshow', handlePageShow)

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange)
      window.removeEventListener('pageshow', handlePageShow)
    }
  }, [checkAndRestore])

  return {
    isRestored,
    data,
    restoreSession: checkAndRestore,
  }
}

export default useOverlayRestore
