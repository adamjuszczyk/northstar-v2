import { useSyncExternalStore, useCallback } from 'react'
import {
  loadSettings,
  saveSettings,
  applySettings,
  type Settings,
} from '../lib/settings'

export type { Settings }

// Module-level singleton: every useSettings() call site reads/writes the same
// value, so a patch from one component (e.g. an accent swatch) can never
// clobber a field changed by another (e.g. theme) with a stale copy.
let currentSettings: Settings = loadSettings()
const listeners = new Set<() => void>()

function setSettings(next: Settings): void {
  currentSettings = next
  saveSettings(next)
  applySettings(next)
  listeners.forEach(l => l())
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function getSnapshot(): Settings {
  return currentSettings
}

export function useSettings() {
  const settings = useSyncExternalStore(subscribe, getSnapshot)

  const update = useCallback((patch: Partial<Settings>) => {
    setSettings({ ...currentSettings, ...patch })
  }, [])

  return { settings, update }
}
