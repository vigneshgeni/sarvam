import { getApiBase } from '../../api'
import type { FormField } from '../../types'

export interface DetectFormResponse {
  formTitle: string
  fields: FormField[]
}

export async function detectFormFields(
  images: string[],
  formTitle?: string,
  signal?: AbortSignal
): Promise<DetectFormResponse> {
  const res = await fetch(`${getApiBase()}/api/formfill/detect`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ images, ...(formTitle ? { formTitle } : {}) }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Form field detection failed (${res.status})`)
  }
  const data = (await res.json()) as DetectFormResponse
  return {
    formTitle: data?.formTitle || formTitle || 'Form',
    fields: Array.isArray(data?.fields) ? data.fields : [],
  }
}

export async function extractFormValues(
  fields: Array<Pick<FormField, 'id' | 'label' | 'type' | 'dateFormat' | 'cells'>>,
  transcript: string,
  signal?: AbortSignal
): Promise<Record<string, string | null>> {
  const res = await fetch(`${getApiBase()}/api/formfill/extract`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields, transcript }),
    signal,
  })
  if (!res.ok) {
    throw new Error(`Form value extraction failed (${res.status})`)
  }
  const data = (await res.json()) as Record<string, string | null>
  return data && typeof data === 'object' ? data : {}
}
