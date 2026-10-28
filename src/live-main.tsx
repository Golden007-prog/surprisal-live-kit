import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRAND } from './brand'
import './styles/theme.css'
import './live/live.css'
import { Phone } from './live/Phone'
// The phone. No analytics: the URL carries the session code.

document.title = BRAND.name
const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <Phone />
    </StrictMode>,
  )
