import { useState, useCallback } from 'react'
import {
  loadSettings,
  saveSettings,
  applySettings,
  type Settings,
} from '../lib/settings'

export type { Settings }
export { ACCENT_SWATCHES } from '../lib/settings'

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings(prev => {
      const next = { ...prev, ...patch }
      saveSettings(next)
      applySettings(next)
      return next
    })
  }, [])

  return { settings, update }
}
