import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import LostFoundHome from './index'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <LostFoundHome />
  </StrictMode>,
)
