import { mutedRgba } from '../lib/colour'
import { useSettings } from './useSettings'
import type { Key } from '../i18n'

export interface AccentOption {
  label:    string   // English fallback (used nowhere directly translated — labelKey drives display)
  labelKey: Key
  hex:      string   // e.g. '#F6C87A'
  rgb:      string   // 'R, G, B' e.g. '246, 200, 122'
}

/** Curated accent palette (design-handoff/1b). Gold is the default. */
export const ACCENT_OPTIONS: readonly AccentOption[] = [
  { label: 'Gold',        labelKey: 'settings.accent.gold',       hex: '#F6C87A', rgb: '246, 200, 122' },
  { label: 'Warm Amber',  labelKey: 'settings.accent.warmAmber',  hex: '#E8913C', rgb: '232, 145, 60'  },
  { label: 'Steel Blue',  labelKey: 'settings.accent.steelBlue',  hex: '#7FA0D4', rgb: '127, 160, 212' },
  { label: 'Soft Violet', labelKey: 'settings.accent.softViolet', hex: '#B49BEA', rgb: '180, 155, 234' },
  { label: 'Sage Green',  labelKey: 'settings.accent.sageGreen',  hex: '#8FC69A', rgb: '143, 198, 154' },
  { label: 'Rose',        labelKey: 'settings.accent.rose',       hex: '#E79BAC', rgb: '231, 155, 172' },
] as const

/**
 * Reads/writes the user's accent colour. --ns-accent-muted is always derived
 * from --ns-accent's RGB triplet at render time — never a hardcoded per-swatch
 * value — so fills, hovers and active states can never drift out of lockstep.
 */
export function useAccentColour() {
  const { settings, update } = useSettings()

  return {
    accent:      settings.accent,
    accentRgb:   settings.accentRgb,
    accentMuted: mutedRgba(settings.accentRgb),
    options:     ACCENT_OPTIONS,
    setAccent:   (opt: AccentOption) => update({ accent: opt.hex, accentRgb: opt.rgb }),
  }
}
