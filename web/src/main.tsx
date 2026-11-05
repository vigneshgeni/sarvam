import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/screen-styles.css'
import './styles/scope.css'
import './index.css'
import App from './App.tsx'
import { isNative } from './native/isNative.js'

// In native iOS shell, unregister any service worker to avoid stale asset caching on capacitor://
if (isNative() && typeof navigator !== 'undefined' && 'serviceWorker' in navigator) {
  navigator.serviceWorker.getRegistrations().then((registrations) => {
    for (const reg of registrations) {
      void reg.unregister()
    }
  }).catch(() => {})
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
