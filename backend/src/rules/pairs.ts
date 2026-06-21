import type { Formality, Warmth } from '@copilot/shared'
import { colorCompatibility } from '../util/colors'
import { FORMALITY_RANK, WARMTH_RANK } from './config'

// ---------------------------------------------------------------------------
// Deterministic pairwise compatibility between two co-selectable items.
// Replaces the old per-item complementarity approximation with a real score for
// each pair, which the solver turns into y[i,j] objective bonuses.
// ---------------------------------------------------------------------------

export interface Wearable {
  id: string
  category: string
  colors: string[]
  formality: Formality
  warmth: Warmth
  styleTags?: string[]
  isAnchor?: boolean
}

export interface PairContext {
  /** Target formality rank for the occasion (0..3). */
  targetFormalityRank: number
  /** Colours of the reused anchor items, for the reuse factor. */
  anchorColors: string[]
}

export interface PairScore {
  score: number
  factors: {
    color: number
    formality: number
    style: number
    warmth: number
    category: number
    occasion: number
    reuse: number
  }
  reason: string
}

// Natural affinity between two categories (keys are the two categories sorted).
const CATEGORY_AFFINITY: Record<string, number> = {
  'bottom|top': 1.0,
  'footwear|top': 0.85,
  'bottom|footwear': 0.85,
  'dress|footwear': 0.9,
  'outerwear|top': 0.9,
  'bottom|outerwear': 0.8,
  'dress|outerwear': 0.85,
  'bag|top': 0.72,
  'bag|bottom': 0.72,
  'bag|dress': 0.75,
  'bag|footwear': 0.72,
  'bag|outerwear': 0.72,
  'jewellery|top': 0.62,
  'bottom|jewellery': 0.6,
  'dress|jewellery': 0.8,
  'accessory|top': 0.6,
  'accessory|bottom': 0.6,
  'accessory|dress': 0.65,
  'bag|jewellery': 0.6,
  'accessory|bag': 0.6,
  'accessory|jewellery': 0.55,
}

function categoryAffinity(a: string, b: string): number {
  if (a === b) return 0.3 // two of the same category rarely coexist
  const key = [a, b].sort().join('|')
  return CATEGORY_AFFINITY[key] ?? 0.6
}

function styleAffinity(a: string[] = [], b: string[] = []): number {
  if (a.length === 0 || b.length === 0) return 0.6
  const sa = new Set(a)
  const inter = b.filter((t) => sa.has(t)).length
  const union = new Set([...a, ...b]).size
  return union ? 0.5 + 0.5 * (inter / union) : 0.6
}

const clamp = (n: number) => Math.max(0, Math.min(1, n))

const FACTOR_WEIGHTS = {
  color: 0.25,
  formality: 0.15,
  style: 0.12,
  warmth: 0.1,
  category: 0.18,
  occasion: 0.12,
  reuse: 0.08,
}

export function computePairCompatibility(a: Wearable, b: Wearable, ctx: PairContext): PairScore {
  const color = colorCompatibility(a.colors, b.colors)
  const formality = 1 - Math.abs(FORMALITY_RANK[a.formality] - FORMALITY_RANK[b.formality]) / 3
  const style = styleAffinity(a.styleTags, b.styleTags)
  const warmth = 1 - Math.abs(WARMTH_RANK[a.warmth] - WARMTH_RANK[b.warmth]) / 2
  const category = categoryAffinity(a.category, b.category)
  const occA = 1 - Math.abs(FORMALITY_RANK[a.formality] - ctx.targetFormalityRank) / 3
  const occB = 1 - Math.abs(FORMALITY_RANK[b.formality] - ctx.targetFormalityRank) / 3
  const occasion = (occA + occB) / 2

  let reuse = 0.6
  if (a.isAnchor || b.isAnchor) {
    const anchor = a.isAnchor ? a : b
    const other = a.isAnchor ? b : a
    reuse = colorCompatibility(other.colors, anchor.colors)
  } else if (ctx.anchorColors.length) {
    reuse = colorCompatibility([...a.colors, ...b.colors], ctx.anchorColors)
  }

  const factors = {
    color: clamp(color),
    formality: clamp(formality),
    style: clamp(style),
    warmth: clamp(warmth),
    category: clamp(category),
    occasion: clamp(occasion),
    reuse: clamp(reuse),
  }

  const score = clamp(
    factors.color * FACTOR_WEIGHTS.color +
      factors.formality * FACTOR_WEIGHTS.formality +
      factors.style * FACTOR_WEIGHTS.style +
      factors.warmth * FACTOR_WEIGHTS.warmth +
      factors.category * FACTOR_WEIGHTS.category +
      factors.occasion * FACTOR_WEIGHTS.occasion +
      factors.reuse * FACTOR_WEIGHTS.reuse,
  )

  return { score, factors, reason: describePair(a, b, factors) }
}

function describePair(a: Wearable, b: Wearable, f: PairScore['factors']): string {
  const strong: string[] = []
  const weak: string[] = []
  const note = (cond: boolean, label: string, arr: string[]) => cond && arr.push(label)
  note(f.color >= 0.8, 'colours coordinate', strong)
  note(f.category >= 0.8, 'natural category pairing', strong)
  note(f.formality >= 0.85, 'matching formality', strong)
  note(f.occasion >= 0.8, 'both fit the occasion', strong)
  note(f.color < 0.5, 'colour clash', weak)
  note(f.formality < 0.5, 'formality mismatch', weak)
  note(f.category < 0.5, 'unusual pairing', weak)
  const aN = a.category
  const bN = b.category
  if (weak.length && !strong.length) return `${aN} + ${bN}: ${weak.join(', ')}`
  if (strong.length) return `${aN} + ${bN}: ${strong.join(', ')}${weak.length ? ` (but ${weak.join(', ')})` : ''}`
  return `${aN} + ${bN}: acceptable combination`
}
