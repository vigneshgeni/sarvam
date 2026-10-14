export const STORAGE_ACTIVE_RESULT: string

export function loadActiveSession(): any | null

export function restoreActiveOverlay(
  currentData?: any,
  callbacks?: {
    onRestore?: (savedData: any) => void
    onClose?: (message?: string) => void
  }
): { restored: boolean; data: any | null; closed: boolean }
