import { initializeApp, getApps } from 'firebase/app'
import { getAuth, signInAnonymously } from 'firebase/auth'
import { addDoc, collection, getFirestore, serverTimestamp } from 'firebase/firestore'
import type { FeedbackPayload } from './payload.js'

function requiredEnv(name: keyof ImportMetaEnv): string {
  const value = import.meta.env[name]
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`Missing ${name}`)
  }
  return value
}

/** Loaded only after a rating tap. Writes one feedback document; no document text. */
export async function sendFeedback(payload: FeedbackPayload): Promise<void> {
  const app =
    getApps()[0] ??
    initializeApp({
      apiKey: requiredEnv('VITE_FIREBASE_API_KEY'),
      authDomain: requiredEnv('VITE_FIREBASE_AUTH_DOMAIN'),
      projectId: requiredEnv('VITE_FIREBASE_PROJECT_ID'),
      appId: requiredEnv('VITE_FIREBASE_APP_ID'),
    })

  const auth = getAuth(app)
  if (!auth.currentUser) {
    await signInAnonymously(auth)
  }

  const body: Record<string, unknown> = {
    rating: payload.rating,
    lang: payload.lang,
    docType: payload.docType,
    sample: payload.sample,
    appVersion: payload.appVersion,
    createdAt: serverTimestamp(),
  }
  if (payload.rating === 'down') {
    body.reasons = payload.reasons
  }

  await addDoc(collection(getFirestore(app), 'feedback'), body)
}
