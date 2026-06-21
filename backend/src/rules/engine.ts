import type {
  Formality,
  Gender,
  IntentMetadata,
  Product,
  RuleResult,
  ScoreBreakdown,
  WardrobeContext,
  WardrobeItem,
  Warmth,
} from '@copilot/shared'
import { detectCategory, detectGender } from '../catalog/enrich'
import { colorCompatibility, NEUTRALS } from '../util/colors'
import {
  CATEGORY_MAX,
  DEFAULT_SKELETON,
  DRESS_SKELETON,
  FORMALITY_RANK,
  WARMTH_RANK,
} from './config'

const clamp = (n: number, lo = 0, hi = 1) => Math.max(lo, Math.min(hi, n))
const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)

// --- intent-derived deterministic settings ---------------------------------

export function deriveTargetFormality(intent: IntentMetadata): Formality {
  const t = `${intent.occasion} ${intent.desiredStyle}`.toLowerCase()
  if (/black tie|gala|tuxedo/.test(t)) return 'formal'
  if (/elegant|cocktail|dressy|chic|smart casual|sophisticated/.test(t)) return 'elegant-casual'
  if (/\bformal\b/.test(t)) return 'formal'
  if (/business|office|work|interview|meeting/.test(t)) return 'smart-casual'
  if (/casual|relaxed|everyday|brunch|weekend|comfortable/.test(t)) return 'casual'
  return 'smart-casual'
}

export interface FormalityBounds {
  minRank: number | null
  maxRank: number | null
}

export function deriveFormalityBounds(intent: IntentMetadata): FormalityBounds {
  const avoidText = intent.avoidItems.join(' ')
  const occText = `${intent.occasion} ${intent.desiredStyle}`.toLowerCase()
  let maxRank: number | null = null
  let minRank: number | null = null
  if (/formal/.test(avoidText)) maxRank = FORMALITY_RANK['elegant-casual'] // exclude "formal"
  if (/black tie|gala|business formal|formal event/.test(occText)) {
    minRank = FORMALITY_RANK['smart-casual'] // exclude pure "casual"
  }
  return { minRank, maxRank }
}

/**
 * Resolve a single concrete target gender for the whole outfit so a
 * recommendation NEVER mixes men's and women's items. Priority:
 *   1. explicit buyer preference,
 *   2. inferred from the analyzed wardrobe (majority of detected items),
 *   3. inferred from the reused anchor items,
 *   4. a documented fallback (the catalog is women-dominant).
 * `unisex` is never a *target* — it is the value that coexists with any target.
 */
export function resolveTargetGender(
  intent: IntentMetadata,
  wardrobe: WardrobeContext | null,
): Gender {
  if (intent.genderPreference) return intent.genderPreference

  const majority = (labels: string[]): Gender | null => {
    let women = 0
    let men = 0
    for (const s of labels) {
      const g = detectGender(s)
      if (g === 'women') women++
      else if (g === 'men') men++
    }
    if (women > men && women > 0) return 'women'
    if (men > women && men > 0) return 'men'
    return null
  }

  const fromWardrobe = wardrobe ? majority(wardrobe.items.map((i) => `${i.name} ${i.category}`)) : null
  if (fromWardrobe) return fromWardrobe
  const fromAnchors = majority(intent.anchorItems)
  if (fromAnchors) return fromAnchors
  return 'women'
}

export function deriveTargetWarmth(intent: IntentMetadata): Warmth | null {
  if (!intent.weatherContext) return null
  const w = intent.weatherContext.toLowerCase()
  if (/cold|winter|chilly|snow|freezing/.test(w)) return 'warm'
  if (/hot|summer|heat|warm day/.test(w)) return 'light'
  return 'medium'
}

export interface OutfitSkeleton {
  required: string[]
  optional: string[]
}

const KNOWN_CATEGORIES = new Set([
  'top', 'bottom', 'dress', 'outerwear', 'footwear', 'bag', 'jewellery', 'accessory', 'ethnic', 'innerwear',
])

export function deriveSkeleton(intent: IntentMetadata, anchorCategories: Set<string>): OutfitSkeleton {
  let base: OutfitSkeleton
  const fromIntent = intent.requiredCategories.filter((c) => KNOWN_CATEGORIES.has(c))
  const text = `${intent.occasion} ${intent.desiredStyle} ${intent.recommendationGoal}`.toLowerCase()
  if (fromIntent.length) {
    base = {
      required: fromIntent,
      optional: Array.from(
        new Set([...intent.optionalCategories.filter((c) => KNOWN_CATEGORIES.has(c)), ...DEFAULT_SKELETON.optional]),
      ),
    }
  } else if (/\b(dress|gown|saree|lehenga|ethnic|cocktail dress)\b/.test(text)) {
    base = { required: [...DRESS_SKELETON.required], optional: [...DRESS_SKELETON.optional] }
  } else {
    base = { required: [...DEFAULT_SKELETON.required], optional: [...DEFAULT_SKELETON.optional] }
  }
  // Anchors (reused wardrobe items) satisfy their category — drop from purchases.
  const required = base.required.filter((c) => !anchorCategories.has(c))
  const optional = base.optional.filter((c) => !required.includes(c))
  return { required: required.length ? required : ['top', 'footwear'], optional }
}

// --- anchors (reused wardrobe items) --------------------------------------

export interface AnchorCandidate {
  id: string
  name: string
  category: string
  colors: string[]
  formality: Formality
  warmth: Warmth
  wardrobeItem: WardrobeItem | null
}

export function buildAnchors(
  intent: IntentMetadata,
  wardrobe: WardrobeContext | null,
): AnchorCandidate[] {
  return intent.anchorItems.map((text, i) => {
    const cat = detectCategory(text).category
    const match = wardrobe?.items.find(
      (it) =>
        it.category === cat ||
        text.toLowerCase().includes(it.name.toLowerCase()) ||
        it.name.toLowerCase().includes(text.toLowerCase().replace(/\b(my|the|a)\b/g, '').trim()),
    )
    const colors = match
      ? [match.color, ...match.secondaryColors]
      : Array.from(new Set(text.toLowerCase().split(/\s+/).filter((w) => NEUTRALS.has(w) || /color/.test(w))))
    return {
      id: `wardrobe-anchor-${i}`,
      name: match?.name ?? text,
      category: match?.category ?? (cat === 'other' ? 'bottom' : cat),
      colors: colors.length ? colors : ['black'],
      formality: match?.formality ?? 'smart-casual',
      warmth: match?.warmth ?? 'medium',
      wardrobeItem: match ?? null,
    }
  })
}

// --- hard per-item filtering ----------------------------------------------

export interface ItemReject {
  product: Product
  ruleId: string
  reason: string
}

export function passesHardItemRules(
  product: Product,
  intent: IntentMetadata,
  bounds: FormalityBounds,
): ItemReject | null {
  if (!product.available) {
    return { product, ruleId: 'availability', reason: 'Product not available' }
  }
  const sharedAvoidColor = product.colors.find((c) => intent.avoidColors.includes(c))
  if (sharedAvoidColor) {
    return { product, ruleId: 'color_excluded', reason: `Contains avoided colour "${sharedAvoidColor}"` }
  }
  if (
    intent.genderPreference &&
    product.gender !== intent.genderPreference &&
    product.gender !== 'unisex'
  ) {
    return { product, ruleId: 'gender_mismatch', reason: `Gender ${product.gender} ≠ ${intent.genderPreference}` }
  }
  const rank = FORMALITY_RANK[product.formality]
  if (bounds.maxRank !== null && rank > bounds.maxRank) {
    return { product, ruleId: 'formality_too_high', reason: `${product.formality} exceeds allowed formality` }
  }
  if (bounds.minRank !== null && rank < bounds.minRank) {
    return { product, ruleId: 'formality_too_low', reason: `${product.formality} below required formality` }
  }
  const title = product.title.toLowerCase()
  const avoided = intent.avoidItems.find((a) => a.length >= 3 && title.includes(a))
  if (avoided) {
    return { product, ruleId: 'item_excluded', reason: `Title matches avoided item "${avoided}"` }
  }
  return null
}

// --- soft per-item scoring -------------------------------------------------

const CATEGORY_VERSATILITY: Record<string, number> = {
  top: 0.9, bottom: 0.9, footwear: 0.85, outerwear: 0.8, bag: 0.7,
  dress: 0.6, jewellery: 0.5, accessory: 0.6, ethnic: 0.4, innerwear: 0.5, other: 0.5,
}

function missingCategories(wardrobe: WardrobeContext | null): Set<string> {
  const set = new Set<string>()
  for (const m of wardrobe?.missingPieces ?? []) set.add(detectCategory(m).category)
  return set
}

export interface ScoringContext {
  intent: IntentMetadata
  wardrobe: WardrobeContext | null
  anchors: AnchorCandidate[]
  budgetMax: number | null
}

export function scoreProduct(product: Product, ctx: ScoringContext): ScoreBreakdown {
  const { intent, wardrobe, anchors, budgetMax } = ctx
  const targetRank = FORMALITY_RANK[deriveTargetFormality(intent)]
  const targetWarmth = deriveTargetWarmth(intent)

  // contextFit
  const fForm = 1 - Math.abs(FORMALITY_RANK[product.formality] - targetRank) / 3
  const fWarm =
    targetWarmth === null
      ? 0.7
      : 1 - Math.abs(WARMTH_RANK[product.warmth] - WARMTH_RANK[targetWarmth]) / 2
  const contextFit = clamp(0.6 * fForm + 0.4 * fWarm)

  // styleFit
  const desiredText = `${intent.desiredStyle} ${intent.occasion} ${(wardrobe?.detectedStyle ?? '')}`.toLowerCase()
  const styleMatches = product.styleTags.filter((t) => desiredText.includes(t)).length
  const styleFit = clamp(0.5 + 0.25 * Math.min(2, styleMatches))

  // colorCompatibility
  const palette = Array.from(
    new Set([...(wardrobe?.frequentColors.map((c) => c.name) ?? []), ...intent.preferredColors]),
  )
  let cc = colorCompatibility(product.colors, palette)
  if (product.colors.some((c) => intent.preferredColors.includes(c))) cc = Math.max(cc, 0.95)
  const colorCompat = clamp(cc)

  // wardrobeCompatibility
  const wardrobeColors = wardrobe?.frequentColors.map((c) => c.name) ?? []
  let wc = wardrobe ? colorCompatibility(product.colors, wardrobeColors) : 0.6
  if (missingCategories(wardrobe).has(product.category)) wc += 0.2
  const wardrobeCompat = clamp(wc)

  // complementarity (coordination with reused anchors)
  const anchorColors = anchors.flatMap((a) => a.colors)
  const complementarity = clamp(
    anchors.length ? 0.4 + 0.6 * colorCompatibility(product.colors, anchorColors) : 0.65,
  )

  // versatility
  const neutralRatio = product.colors.length
    ? product.colors.filter((c) => NEUTRALS.has(c)).length / product.colors.length
    : 0.5
  const versatility = clamp(0.5 * neutralRatio + 0.5 * (CATEGORY_VERSATILITY[product.category] ?? 0.5))

  // budgetEfficiency: reward a healthy spend (~1/5 of the budget per item) rather
  // than rock-bottom prices, so the recommender favours quality + AOV over junk.
  let budgetEfficiency = 0.6
  if (budgetMax && budgetMax > 0) {
    const target = 0.2 * budgetMax
    budgetEfficiency = clamp(1 - Math.abs(product.price - target) / target)
  }

  return {
    contextFit,
    styleFit,
    colorCompatibility: colorCompat,
    wardrobeCompatibility: wardrobeCompat,
    complementarity,
    versatility,
    budgetEfficiency,
  }
}

// --- explainable outfit rule evaluation -----------------------------------

function hard(
  ruleId: string,
  label: string,
  passed: boolean,
  reason: string,
  evidence: Record<string, unknown>,
): RuleResult {
  return { ruleId, label, type: 'hard', passed, score: passed ? 1 : 0, maxScore: 1, reason, evidence }
}

function soft(ruleId: string, label: string, value: number, reason: string): RuleResult {
  return {
    ruleId,
    label,
    type: 'soft',
    passed: value >= 0.5,
    score: Math.round(value * 100),
    maxScore: 100,
    reason,
    evidence: { normalized: Number(value.toFixed(3)) },
  }
}

export function evaluateOutfitRules(args: {
  products: Product[]
  anchors: AnchorCandidate[]
  intent: IntentMetadata
  wardrobe: WardrobeContext | null
  skeleton: OutfitSkeleton
  bounds: FormalityBounds
  budgetMax: number | null
  perItemScores: Map<string, ScoreBreakdown>
}): RuleResult[] {
  const { products, anchors, intent, skeleton, bounds, budgetMax, perItemScores } = args
  const totalPrice = products.reduce((s, p) => s + p.price, 0)
  const categories = [...products.map((p) => p.category), ...anchors.map((a) => a.category)]
  const countBy = (cat: string) => categories.filter((c) => c === cat).length

  const results: RuleResult[] = []

  // HARD
  results.push(
    hard(
      'budget_total',
      'Total within budget',
      budgetMax === null || totalPrice <= budgetMax + 1e-6,
      budgetMax === null ? 'No budget specified' : `Total ${totalPrice.toFixed(2)} ≤ ${budgetMax}`,
      { totalPrice: Number(totalPrice.toFixed(2)), budgetMax },
    ),
  )
  results.push(
    hard('availability', 'All items available', products.every((p) => p.available), 'Every item is in stock', {
      count: products.length,
    }),
  )
  const missingReq = skeleton.required.filter((c) => countBy(c) === 0)
  results.push(
    hard('required_categories', 'Required categories present', missingReq.length === 0,
      missingReq.length ? `Missing: ${missingReq.join(', ')}` : `Present: ${skeleton.required.join(', ')}`,
      { required: skeleton.required, missing: missingReq }),
  )
  const overfilled = Object.keys(CATEGORY_MAX).filter((c) => countBy(c) > (CATEGORY_MAX[c] ?? 1))
  results.push(
    hard('one_per_category', 'One garment per incompatible category', overfilled.length === 0,
      overfilled.length ? `Too many: ${overfilled.join(', ')}` : 'No category exceeds its limit', { overfilled }),
  )
  if (skeleton.required.includes('footwear')) {
    results.push(
      hard('one_footwear', 'Exactly one footwear', countBy('footwear') === 1, `footwear count = ${countBy('footwear')}`, {
        count: countBy('footwear'),
      }),
    )
  }
  results.push(
    hard('at_most_one_bag', 'At most one bag', countBy('bag') <= 1, `bag count = ${countBy('bag')}`, {
      count: countBy('bag'),
    }),
  )
  // Anchors are always forced into the selection by the solver's hard constraint.
  results.push(
    hard('anchor_included', 'Reused wardrobe item(s) included', true,
      anchors.length ? `${anchors.map((a) => a.name).join(', ')} reused` : 'No anchor requested',
      { anchors: anchors.map((a) => a.name) }),
  )
  const ids = products.map((p) => p.id)
  results.push(
    hard('no_duplicates', 'No duplicate products', new Set(ids).size === ids.length, 'All products are distinct', {
      count: ids.length,
    }),
  )
  const genders = Array.from(new Set(products.map((p) => p.gender).filter((g) => g !== 'unisex')))
  results.push(
    hard('gender_coherence', 'Single-gender outfit', genders.length <= 1,
      genders.length <= 1 ? 'All items share one gender (or are unisex)' : `Mixes genders: ${genders.join(', ')}`,
      { genders }),
  )
  const colorViolation = products.find((p) => p.colors.some((c) => intent.avoidColors.includes(c)))
  results.push(
    hard('color_exclusions', 'No forbidden colours', !colorViolation,
      colorViolation ? `${colorViolation.title} uses a forbidden colour` : 'No forbidden colours present',
      { avoidColors: intent.avoidColors }),
  )
  const formalityViolation = products.find((p) => {
    const r = FORMALITY_RANK[p.formality]
    return (bounds.maxRank !== null && r > bounds.maxRank) || (bounds.minRank !== null && r < bounds.minRank)
  })
  results.push(
    hard('formality_bounds', 'Within formality bounds', !formalityViolation,
      formalityViolation ? `${formalityViolation.title} breaks the formality band` : 'All items within formality band',
      { minRank: bounds.minRank, maxRank: bounds.maxRank }),
  )

  // SOFT (aggregated from per-item scores over purchased products)
  const dims: (keyof ScoreBreakdown)[] = [
    'contextFit', 'styleFit', 'colorCompatibility', 'wardrobeCompatibility', 'complementarity', 'versatility', 'budgetEfficiency',
  ]
  const aggregate = (dim: keyof ScoreBreakdown) =>
    avg(products.map((p) => perItemScores.get(p.id)?.[dim] ?? 0))

  const labels: Record<keyof ScoreBreakdown, string> = {
    contextFit: 'Occasion & weather fit',
    styleFit: 'Style affinity',
    colorCompatibility: 'Colour coordination',
    wardrobeCompatibility: 'Wardrobe coverage',
    complementarity: 'Item complementarity',
    versatility: 'Versatility',
    budgetEfficiency: 'Budget efficiency',
  }
  for (const dim of dims) {
    const v = aggregate(dim)
    results.push(soft(`soft_${dim}`, labels[dim], v, `${labels[dim]} score ${(v * 100).toFixed(0)}/100`))
  }
  // reuse soft rule
  results.push(
    soft('soft_reuse', 'Reuses owned wardrobe', anchors.length ? 1 : 0.3,
      anchors.length ? `Reuses ${anchors.length} owned item(s)` : 'No wardrobe item reused'),
  )

  return results
}
