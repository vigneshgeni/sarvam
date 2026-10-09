import type { ExplainResponse, ApiError, TranslateRequest, AskResponse } from './types'
import { explainQueue } from './utils/queue'
import { getLocalFallbackError } from './i18n'

const API_BASE = (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')

export class ExplainApiError extends Error {
  messageLocal: string
  statusCode: number
  retryAfter?: number
  errorCode?: string

  constructor(
    message: string,
    messageLocal: string,
    statusCode: number,
    retryAfter?: number,
    errorCode?: string
  ) {
    super(messageLocal || message)
    this.name = 'ExplainApiError'
    this.messageLocal = messageLocal || message
    this.statusCode = statusCode
    this.retryAfter = retryAfter
    this.errorCode = errorCode
  }
}

/**
 * Sends files, lang, and optional password to /api/explain as multipart/form-data.
 * Concurrency limited to at most 2 in-flight calls via explainQueue.
 * Uses AbortController with a 120 s timeout.
 */
export async function explainDocument(
  files: File[],
  lang: string,
  externalSignal?: AbortSignal,
  password?: string
): Promise<ExplainResponse> {
  return explainQueue.run(async () => {
    const formData = new FormData()
    for (const file of files) {
      formData.append('files', file)
    }
    formData.append('lang', lang)
    if (password) {
      formData.append('password', password)
    }

    const controller = new AbortController()
    let timedOut = false
    const timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort('timeout')
    }, 120_000)

    const onExternalAbort = () => {
      controller.abort(externalSignal?.reason)
    }

    if (externalSignal) {
      if (externalSignal.aborted) {
        clearTimeout(timeoutId)
        throw new DOMException('Aborted', 'AbortError')
      }
      externalSignal.addEventListener('abort', onExternalAbort, { once: true })
    }

    let response: Response
    try {
      response = await fetch(`${API_BASE}/api/explain`, {
        method: 'POST',
        body: formData,
        signal: controller.signal,
      })
    } catch (err: unknown) {
      if (externalSignal?.aborted) {
        throw new DOMException('Aborted', 'AbortError')
      }
      if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && timedOut)) {
        throw new ExplainApiError(
          'Request timed out after 120 seconds.',
          getLocalFallbackError(lang, 'timeout'),
          504
        )
      }
      throw new ExplainApiError(
        'Network error. Could not connect to Sarvam API.',
        getLocalFallbackError(lang, 'network'),
        0
      )
    } finally {
      clearTimeout(timeoutId)
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort)
      }
    }

    if (!response.ok) {
      let retryAfter: number | undefined
      const retryHeader = response.headers.get('retry-after')
      if (retryHeader) {
        const parsed = parseInt(retryHeader, 10)
        if (!isNaN(parsed) && parsed > 0) {
          retryAfter = parsed
        }
      }

      let errorJson: (Partial<ApiError> & { error?: string }) | null = null
      try {
        errorJson = await response.json()
      } catch {
        // response was not JSON
      }

      let fallbackCategory: 'rate_limit' | 'busy' | 'timeout' | 'generic' = 'generic'
      if (response.status === 429) fallbackCategory = 'rate_limit'
      else if (response.status === 503) fallbackCategory = 'busy'
      else if (response.status === 504) fallbackCategory = 'timeout'

      const messageLocal =
        errorJson?.message_local ||
        getLocalFallbackError(lang, fallbackCategory)

      const messageEn =
        errorJson?.message ||
        `Request failed with status ${response.status}`

      throw new ExplainApiError(messageEn, messageLocal, response.status, retryAfter, errorJson?.error)
    }

    const data: ExplainResponse = await response.json()
    return data
  }, externalSignal)
}

/**
 * Sends original explain result and target language to /api/translate.
 * Uses AbortController with a 120 s timeout.
 */
export async function translateDocument(
  result: ExplainResponse,
  lang: string,
  externalSignal?: AbortSignal
): Promise<ExplainResponse> {
  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort('timeout')
  }, 120_000)

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason)
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      clearTimeout(timeoutId)
      throw new DOMException('Aborted', 'AbortError')
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  }

  const payload: TranslateRequest = {
    result,
    lang,
  }

  let response: Response
  try {
    response = await fetch(`${API_BASE}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    if (externalSignal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && timedOut)) {
      throw new ExplainApiError(
        'Request timed out after 120 seconds.',
        getLocalFallbackError(lang, 'timeout'),
        504
      )
    }
    throw new ExplainApiError(
      'Network error. Could not connect to Sarvam API.',
      getLocalFallbackError(lang, 'network'),
      0
    )
  } finally {
    clearTimeout(timeoutId)
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort)
    }
  }

  if (!response.ok) {
    let retryAfter: number | undefined
    const retryHeader = response.headers.get('retry-after')
    if (retryHeader) {
      const parsed = parseInt(retryHeader, 10)
      if (!isNaN(parsed) && parsed > 0) {
        retryAfter = parsed
      }
    }

    let errorJson: (Partial<ApiError> & { error?: string }) | null = null
    try {
      errorJson = await response.json()
    } catch {
      // response was not JSON
    }

    let fallbackCategory: 'rate_limit' | 'busy' | 'timeout' | 'generic' = 'generic'
    if (response.status === 429) fallbackCategory = 'rate_limit'
    else if (response.status === 503) fallbackCategory = 'busy'
    else if (response.status === 504) fallbackCategory = 'timeout'

    const messageLocal =
      errorJson?.message_local ||
      getLocalFallbackError(lang, fallbackCategory)

    const messageEn =
      errorJson?.message ||
      `Request failed with status ${response.status}`

    throw new ExplainApiError(messageEn, messageLocal, response.status, retryAfter, errorJson?.error)
  }

  const data: ExplainResponse = await response.json()
  return data
}

/**
 * Ask question about document to POST /api/ask (WEB-12)
 * Sends question, lang, result JSON string, optional files, and optional password.
 */
export async function askDocument(params: {
  question: string
  lang: string
  result: ExplainResponse
  files?: File[]
  password?: string
  signal?: AbortSignal
}): Promise<AskResponse> {
  const formData = new FormData()
  formData.append('question', params.question)
  formData.append('lang', params.lang)
  formData.append('result', JSON.stringify(params.result))

  if (params.files && params.files.length > 0) {
    for (const f of params.files) {
      formData.append('files', f)
    }
  }
  if (params.password) {
    formData.append('password', params.password)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('timeout'), 45_000)

  const onAbort = () => controller.abort(params.signal?.reason)
  if (params.signal) {
    params.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const res = await fetch(`${API_BASE}/api/ask`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })

    if (!res.ok) {
      let errJson: any = null
      try {
        errJson = await res.json()
      } catch {}
      throw new ExplainApiError(
        errJson?.message || `Ask failed with status ${res.status}`,
        errJson?.message_local || getLocalFallbackError(params.lang, 'generic'),
        res.status,
        undefined,
        errJson?.error
      )
    }

    return await res.json()
  } finally {
    clearTimeout(timeoutId)
    if (params.signal) {
      params.signal.removeEventListener('abort', onAbort)
    }
  }
}

/**
 * Server TTS: POST /api/speak (WEB-9)
 * Returns audio/mpeg Blob.
 * 8 s timeout before falling back to device voice.
 */
export async function speakText(params: {
  text: string
  lang: string
  voice: 'female' | 'male'
  rate?: number
  signal?: AbortSignal
}): Promise<Blob> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('timeout'), 8000)

  const onAbort = () => controller.abort(params.signal?.reason)
  if (params.signal) {
    params.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const res = await fetch(`${API_BASE}/api/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: params.text,
        lang: params.lang,
        voice: params.voice,
        rate: params.rate || 1.0,
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      throw new Error(`Speak error ${res.status}`)
    }

    return await res.blob()
  } finally {
    clearTimeout(timeoutId)
    if (params.signal) {
      params.signal.removeEventListener('abort', onAbort)
    }
  }
}
