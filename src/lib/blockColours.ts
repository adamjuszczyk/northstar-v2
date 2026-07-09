export interface BlockColour {
  name: string
  hex:  string
}

/** Curated 10-swatch palette (design-handoff/1c). Cosmetic only — independent of priority. */
export const BLOCK_COLOURS: readonly BlockColour[] = [
  { name: 'Gold',   hex: '#F6C87A' },
  { name: 'Amber',  hex: '#E8913C' },
  { name: 'Coral',  hex: '#E87A64' },
  { name: 'Rose',   hex: '#E79BAC' },
  { name: 'Violet', hex: '#B49BEA' },
  { name: 'Indigo', hex: '#8C9CE8' },
  { name: 'Steel',  hex: '#7FA0D4' },
  { name: 'Teal',   hex: '#5FC4BC' },
  { name: 'Sage',   hex: '#8FC69A' },
  { name: 'Slate',  hex: '#9AA3B2' },
] as const

export function blockColourName(hex: string | null): string | null {
  if (!hex) return null
  return BLOCK_COLOURS.find(c => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? null
}
