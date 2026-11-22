// Global styles first so component and screen styles can override them.
import './styles/fonts.css'
import './styles/tokens.css'
import './styles/base.css'
import './styles/motion.css'
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { startAnalytics } from './lib/analytics'
import { startFathom } from './lib/fathom'
import { applyDocumentLanguage } from './i18n'
import { registerServiceWorker } from './lib/pwa'

applyDocumentLanguage()

// Older versions of the admin queue left a bearer token on this origin.
try { sessionStorage.removeItem('wohin-admin-token') } catch { /* Storage may be disabled. */ }

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)

startFathom(import.meta.env.VITE_FATHOM_SITE_ID)
registerServiceWorker()
startAnalytics()
