/**
 * relayApi — Single helper for all /api/relay/* requests, room code validation,
 * invite link generation, WhatsApp share links, and friendly error mapping.
 *
 * Uses VITE_RELAY_API_BASE (empty = same-origin /api/relay, which Vite proxies in dev;
 * set to the sarvam-relay-api Cloud Run URL for deployed builds).
 */

export const RELAY_CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'
const RELAY_CODE_RE = new RegExp(`^[${RELAY_CODE_ALPHABET}]{4}$`)

export type RelayApiErrorCode =
  | 'not_found'
  | 'expired'
  | 'ended'
  | 'full'
  | 'rate_limited'
  | 'livekit_not_configured'
  | 'unauthorized'
  | 'network'
  | 'unknown'

export interface RelayApiErrorInfo {
  code: RelayApiErrorCode
  i18nKey: string
  message: string
}

export class RelayApiError extends Error {
  public readonly info: RelayApiErrorInfo
  public readonly status: number

  constructor(info: RelayApiErrorInfo, status = 0) {
    super(info.message)
    this.name = 'RelayApiError'
    this.info = info
    this.status = status
  }
}

export function normalizeRoomCode(raw: string): string {
  return (raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4)
}

export function isValidRoomCode(raw: string): boolean {
  return RELAY_CODE_RE.test(normalizeRoomCode(raw))
}

export function extractGuestCodeFromPath(pathname: string): string | null {
  const m = (pathname || '').match(/^\/r\/([A-Za-z0-9]{1,8})\/?$/)
  if (!m) return null
  return m[1].toUpperCase()
}

export function buildRoomJoinUrl(code: string, origin?: string): string {
  const clean = normalizeRoomCode(code)
  const base =
    origin !== undefined
      ? origin.replace(/\/+$/, '')
      : typeof window !== 'undefined'
        ? window.location.origin.replace(/\/+$/, '')
        : ''
  return base ? `${base}/r/${clean}` : `/r/${clean}`
}

export function buildWhatsAppShareUrl(code: string, joinUrl: string, hostName?: string): string {
  const clean = normalizeRoomCode(code)
  const prefix = hostName ? `${hostName} invited you to a Sarvam Live Relay call.` : 'Join my Sarvam Live Relay call.'
  const text = `${prefix} Tap to join: ${joinUrl} (Code: ${clean})`
  return `https://wa.me/?text=${encodeURIComponent(text)}`
}

export function mapRelayApiError(
  status: number,
  detailCode?: string,
  fallbackMessage?: string,
): RelayApiErrorInfo {
  const code = (detailCode || '').toLowerCase()
  if (code === 'not_found' || status === 404) {
    return {
      code: 'not_found',
      i18nKey: 'relayRoomErrNotFound',
      message: 'Room not found. Check the 4-letter code and try again.',
    }
  }
  if (code === 'expired') {
    return {
      code: 'expired',
      i18nKey: 'relayRoomErrExpired',
      message: 'This room has expired. Ask the host for a new link.',
    }
  }
  if (code === 'ended' || status === 410) {
    return {
      code: 'ended',
      i18nKey: 'relayRoomErrEnded',
      message: 'This room has already ended.',
    }
  }
  if (code === 'full' || status === 409) {
    return {
      code: 'full',
      i18nKey: 'relayRoomErrFull',
      message: 'This room is full (maximum 3 guests).',
    }
  }
  if (code === 'rate_limited' || status === 429) {
    return {
      code: 'rate_limited',
      i18nKey: 'relayRoomErrGeneric',
      message: 'Too many rooms created. Please wait and try again.',
    }
  }
  if (code === 'livekit_not_configured' || status === 503) {
    return {
      code: 'livekit_not_configured',
      i18nKey: 'relayRoomErrGeneric',
      message: 'Video rooms are not ready on this server yet.',
    }
  }
  if (status === 401 || status === 403) {
    return {
      code: 'unauthorized',
      i18nKey: 'relayRoomErrGeneric',
      message: 'Host permission is required for this action.',
    }
  }
  if (status === 0) {
    return {
      code: 'network',
      i18nKey: 'relayRoomErrGeneric',
      message: fallbackMessage || 'Could not reach the server. Check your connection and try again.',
    }
  }
  return {
    code: 'unknown',
    i18nKey: 'relayRoomErrGeneric',
    message: fallbackMessage || 'Could not connect to the room. Please try again.',
  }
}

function getRelayApiBase(): string {
  const envVal =
    typeof import.meta !== 'undefined' && import.meta.env
      ? (import.meta.env.VITE_RELAY_API_BASE as string | undefined)
      : undefined
  if (envVal && envVal.trim()) {
    return `${envVal.trim().replace(/\/+$/, '')}/api/relay`
  }
  return '/api/relay'
}

async function relayFetch<T>(
  path: string,
  init: RequestInit,
  timeoutMs = 10000,
): Promise<T> {
  const url = `${getRelayApiBase()}${path}`
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)
  try {
    const res = await fetch(url, { ...init, signal: ctrl.signal })
    let body: Record<string, unknown> | null = null
    try {
      body = (await res.json()) as Record<string, unknown>
    } catch {
      body = null
    }
    if (!res.ok) {
      const detail = (body?.detail as Record<string, unknown> | undefined) || body
      const detailCode = typeof detail?.code === 'string' ? detail.code : undefined
      const detailMsg = typeof detail?.message === 'string' ? detail.message : undefined
      throw new RelayApiError(mapRelayApiError(res.status, detailCode, detailMsg), res.status)
    }
    return body as T
  } catch (err) {
    if (err instanceof RelayApiError) throw err
    throw new RelayApiError(mapRelayApiError(0), 0)
  } finally {
    clearTimeout(timer)
  }
}

export interface CreateRoomResult {
  code: string
  joinUrl: string
  hostKey: string
  livekitUrl: string
  token: string
  expiresAt: number
}

export async function createRelayRoom(params: {
  hostName: string
  language: string
}): Promise<CreateRoomResult> {
  return relayFetch<CreateRoomResult>('/rooms', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  })
}

export interface JoinRoomResult {
  code: string
  livekitUrl: string
  token: string
  allowGuestCamera: boolean
  hostName: string
  guestIdentity: string
}

export async function joinRelayRoom(params: {
  code: string
  name: string
  language: string
}): Promise<JoinRoomResult> {
  return relayFetch<JoinRoomResult>('/join', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      code: normalizeRoomCode(params.code),
      name: params.name.trim(),
      language: params.language,
    }),
  })
}

export async function updateRelayRoomSettings(params: {
  hostKey: string
  code: string
  allowGuestCamera: boolean
}): Promise<{ code: string; allowGuestCamera: boolean }> {
  return relayFetch('/settings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Host-Key': params.hostKey,
    },
    body: JSON.stringify({
      code: params.code,
      allowGuestCamera: params.allowGuestCamera,
    }),
  })
}

export async function endRelayRoom(params: {
  hostKey: string
  code: string
}): Promise<{ ok: boolean; code: string }> {
  return relayFetch('/end', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Host-Key': params.hostKey,
    },
    body: JSON.stringify({ code: params.code }),
  })
}

export async function updateRelayGuestPermission(params: {
  hostKey: string
  code: string
  identity: string
  canPublishCamera: boolean
}): Promise<{ ok: boolean; identity: string; canPublishCamera: boolean }> {
  return relayFetch('/permissions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Host-Key': params.hostKey,
    },
    body: JSON.stringify({
      code: params.code,
      identity: params.identity,
      canPublishCamera: params.canPublishCamera,
    }),
  })
}

export async function translateRelayCaption(params: {
  text: string
  from: string
  to: string
}): Promise<{ translated: string } | null> {
  try {
    return await relayFetch<{ translated: string }>(
      '/translate',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      2000,
    )
  } catch {
    return null
  }
}
