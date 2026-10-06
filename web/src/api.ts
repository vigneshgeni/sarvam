import type { ExplainResponse, ApiError } from './types'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export class ExplainApiError extends Error {
  messageLocal: string
  statusCode: number

  constructor(message: string, messageLocal: string, statusCode: number) {
    super(messageLocal || message)
    this.name = 'ExplainApiError'
    this.messageLocal = messageLocal || message
    this.statusCode = statusCode
  }
}

/**
 * Sends files and lang to /api/explain as multipart/form-data.
 */
export async function explainDocument(
  files: File[],
  lang: string
): Promise<ExplainResponse> {
  const formData = new FormData()
  for (const file of files) {
    formData.append('files', file)
  }
  formData.append('lang', lang)

  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/explain`, {
      method: 'POST',
      body: formData,
    })
  } catch {
    throw new ExplainApiError(
      'Network error. Could not connect to Sarvam API.',
      'இணையத் தொடர்பு பிழை. சர்வர் உடன் இணைக்க முடியவில்லை.',
      0
    )
  }

  if (!response.ok) {
    let errorJson: Partial<ApiError> | null = null
    try {
      errorJson = await response.json()
    } catch {
      // response wasn't JSON
    }

    const messageLocal =
      errorJson?.message_local ||
      errorJson?.message ||
      `Request failed with status ${response.status}`
    const messageEn = errorJson?.message || messageLocal

    throw new ExplainApiError(messageEn, messageLocal, response.status)
  }

  const data: ExplainResponse = await response.json()
  return data
}
