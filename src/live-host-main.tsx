import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRAND } from './brand'
import './styles/theme.css'
import './live/live.css'
import { Host } from './live/Host'
// The host. No analytics: the URL carries the session code.

document.title = `Host · ${BRAND.name}`
const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <Host />
    </StrictMode>,
  )
