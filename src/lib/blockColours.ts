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

/** '#RRGGBB' → 'R, G, B', for feeding rgba(var(--x-rgb), alpha) custom properties. */
export function hexToRgbTriple(hex: string): string {
  const clean = hex.replace('#', '')
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r}, ${g}, ${b}`
}
