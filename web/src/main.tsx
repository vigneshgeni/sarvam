import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/screen-styles.css'
import './styles/scope.css'
import './index.css'
import { isNative } from './native/isNative.js'
import { extractGuestCodeFromPath } from './features/relay/room/relayApi.js'

// In native iOS shell, unregister any service worker to avoid stale asset caching on capacitor://
if (isNative() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      void reg.unregister()
    }
  }).catch(() => {})
}

// Guest route /r/:code — code-split so guests never download App.tsx or Gemini Live SDK
const guestRoomCode =
  typeof window !== 'undefined' ? extractGuestCodeFromPath(window.location.pathname) : null

const LazyApp = lazy(() => import('./App.tsx'))
const LazyRoomGuest = lazy(() => import('./features/relay/room/RoomGuest.tsx'))

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <Suspense fallback={<div className="fixed inset-0 bg-[#F4F5F2]" />}>
      {guestRoomCode ? <LazyRoomGuest initialCode={guestRoomCode} /> : <LazyApp />}
    </Suspense>
  </StrictMode>,
)
