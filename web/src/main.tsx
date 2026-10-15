import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/screen-styles.css'
import './styles/scope.css'
import './index.css'
import './styles/dark.css'
import App from './App.tsx'
import { bootDarkTheme } from './design/theme'

bootDarkTheme()

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
