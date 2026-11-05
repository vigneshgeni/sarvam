import type { ExplainResponse, ApiError, TranslateRequest, AskResponse } from './types'
import { explainQueue } from './utils/queue'
import { explainCanRetry } from './utils/explainRetry'
import { getLocalFallbackError } from './i18n'
import { isNative } from './native/isNative.js'
import {
  startNativeScan,
  checkPendingScanResult,
  cancelNativeScan,
  downloadSpeechToFile,
} from './native/liveActivity.js'

export function getApiBase(): string {
  if (typeof window !== 'undefined' && window.localStorage) {
    const override = localStorage.getItem('sarvam.apiBase')
    if (override) return override.replace(/\/+$/, '')
  }
  return import.meta.env.DEV
    ? ''
    : (import.meta.env.VITE_API_URL || 'http://localhost:8080').replace(/\/+$/, '')
}

/**
 * Base URL for /api/speak only. Set VITE_TTS_API_URL at build time to hear a TTS change from a
 * server that is not deployed (for example the API running on your Mac). Explain, translate and
 * ask keep using getApiBase(). Unset (the default): speech uses the normal API.
 */
function getSpeakBase(): string {
  const tts = ((import.meta.env.VITE_TTS_API_URL as string | undefined) || '').trim()
  return tts ? tts.replace(/\/+$/, '') : getApiBase()
}

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

async function explainWithNativeWorker(
  files: File[],
  lang: string,
  externalSignal?: AbortSignal,
  password?: string
): Promise<ExplainResponse> {
  const firstFileName = files[0]?.name
  const docId = firstFileName && firstFileName.trim().length > 0 ? firstFileName : (files.length > 0 ? `scan_${Date.now()}` : 'doc')
  const title = firstFileName && firstFileName.trim().length > 0 ? firstFileName : 'Your document'

  const onAbort = () => {
    cancelNativeScan(docId)
  }
  if (externalSignal) {
    if (externalSignal.aborted) {
      cancelNativeScan(docId)
      throw new DOMException('Aborted', 'AbortError')
    }
    externalSignal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    console.log('[SarvamNative] [WebAPI] Starting explainWithNativeWorker: filesCount=', files.length, 'lang=', lang, 'apiBase=', getApiBase())
    await startNativeScan({
      docId,
      title,
      lang,
      apiBase: getApiBase(),
      password,
      files,
    })

    const startTime = Date.now()
    const maxWaitMs = 120_000

    while (Date.now() - startTime < maxWaitMs) {
      if (externalSignal?.aborted) {
        console.warn('[SarvamNative] [WebAPI] explainWithNativeWorker cancelled by signal')
        cancelNativeScan(docId)
        throw new DOMException('Aborted', 'AbortError')
      }

      const check = await checkPendingScanResult(docId)
      if (check?.ready && check?.result) {
        console.log('[SarvamNative] [WebAPI] Native scan worker finished successfully, result received')
        return check.result as ExplainResponse
      }
      if (check?.error) {
        const details = (check as any).details || {}
        console.error('[SarvamNative] [WebAPI] Native scan worker reported failure:', details)
        throw new ExplainApiError(
          details.message || 'Service is busy',
          details.messageLocal || getLocalFallbackError(lang, 'generic'),
          details.statusCode || 500
        )
      }

      await new Promise((resolve) => setTimeout(resolve, 500))
    }

    console.error('[SarvamNative] [WebAPI] explainWithNativeWorker timed out after 120s')
    throw new ExplainApiError(
      'Document analysis timed out after 120 seconds.',
      getLocalFallbackError(lang, 'timeout'),
      504
    )
  } finally {
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onAbort)
    }
  }
}

/**
 * Sends files, lang, and optional password to /api/explain as multipart/form-data.
 * Concurrency limited to at most 2 in-flight calls via explainQueue.
 * Uses AbortController with a 180 s timeout.
 */
export async function explainDocument(
  files: File[],
  lang: string,
  externalSignal?: AbortSignal,
  password?: string
): Promise<ExplainResponse> {
  if (isNative()) {
    return await explainWithNativeWorker(files, lang, externalSignal, password)
  }
  try {
    return await explainQueue.run(async () => {
      const hasPdf = files.some(
        (file) => file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
      )
      const budgetMs = hasPdf ? 150_000 : 90_000
      const started = Date.now()

      const attemptExplain = async (remainingMs: number): Promise<ExplainResponse> => {
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
        }, remainingMs)

        const onExternalAbort = () => {
          controller.abort(externalSignal?.reason)
        }

        if (externalSignal) {
          if (externalSignal.aborted) {
            clearTimeout(timeoutId)
            if (externalSignal.reason === 'timeout') {
              throw new ExplainApiError(
                'Request timed out after 90 seconds.',
                getLocalFallbackError(lang, 'timeout'),
                504
              )
            }
            throw new DOMException('Aborted', 'AbortError')
          }
          externalSignal.addEventListener('abort', onExternalAbort, { once: true })
        }

        let response: Response
        try {
          response = await fetch(`${getApiBase()}/api/explain`, {
            method: 'POST',
            body: formData,
            signal: controller.signal,
          })
        } catch (err: unknown) {
          if (externalSignal?.aborted) {
            if (externalSignal.reason === 'timeout') {
              throw new ExplainApiError(
                'Request timed out after 90 seconds.',
                getLocalFallbackError(lang, 'timeout'),
                504
              )
            }
            throw new DOMException('Aborted', 'AbortError')
          }
          if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && timedOut)) {
            throw new ExplainApiError(
              'Request timed out after 90 seconds.',
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

      let lastError: unknown
      for (let attempt = 0; attempt < 2; attempt++) {
        const remaining = budgetMs - (Date.now() - started)
        if (remaining < 1_000) {
          throw new ExplainApiError(
            'Request timed out after 90 seconds.',
            getLocalFallbackError(lang, 'timeout'),
            504
          )
        }
        try {
          return await attemptExplain(remaining)
        } catch (err: unknown) {
          lastError = err
          const status = err instanceof ExplainApiError ? err.statusCode : -1
          if (!explainCanRetry(status, attempt) || externalSignal?.aborted) throw err
          await new Promise<void>((resolve, reject) => {
            let timer: ReturnType<typeof setTimeout>
            const onAbort = () => {
              clearTimeout(timer)
              reject(new DOMException('Aborted', 'AbortError'))
            }
            timer = setTimeout(() => {
              externalSignal?.removeEventListener('abort', onAbort)
              resolve()
            }, 400)
            if (externalSignal) externalSignal.addEventListener('abort', onAbort, { once: true })
          })
        }
      }
      throw lastError
    }, externalSignal)
  } catch (err: unknown) {
    if (externalSignal?.aborted) {
      if (externalSignal.reason === 'timeout') {
        throw new ExplainApiError(
          'Request timed out after 90 seconds.',
          getLocalFallbackError(lang, 'timeout'),
          504
        )
      }
      throw new DOMException('Aborted', 'AbortError')
    }
    throw err
  }
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
  let timeoutId: number | undefined

  const onExternalAbort = () => {
    controller.abort(externalSignal?.reason)
  }

  if (externalSignal) {
    if (externalSignal.aborted) {
      if (externalSignal.reason === 'timeout') {
        throw new ExplainApiError(
          'Request timed out after 90 seconds.',
          getLocalFallbackError(lang, 'timeout'),
          504
        )
      }
      throw new DOMException('Aborted', 'AbortError')
    }
    externalSignal.addEventListener('abort', onExternalAbort, { once: true })
  } else {
    timeoutId = setTimeout(() => {
      timedOut = true
      controller.abort('timeout')
    }, 90_000) as unknown as number
  }

  const payload: TranslateRequest = {
    result,
    lang,
  }

  let response: Response
  try {
    response = await fetch(`${getApiBase()}/api/translate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch (err: unknown) {
    if (externalSignal?.aborted) {
      if (externalSignal.reason === 'timeout') {
        throw new ExplainApiError(
          'Request timed out after 90 seconds.',
          getLocalFallbackError(lang, 'timeout'),
          504
        )
      }
      throw new DOMException('Aborted', 'AbortError')
    }
    if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && timedOut)) {
      throw new ExplainApiError(
        'Request timed out after 90 seconds.',
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
    if (timeoutId) clearTimeout(timeoutId)
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
  history?: string
  signal?: AbortSignal
}): Promise<AskResponse> {
  const formData = new FormData()
  formData.append('question', params.question)
  formData.append('lang', params.lang)
  formData.append('result', JSON.stringify(params.result))
  if (params.history) formData.append('history', params.history)

  if (params.files && params.files.length > 0) {
    for (const f of params.files) {
      formData.append('files', f)
    }
  }
  if (params.password) {
    formData.append('password', params.password)
  }

  const controller = new AbortController()
  let timedOut = false
  const timeoutId = setTimeout(() => {
    timedOut = true
    controller.abort('timeout')
  }, 55_000)

  const onAbort = () => controller.abort(params.signal?.reason)
  if (params.signal) {
    params.signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const res = await fetch(`${getApiBase()}/api/ask`, {
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
  } catch (err: unknown) {
    if (params.signal?.aborted && params.signal.reason !== 'timeout') {
      throw new DOMException('Aborted', 'AbortError')
    }
    if (timedOut || (err instanceof DOMException && err.name === 'AbortError' && (timedOut || params.signal?.reason === 'timeout'))) {
      throw new ExplainApiError(
        'Ask request timed out after 55 seconds.',
        getLocalFallbackError(params.lang, 'timeout'),
        504
      )
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (params.signal) {
      params.signal.removeEventListener('abort', onAbort)
    }
  }
}

/**
 * Gemini TTS generates speech with a language model, so give it more time than a classic voice:
 * 15s for short text, rising to 45s once the text reaches 900 characters.
 */
function speakTimeoutMs(text: string): number {
  const length = text.length
  if (length >= 900) return 45_000
  if (length <= 80) return 15_000
  return Math.round(15_000 + ((length - 80) / (900 - 80)) * 30_000)
}

/**
 * Server TTS: POST /api/speak (WEB-9)
 * Returns audio/wav or audio/mpeg Blob.
 * Timeout scales with text length. Device-voice fallback is not decided here.
 */
export async function speakText(params: {
  text: string
  lang: string
  voice: 'female' | 'male'
  rate?: number
  /** Picks the voice inside the gender's rotating pool. Same number for a whole Listen session. */
  voiceIndex?: number
  signal?: AbortSignal
}): Promise<Blob> {
  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('timeout'), speakTimeoutMs(params.text))

  const onAbort = () => controller.abort(params.signal?.reason)
  if (params.signal) {
    params.signal.addEventListener('abort', onAbort, { once: true })
  }

  const ttsStart = Date.now()
  if (isNative()) {
    console.log('[SarvamNative] [WebAPI] POST /api/speak request started: chars=', params.text.length, 'lang=', params.lang, 'voice=', params.voice)
  }

  try {
    const res = await fetch(`${getSpeakBase()}/api/speak`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text: params.text,
        lang: params.lang,
        voice: params.voice,
        rate: params.rate || 1.0,
        ...(params.voiceIndex !== undefined ? { voice_index: params.voiceIndex } : {}),
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      if (isNative()) {
        console.error('[SarvamNative] [WebAPI] POST /api/speak FAILED status=', res.status, 'duration=', Date.now() - ttsStart, 'ms')
      }
      throw new Error(`Speak error ${res.status}`)
    }

    const blob = await res.blob()
    if (isNative()) {
      console.log('[SarvamNative] [WebAPI] POST /api/speak SUCCESS status=', res.status, 'duration=', Date.now() - ttsStart, 'ms blobBytes=', blob.size, 'type=', blob.type)
    }
    return blob
  } catch (err) {
    if (isNative()) {
      console.error('[SarvamNative] [WebAPI] POST /api/speak error encountered:', err)
    }
    throw err
  } finally {
    clearTimeout(timeoutId)
    if (params.signal) {
      params.signal.removeEventListener('abort', onAbort)
    }
  }
}

/**
 * Native app only: same /api/speak call, but done by native URLSession and saved to a file.
 * The WKWebView fetch path returned HTTP 200 with 0 bytes for audio/wav, so JS never got audio.
 * Resolves with the local file path; the native AVPlayer plays it.
 */
export async function speakTextToFile(params: {
  text: string
  lang: string
  voice: 'female' | 'male'
  rate?: number
  voiceIndex?: number
  signal?: AbortSignal
}): Promise<string> {
  const timeoutMs = speakTimeoutMs(params.text)
  const started = Date.now()
  console.log('[SarvamNative] [WebAPI] native POST /api/speak started: chars=', params.text.length, 'lang=', params.lang, 'voice=', params.voice, 'voiceIndex=', params.voiceIndex, 'base=', getSpeakBase())

  let timeoutId: ReturnType<typeof setTimeout> | undefined
  let onAbort: (() => void) | undefined
  const guard = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error('timeout')), timeoutMs)
    if (params.signal) {
      if (params.signal.aborted) {
        reject(new DOMException('Aborted', 'AbortError'))
        return
      }
      onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
      params.signal.addEventListener('abort', onAbort, { once: true })
    }
  })

  try {
    const res = await Promise.race([
      downloadSpeechToFile({
        url: `${getSpeakBase()}/api/speak`,
        body: JSON.stringify({
          text: params.text,
          lang: params.lang,
          voice: params.voice,
          rate: params.rate || 1.0,
          ...(params.voiceIndex !== undefined ? { voice_index: params.voiceIndex } : {}),
        }),
        timeoutMs,
      }),
      guard,
    ])
    console.log('[SarvamNative] [WebAPI] native POST /api/speak SUCCESS duration=', Date.now() - started, 'ms bytes=', res.bytes, 'type=', res.contentType)
    return res.path
  } catch (err) {
    console.error('[SarvamNative] [WebAPI] native POST /api/speak FAILED after', Date.now() - started, 'ms:', err)
    throw err
  } finally {
    if (timeoutId) clearTimeout(timeoutId)
    if (params.signal && onAbort) params.signal.removeEventListener('abort', onAbort)
  }
}

/**
 * Separate background endpoint to extract verbatim source text from document files
 * without slowing down the main explain call.
 */
export async function extractDocumentText(
  files: File[],
  password?: string,
  signal?: AbortSignal
): Promise<string | null> {
  if (!files || files.length === 0) return null

  const formData = new FormData()
  for (const f of files) {
    formData.append('files', f)
  }
  if (password) {
    formData.append('password', password)
  }

  const controller = new AbortController()
  const timeoutId = setTimeout(() => controller.abort('timeout'), 40_000)

  const onAbort = () => controller.abort(signal?.reason)
  if (signal) {
    signal.addEventListener('abort', onAbort, { once: true })
  }

  try {
    const res = await fetch(`${getApiBase()}/api/extract-text`, {
      method: 'POST',
      body: formData,
      signal: controller.signal,
    })
    if (!res.ok) return null
    const data = await res.json()
    return data?.source_text || null
  } catch {
    return null
  } finally {
    clearTimeout(timeoutId)
    if (signal) {
      signal.removeEventListener('abort', onAbort)
    }
  }
}

export async function redactText(
  text: string,
  lang: string,
  signal?: AbortSignal
): Promise<{ spans: { text: string; type: string }[] }> {
  const res = await fetch(`${getApiBase()}/api/redact`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, lang }),
    signal,
  })
  if (!res.ok) throw new Error('redact failed')
  const data = await res.json()
  const spans = Array.isArray(data?.spans) ? data.spans : []
  return { spans }
}

export async function transcribeAudio(blob: Blob, lang: string): Promise<string> {
  const formData = new FormData()
  formData.append('lang', lang)
  formData.append('audio', blob, 'question.webm')
  const res = await fetch(`${getApiBase()}/api/transcribe`, { method: 'POST', body: formData })
  if (!res.ok) return ''
  const data = await res.json()
  return typeof data?.text === 'string' ? data.text.slice(0, 500) : ''
}

