export interface Settings {
  accent:       string    // hex e.g. '#F6C87A'
  accentRgb:    string    // 'R, G, B' e.g. '246, 200, 122'
  theme:        'dark' | 'light'
  weekStartsOn: 0 | 1    // 0=Sunday, 1=Monday
}

export const ACCENT_SWATCHES = [
  { label: 'Gold',   hex: '#F6C87A', rgb: '246, 200, 122' },
  { label: 'Rose',   hex: '#F09090', rgb: '240, 144, 144' },
  { label: 'Mint',   hex: '#84D2A6', rgb: '132, 210, 166' },
  { label: 'Sky',    hex: '#8FA6CB', rgb: '143, 166, 203' },
  { label: 'Violet', hex: '#C4A8E0', rgb: '196, 168, 224' },
  { label: 'Silver', hex: '#B0BAC8', rgb: '176, 186, 200' },
] as const

export const DEFAULT_SETTINGS: Settings = {
  accent:       '#F6C87A',
  accentRgb:    '246, 200, 122',
  theme:        'dark',
  weekStartsOn: 1,
}

const LS_KEY = 'ns_settings'

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return { ...DEFAULT_SETTINGS, ...JSON.parse(raw) }
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

export function applySettings(s: Settings): void {
  const r = document.documentElement
  r.style.setProperty('--ns-accent',     s.accent)
  r.style.setProperty('--ns-accent-rgb', s.accentRgb)
  r.setAttribute('data-theme', s.theme)
}
