/**
 * Firebase app instance for the Relay buildathon project.
 *
 * Uses a NAMED app ('relay') so it never touches the existing default
 * Firebase app used by features/feedback.
 */

import { initializeApp, getApp, type FirebaseApp } from 'firebase/app'
import { getAuth, signInAnonymously, type User } from 'firebase/auth'
import { initializeAppCheck, ReCaptchaEnterpriseProvider, getToken, type AppCheck } from 'firebase/app-check'

function env(name: string): string {
  const v = import.meta.env[name]
  if (typeof v !== 'string' || v.length === 0) {
    throw new Error(`Missing env var ${name}`)
  }
  return v
}

const RELAY_APP_NAME = 'relay'
const DEBUG_TOKEN_STORAGE_KEY = 'relay.appcheck.debug'

let appCheckInitialized = false
let relayAppCheck: AppCheck | null = null
let appCheckDevStatus = 'Checking App Check token…'
let appCheckListeners: ((status: string) => void)[] = []

/**
 * Dev only: returns the active App Check debug token.
 * If VITE_APPCHECK_DEBUG_TOKEN is empty or "auto", generates a UUID once,
 * stores it in localStorage under "relay.appcheck.debug", and reuses it.
 * Never prints, logs, or transmits the token.
 */
export function getRelayAppCheckDebugToken(): string {
  if (!import.meta.env.DEV) return ''
  const envVal = import.meta.env.VITE_APPCHECK_DEBUG_TOKEN
  if (envVal && envVal !== 'auto') {
    return envVal
  }
  if (typeof localStorage !== 'undefined') {
    let stored = localStorage.getItem(DEBUG_TOKEN_STORAGE_KEY)
    if (!stored) {
      stored =
        typeof crypto !== 'undefined' && crypto.randomUUID
          ? crypto.randomUUID()
          : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
              const r = (Math.random() * 16) | 0
              const v = c === 'x' ? r : (r & 0x3) | 0x8
              return v.toString(16)
            })
      try {
        localStorage.setItem(DEBUG_TOKEN_STORAGE_KEY, stored)
      } catch {
        // storage disabled or quota exceeded
      }
    }
    return stored
  }
  return ''
}

export function subscribeAppCheckStatus(listener: (status: string) => void): () => void {
  listener(appCheckDevStatus)
  appCheckListeners.push(listener)
  return () => {
    appCheckListeners = appCheckListeners.filter((l) => l !== listener)
  }
}

async function verifyAppCheckInDev(appCheck: AppCheck): Promise<void> {
  if (!import.meta.env.DEV) return
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        const timeoutErr = new Error('Verification timed out after 10 seconds')
        ;(timeoutErr as { code?: string }).code = 'appCheck/timeout'
        reject(timeoutErr)
      }, 10000)
    )
    await Promise.race([getToken(appCheck, false), timeoutPromise])
    appCheckDevStatus = 'App Check token: OK'
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || 'appCheck/error'
    const status =
      (err as { customData?: { status?: number } })?.customData?.status ??
      (err as { status?: number })?.status ??
      ''
    const statusStr = status ? ` ${status}` : ''
    const msg = err instanceof Error ? err.message : String(err)
    appCheckDevStatus = `App Check token: FAILED (${code}${statusStr} - ${msg})`
  }
  appCheckListeners.forEach((l) => l(appCheckDevStatus))
}

export async function getRelayAppCheckStatus(): Promise<string> {
  getRelayApp()
  if (!import.meta.env.DEV) return 'App Check token: (prod)'
  if (!relayAppCheck) return 'App Check: not initialized'
  try {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => {
        const timeoutErr = new Error('Verification timed out after 10 seconds')
        ;(timeoutErr as { code?: string }).code = 'appCheck/timeout'
        reject(timeoutErr)
      }, 10000)
    )
    await Promise.race([getToken(relayAppCheck, false), timeoutPromise])
    return 'App Check token: OK'
  } catch (err: unknown) {
    const code = (err as { code?: string })?.code || 'appCheck/error'
    const status =
      (err as { customData?: { status?: number } })?.customData?.status ??
      (err as { status?: number })?.status ??
      ''
    const statusStr = status ? ` ${status}` : ''
    const msg = err instanceof Error ? err.message : String(err)
    return `App Check token: FAILED (${code}${statusStr} - ${msg})`
  }
}

function initAppCheck(app: FirebaseApp): void {
  if (appCheckInitialized) return
  if (typeof window === 'undefined') return

  // In dev only: set debug token before calling initializeAppCheck
  // Never print or log the token values
  if (import.meta.env.DEV && typeof self !== 'undefined') {
    const debugToken = getRelayAppCheckDebugToken()
    if (debugToken) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ;(self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = debugToken
    }
  }

  const recaptchaKey = import.meta.env.VITE_RECAPTCHA_ENTERPRISE_KEY
  if (recaptchaKey || import.meta.env.DEV) {
    try {
      relayAppCheck = initializeAppCheck(app, {
        provider: new ReCaptchaEnterpriseProvider(recaptchaKey || ''),
        isTokenAutoRefreshEnabled: true,
      })
      appCheckInitialized = true
      if (import.meta.env.DEV) {
        void verifyAppCheckInDev(relayAppCheck)
      }
    } catch {
      // Ignore if App Check was already registered for this app instance
    }
  }
}

/** Lazily initialised named Firebase app for the relay project. */
export function getRelayApp(): FirebaseApp {
  let app: FirebaseApp
  try {
    app = getApp(RELAY_APP_NAME)
  } catch {
    app = initializeApp(
      {
        apiKey: env('VITE_RELAY_FB_API_KEY'),
        authDomain: env('VITE_RELAY_FB_AUTH_DOMAIN'),
        projectId: env('VITE_RELAY_FB_PROJECT_ID'),
        appId: env('VITE_RELAY_FB_APP_ID'),
        storageBucket: import.meta.env.VITE_RELAY_FB_STORAGE_BUCKET ?? undefined,
        messagingSenderId: import.meta.env.VITE_RELAY_FB_SENDER_ID ?? undefined,
      },
      RELAY_APP_NAME,
    )
  }

  // Ensure App Check is initialized on the 'relay' app BEFORE getAI() or other services
  initAppCheck(app)

  return app
}

/** Returns a Firebase Auth instance scoped to the relay app. */
export function getRelayAuth() {
  return getAuth(getRelayApp())
}

/** Signs in anonymously on the relay app and returns the User. */
export async function ensureRelayAnonymousAuth(): Promise<User> {
  const auth = getRelayAuth()
  if (auth.currentUser) return auth.currentUser
  const cred = await signInAnonymously(auth)
  return cred.user
}

/** Returns the current user's ID token (for server auth). */
export async function getRelayIdToken(): Promise<string> {
  const user = await ensureRelayAnonymousAuth()
  return user.getIdToken()
}
