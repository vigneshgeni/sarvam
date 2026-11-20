/**
 * Pure stage state machine, error classifier, and Safari-inspector logger
 * for Live Relay camera & Gemini Live lifecycle.
 */

export type RelayStage =
  | 'idle'
  | 'tapped'
  | 'permission_granted'
  | 'stream_started'
  | 'first_frame'
  | 'gemini_connecting'
  | 'connected'
  | 'reconnecting'
  | 'error'

export type RelayErrorKind =
  | 'permission_denied'
  | 'no_camera'
  | 'camera_busy'
  | 'gemini_connect'
  | 'network_lost'
  | 'unknown'

export interface RelayErrorInfo {
  kind: RelayErrorKind
  titleKey:
    | 'relayErrPermissionTitle'
    | 'relayErrNoCameraTitle'
    | 'relayErrCameraBusyTitle'
    | 'relayErrGeminiTitle'
    | 'relayErrNetworkTitle'
    | 'relayErrUnknownTitle'
  bodyKey:
    | 'relayErrPermissionBody'
    | 'relayErrNoCameraBody'
    | 'relayErrCameraBusyBody'
    | 'relayErrGeminiBody'
    | 'relayErrNetworkBody'
    | 'relayErrUnknownBody'
  retryTarget: 'camera' | 'gemini'
}

export interface RelaySessionState {
  stage: RelayStage
  modelUsed: string | null
  isFallbackModel: boolean
  error: RelayErrorInfo | null
  history: RelayStage[]
}

export type RelaySessionEvent =
  | { type: 'TAP' }
  | { type: 'PERMISSION_GRANTED' }
  | { type: 'STREAM_STARTED' }
  | { type: 'FIRST_FRAME' }
  | { type: 'GEMINI_CONNECTING' }
  | { type: 'CONNECTED'; model: string; isFallback: boolean }
  | { type: 'RECONNECTING' }
  | { type: 'ERROR'; error: RelayErrorInfo }
  | { type: 'RESET' }

export function createInitialRelayState(): RelaySessionState {
  return {
    stage: 'idle',
    modelUsed: null,
    isFallbackModel: false,
    error: null,
    history: ['idle'],
  }
}

export function transitionRelayState(
  state: RelaySessionState,
  event: RelaySessionEvent,
): RelaySessionState {
  switch (event.type) {
    case 'TAP':
      return {
        ...state,
        stage: 'tapped',
        error: null,
        history: [...state.history, 'tapped'],
      }
    case 'PERMISSION_GRANTED':
      return {
        ...state,
        stage: 'permission_granted',
        error: null,
        history: [...state.history, 'permission_granted'],
      }
    case 'STREAM_STARTED':
      return {
        ...state,
        stage: 'stream_started',
        error: null,
        history: [...state.history, 'stream_started'],
      }
    case 'FIRST_FRAME':
      return {
        ...state,
        stage: 'first_frame',
        error: null,
        history: [...state.history, 'first_frame'],
      }
    case 'GEMINI_CONNECTING':
      return {
        ...state,
        stage: 'gemini_connecting',
        error: null,
        history: [...state.history, 'gemini_connecting'],
      }
    case 'CONNECTED':
      return {
        ...state,
        stage: 'connected',
        modelUsed: event.model,
        isFallbackModel: event.isFallback,
        error: null,
        history: [...state.history, 'connected'],
      }
    case 'RECONNECTING':
      return {
        ...state,
        stage: 'reconnecting',
        history: [...state.history, 'reconnecting'],
      }
    case 'ERROR':
      return {
        ...state,
        stage: 'error',
        error: event.error,
        history: [...state.history, 'error'],
      }
    case 'RESET':
      return createInitialRelayState()
    default:
      return state
  }
}

export function classifyRelayError(
  err: unknown,
  source: 'camera' | 'gemini',
  isOnline = typeof navigator !== 'undefined' ? navigator.onLine : true,
): RelayErrorInfo {
  const name =
    typeof err === 'object' && err !== null && 'name' in err && typeof (err as { name?: unknown }).name === 'string'
      ? (err as { name: string }).name
      : ''
  const message =
    err instanceof Error
      ? err.message
      : typeof err === 'object' && err !== null && 'message' in err && typeof (err as { message?: unknown }).message === 'string'
        ? (err as { message: string }).message
        : String(err ?? '')
  const lower = `${name} ${message}`.toLowerCase()

  if (
    name === 'NotAllowedError' ||
    name === 'PermissionDeniedError' ||
    name === 'SecurityError' ||
    lower.includes('permission denied') ||
    lower.includes('notallowederror') ||
    lower.includes('denied permission')
  ) {
    return {
      kind: 'permission_denied',
      titleKey: 'relayErrPermissionTitle',
      bodyKey: 'relayErrPermissionBody',
      retryTarget: 'camera',
    }
  }

  if (
    source === 'camera' &&
    (name === 'NotFoundError' ||
      name === 'DevicesNotFoundError' ||
      name === 'OverconstrainedError' ||
      lower.includes('requested device not found') ||
      lower.includes('no camera') ||
      lower.includes('mediadevices'))
  ) {
    return {
      kind: 'no_camera',
      titleKey: 'relayErrNoCameraTitle',
      bodyKey: 'relayErrNoCameraBody',
      retryTarget: 'camera',
    }
  }

  if (
    source === 'camera' &&
    (name === 'NotReadableError' ||
      name === 'TrackStartError' ||
      name === 'AbortError' ||
      lower.includes('could not start video source') ||
      lower.includes('device in use') ||
      lower.includes('busy') ||
      lower.includes('hardware'))
  ) {
    return {
      kind: 'camera_busy',
      titleKey: 'relayErrCameraBusyTitle',
      bodyKey: 'relayErrCameraBusyBody',
      retryTarget: 'camera',
    }
  }

  if (
    !isOnline ||
    lower.includes('network') ||
    lower.includes('offline') ||
    lower.includes('failed to fetch') ||
    lower.includes('econnrefused') ||
    lower.includes('err_internet_disconnected')
  ) {
    return {
      kind: 'network_lost',
      titleKey: 'relayErrNetworkTitle',
      bodyKey: 'relayErrNetworkBody',
      retryTarget: source,
    }
  }

  if (
    source === 'gemini' ||
    lower.includes('app-check') ||
    lower.includes('appcheck') ||
    lower.includes('recaptcha') ||
    lower.includes('missing env var') ||
    lower.includes('missing vite_') ||
    lower.includes('websocket') ||
    lower.includes('model') ||
    lower.includes('quota') ||
    lower.includes('403') ||
    lower.includes('404') ||
    lower.includes('429')
  ) {
    return {
      kind: 'gemini_connect',
      titleKey: 'relayErrGeminiTitle',
      bodyKey: 'relayErrGeminiBody',
      retryTarget: 'gemini',
    }
  }

  return {
    kind: 'unknown',
    titleKey: 'relayErrUnknownTitle',
    bodyKey: 'relayErrUnknownBody',
    retryTarget: source,
  }
}

export function logRelayStage(stage: string, detail?: Record<string, string | number | boolean>): void {
  if (detail) {
    console.info(`[relay] ${stage}`, detail)
  } else {
    console.info(`[relay] ${stage}`)
  }
}
