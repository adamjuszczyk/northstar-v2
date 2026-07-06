import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { loadSettings, applySettings } from './lib/settings'
import './styles/global.css'
import './styles/animations.css'
import App from './App'

// Apply saved settings before first paint to avoid flash of wrong theme/accent
applySettings(loadSettings())

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
