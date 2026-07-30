import { mutedRgba } from './colour'
import type { Lang } from '../i18n/types'

export interface Settings {
  accent:       string    // hex e.g. '#F6C87A'
  accentRgb:    string    // 'R, G, B' e.g. '246, 200, 122'
  theme:        'dark' | 'light'
  weekStartsOn: 0 | 1    // 0=Sunday, 1=Monday
  lang:         Lang
}

export const DEFAULT_SETTINGS: Settings = {
  accent:       '#F6C87A',
  accentRgb:    '246, 200, 122',
  theme:        'dark',
  weekStartsOn: 1,
  lang:         'en',
}

const LS_KEY = 'ns_settings'

const HEX_RE = /^#[0-9A-Fa-f]{6}$/
const RGB_RE = /^\d{1,3},\s?\d{1,3},\s?\d{1,3}$/

/** Validates each field independently, falling back to the default per-field. */
function sanitize(raw: unknown): Settings {
  const r = (raw && typeof raw === 'object') ? raw as Record<string, unknown> : {}

  const accent = typeof r.accent === 'string' && HEX_RE.test(r.accent)
    ? r.accent
    : DEFAULT_SETTINGS.accent
  const accentRgb = typeof r.accentRgb === 'string' && RGB_RE.test(r.accentRgb)
    ? r.accentRgb
    : DEFAULT_SETTINGS.accentRgb
  const theme = r.theme === 'dark' || r.theme === 'light'
    ? r.theme
    : DEFAULT_SETTINGS.theme
  const weekStartsOn = r.weekStartsOn === 0 || r.weekStartsOn === 1
    ? r.weekStartsOn
    : DEFAULT_SETTINGS.weekStartsOn
  const lang = r.lang === 'en' || r.lang === 'pl'
    ? r.lang
    : DEFAULT_SETTINGS.lang

  return { accent, accentRgb, theme, weekStartsOn, lang }
}

export function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(LS_KEY)
    if (!raw) return DEFAULT_SETTINGS
    return sanitize(JSON.parse(raw))
  } catch {
    return DEFAULT_SETTINGS
  }
}

export function saveSettings(s: Settings): void {
  localStorage.setItem(LS_KEY, JSON.stringify(s))
}

export function applySettings(s: Settings): void {
  const r = document.documentElement
  r.style.setProperty('--ns-accent',       s.accent)
  r.style.setProperty('--ns-accent-rgb',   s.accentRgb)
  r.style.setProperty('--ns-accent-muted', mutedRgba(s.accentRgb))
  r.setAttribute('data-theme', s.theme)
}
