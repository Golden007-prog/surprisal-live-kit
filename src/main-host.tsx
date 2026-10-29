import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BRAND } from './brand'
import './styles/theme.css'
import './styles/app.css'
import { Host } from './screens/Host'
// The host. No analytics: the URL carries the session code.

document.title = `Host · ${BRAND.name}`
const root = document.getElementById('root')
if (root)
  createRoot(root).render(
    <StrictMode>
      <Host />
    </StrictMode>,
  )
