import type { Formality, Warmth } from '@copilot/shared'
import { businessRules } from '../businessRules'

// ---------------------------------------------------------------------------
// Static lookup maps for the deterministic engine. All tunable numbers
// (weights, limits, penalties…) live in config/business-rules.json and are
// re-exported here from the validated `businessRules` object — no magic numbers.
// ---------------------------------------------------------------------------

/** Soft scores are floats in [0,1]; CP-SAT needs integers. We scale by this. */
export const SCORE_SCALE = businessRules.scoreScale

/** Default soft-preference weights (the balanced policy may be overridden per request). */
export const SOFT_WEIGHTS = businessRules.weights

export const FORMALITY_RANK: Record<Formality, number> = {
  casual: 0,
  'smart-casual': 1,
  'elegant-casual': 2,
  formal: 3,
}

export const RANK_FORMALITY: Formality[] = ['casual', 'smart-casual', 'elegant-casual', 'formal']

export const WARMTH_RANK: Record<Warmth, number> = {
  light: 0,
  medium: 1,
  warm: 2,
}

/** Default outfit skeletons (purchase categories) by goal. */
export const DEFAULT_SKELETON = {
  required: ['top', 'bottom', 'footwear'],
  optional: ['outerwear', 'bag', 'jewellery', 'accessory'],
}

export const DRESS_SKELETON = {
  required: ['dress', 'footwear'],
  optional: ['outerwear', 'bag', 'jewellery', 'accessory'],
}

/** Per-category default max count in a single outfit (incompatibility limits). */
export const CATEGORY_MAX: Record<string, number> = businessRules.categoryMax

/** Categories that cannot coexist (e.g. a dress and a separate top/bottom). */
export const INCOMPATIBLE_CATEGORIES: [string, string][] =
  businessRules.incompatibleCategories as [string, string][]

export const MAX_TOTAL_ITEMS = businessRules.items.max
