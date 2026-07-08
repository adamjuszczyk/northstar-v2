/** Derives a translucent variant from an 'R, G, B' triplet string. */
export function mutedRgba(rgb: string, alpha = 0.16): string {
  return `rgba(${rgb}, ${alpha})`
}
