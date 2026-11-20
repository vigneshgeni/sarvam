import type { FormField } from '../../types'

export function buildFilledImagePdf(opts: {
  pageImages: (string | Uint8Array)[]
  fields: FormField[]
  values: Record<string, string>
  formTitle?: string
}): Promise<Uint8Array>

export function fillAcroFormPdf(opts: {
  pdfBytes: Uint8Array
  fields: FormField[]
  values: Record<string, string>
}): Promise<{ bytes: Uint8Array; filledCount: number; isAcroForm: boolean }>

export function buildFormPdf(opts: {
  pageImages: (string | Uint8Array)[]
  sourcePdfBytes?: Uint8Array | null
  fields: FormField[]
  values: Record<string, string>
  formTitle?: string
}): Promise<Uint8Array>
