/**
 * Pure camera-handoff state machine (P3).
 *
 * Guarantees ONE active camera at a time:
 *   hostCamera -> requested(guestId, guestName) -> guestCamera(guestId, guestName) -> hostCamera
 *
 * Auto-grants when allowGuestCamera is true AND the host camera is off/paused.
 */

export type CameraHandoffState =
  | { kind: 'hostCamera' }
  | { kind: 'requested'; guestId: string; guestName: string }
  | { kind: 'guestCamera'; guestId: string; guestName: string }

export type CameraHandoffEvent =
  | { type: 'GUEST_REQUEST'; guestId: string; guestName: string }
  | { type: 'HOST_ALLOW' }
  | { type: 'HOST_DENY' }
  | { type: 'HOST_TAKE_BACK' }
  | { type: 'GUEST_RELEASE'; guestId: string }
  | { type: 'GUEST_LEFT'; guestId: string }

export interface CameraHandoffContext {
  allowGuestCamera: boolean
  hostCameraOff: boolean
}

export interface CameraHandoffTransitionResult {
  state: CameraHandoffState
  changed: boolean
  grantGuestId?: string
  revokeGuestId?: string
  geminiNote?: string
  autoGranted?: boolean
}

export function createInitialCameraHandoffState(): CameraHandoffState {
  return { kind: 'hostCamera' }
}

export function formatCameraHandoffNote(ownerName: string): string {
  const clean = (ownerName || 'Host').trim()
  return `(Now showing ${clean}'s camera)`
}

export function transitionCameraHandoff(
  state: CameraHandoffState,
  event: CameraHandoffEvent,
  ctx: CameraHandoffContext,
): CameraHandoffTransitionResult {
  switch (event.type) {
    case 'GUEST_REQUEST': {
      if (!ctx.allowGuestCamera) {
        return { state, changed: false }
      }
      // If another guest already holds the camera, ignore until taken back
      if (state.kind === 'guestCamera' && state.guestId !== event.guestId) {
        return { state, changed: false }
      }
      if (ctx.hostCameraOff) {
        return {
          state: { kind: 'guestCamera', guestId: event.guestId, guestName: event.guestName },
          changed: true,
          grantGuestId: event.guestId,
          geminiNote: formatCameraHandoffNote(event.guestName),
          autoGranted: true,
        }
      }
      return {
        state: { kind: 'requested', guestId: event.guestId, guestName: event.guestName },
        changed: true,
      }
    }

    case 'HOST_ALLOW': {
      if (state.kind !== 'requested') {
        return { state, changed: false }
      }
      return {
        state: { kind: 'guestCamera', guestId: state.guestId, guestName: state.guestName },
        changed: true,
        grantGuestId: state.guestId,
        geminiNote: formatCameraHandoffNote(state.guestName),
      }
    }

    case 'HOST_DENY': {
      if (state.kind !== 'requested') {
        return { state, changed: false }
      }
      return {
        state: { kind: 'hostCamera' },
        changed: true,
      }
    }

    case 'HOST_TAKE_BACK': {
      if (state.kind !== 'guestCamera') {
        return { state, changed: false }
      }
      return {
        state: { kind: 'hostCamera' },
        changed: true,
        revokeGuestId: state.guestId,
        geminiNote: formatCameraHandoffNote('Host'),
      }
    }

    case 'GUEST_RELEASE':
    case 'GUEST_LEFT': {
      if (state.kind === 'guestCamera' && state.guestId === event.guestId) {
        return {
          state: { kind: 'hostCamera' },
          changed: true,
          revokeGuestId: state.guestId,
          geminiNote: formatCameraHandoffNote('Host'),
        }
      }
      if (state.kind === 'requested' && state.guestId === event.guestId) {
        return {
          state: { kind: 'hostCamera' },
          changed: true,
        }
      }
      return { state, changed: false }
    }
  }
}
