// Deterministic colour utilities shared by enrichment, rules and the UI mapping.

export const COLOR_HEX: Record<string, string> = {
  black: '#15151a',
  white: '#f7f5f0',
  ivory: '#f4efe6',
  cream: '#efe7d6',
  beige: '#d8c6a6',
  tan: '#c8a877',
  khaki: '#b7a06a',
  brown: '#6f4e37',
  navy: '#27324d',
  blue: '#2f6df6',
  teal: '#1f7a7a',
  green: '#3a7d44',
  olive: '#708238',
  red: '#c0392b',
  maroon: '#7b1e2b',
  wine: '#722f37',
  pink: '#e79ab0',
  peach: '#f1c4a8',
  purple: '#6c4f9e',
  lavender: '#b9a7d6',
  grey: '#8a8a93',
  silver: '#c9c9d1',
  gold: '#c9a86a',
  yellow: '#e6c34a',
  mustard: '#d4a017',
  orange: '#e08a3c',
  rust: '#a4451f',
  multicolor: '#9aa0a6',
}

export function colorHex(name: string): string {
  return COLOR_HEX[name.toLowerCase()] ?? '#9aa0a6'
}

export const NEUTRALS = new Set([
  'black',
  'white',
  'ivory',
  'cream',
  'beige',
  'tan',
  'khaki',
  'grey',
  'silver',
  'navy',
  'gold',
])

/**
 * Colour compatibility score in [0,1] between two palettes.
 * Neutrals pair with everything; shared hues score highly; otherwise neutral 0.5.
 */
export function colorCompatibility(a: string[], b: string[]): number {
  if (a.length === 0 || b.length === 0) return 0.6
  const shared = a.some((c) => b.includes(c))
  if (shared) return 1
  const allNeutral = [...a, ...b].every((c) => NEUTRALS.has(c))
  if (allNeutral) return 0.9
  const someNeutral = a.some((c) => NEUTRALS.has(c)) || b.some((c) => NEUTRALS.has(c))
  return someNeutral ? 0.7 : 0.45
}
