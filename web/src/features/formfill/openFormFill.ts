import type { FormDraft } from '../../types'

export interface FormFillLiveBridge {
  isOpen: boolean
  sendPrompt: (text: string) => void
  onUserTranscript?: (cb: (transcript: string) => void) => () => void
}

export interface FormFillLaunchOptions {
  formTitle?: string
  sourcePdfBytes?: Uint8Array | null
  draft?: FormDraft | null
  liveBridge?: FormFillLiveBridge | null
  isInRoom?: boolean
}

export type FormFillOpener = (images: string[], options?: FormFillLaunchOptions) => void

let registeredOpener: FormFillOpener | null = null

export function registerFormFillOpener(opener: FormFillOpener | null): void {
  registeredOpener = opener
}

/**
 * Helper that any screen (Home, Live Relay camera, or Ask) can call to open the Form Fill screen
 * with one or more scanned page images (base64 data URLs) without importing FormFillScreen directly.
 */
export function openFormFill(images: string[], options?: FormFillLaunchOptions): boolean {
  if (!registeredOpener) return false
  registeredOpener(images, options)
  return true
}
