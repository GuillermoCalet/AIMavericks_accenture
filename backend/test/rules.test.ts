import { describe, it, expect } from 'vitest'
import type { IntentMetadata, Product, WardrobeContext } from '@copilot/shared'
import {
  buildAnchors,
  deriveFormalityBounds,
  deriveSkeleton,
  deriveTargetFormality,
  evaluateOutfitRules,
  passesHardItemRules,
  resolveTargetGender,
  scoreProduct,
} from '../src/rules/engine'

function product(overrides: Partial<Product> = {}): Product {
  return {
    id: 'cat-1',
    sourceId: 1,
    brand: 'Test',
    title: 'Test product',
    price: 50,
    listPrice: 80,
    currency: '€',
    url: '',
    image: '',
    category: 'top',
    subcategory: null,
    colors: ['black'],
    styleTags: [],
    formality: 'smart-casual',
    warmth: 'medium',
    gender: 'women',
    available: true,
    source: 'catalog',
    availableSizes: null,
    stockStatus: 'unknown',
    stockQuantity: null,
    availabilitySource: 'catalog-default',
    ...overrides,
  }
}

function intent(overrides: Partial<IntentMetadata> = {}): IntentMetadata {
  return {
    occasion: 'casual dinner',
    location: 'Barcelona',
    weatherContext: 'mild evening',
    desiredStyle: 'elegant casual',
    budgetLevel: 'medium',
    minBudget: null,
    maxBudget: 250,
    anchorItems: ['black jeans'],
    avoidItems: ['overly formal'],
    avoidColors: [],
    preferredColors: ['beige', 'black'],
    requiredCategories: [],
    optionalCategories: [],
    recommendationGoal: 'complete outfit',
    sizeConstraints: null,
    requestedSizes: [],
    genderPreference: 'women',
    ...overrides,
  }
}

const wardrobe: WardrobeContext = {
  detectedStyle: 'Minimal smart-casual',
  styleConfidence: 0.9,
  frequentColors: [{ name: 'black', hex: '#000' }],
  keyPieces: ['black jeans'],
  missingPieces: ['elevated top'],
  predominantFormality: 'smart-casual',
  items: [
    {
      name: 'Black jeans',
      category: 'bottom',
      subcategory: 'jeans',
      color: 'black',
      secondaryColors: [],
      formality: 'smart-casual',
      warmth: 'medium',
      styleTags: ['denim'],
    },
  ],
}

describe('intent-derived settings', () => {
  it('derives elegant-casual target from "elegant" cue', () => {
    expect(deriveTargetFormality(intent())).toBe('elegant-casual')
    expect(deriveTargetFormality(intent({ occasion: 'business meeting', desiredStyle: 'professional' }))).toBe(
      'smart-casual',
    )
  })

  it('caps formality when the user avoids "formal"', () => {
    const bounds = deriveFormalityBounds(intent({ avoidItems: ['overly formal'] }))
    expect(bounds.maxRank).toBe(2) // elegant-casual rank, excludes "formal"
  })

  it('drops anchor categories from the purchase skeleton', () => {
    const anchors = buildAnchors(intent(), wardrobe)
    const skeleton = deriveSkeleton(intent(), new Set(anchors.map((a) => a.category)))
    expect(anchors[0].category).toBe('bottom')
    expect(skeleton.required).not.toContain('bottom')
    expect(skeleton.required).toContain('top')
    expect(skeleton.required).toContain('footwear')
  })
})

describe('resolveTargetGender (no mixed-gender outfits)', () => {
  it('uses the explicit preference first', () => {
    expect(resolveTargetGender(intent({ genderPreference: 'men' }), wardrobe)).toBe('men')
  })
  it('infers from the wardrobe when no preference is given', () => {
    const menWardrobe: WardrobeContext = {
      ...wardrobe,
      items: [
        { name: "Men's slim shirt", category: 'top', subcategory: null, color: 'blue', secondaryColors: [], formality: 'smart-casual', warmth: 'medium', styleTags: [] },
        { name: 'Men black trousers', category: 'bottom', subcategory: null, color: 'black', secondaryColors: [], formality: 'smart-casual', warmth: 'medium', styleTags: [] },
      ],
    }
    expect(resolveTargetGender(intent({ genderPreference: null }), menWardrobe)).toBe('men')
  })
  it('falls back to women (catalog-dominant) when there is no signal', () => {
    expect(resolveTargetGender(intent({ genderPreference: null, anchorItems: [] }), null)).toBe('women')
  })
})

describe('gender_coherence rule', () => {
  const anchors = buildAnchors(intent(), wardrobe)
  const skeleton = deriveSkeleton(intent(), new Set(anchors.map((a) => a.category)))
  const bounds = deriveFormalityBounds(intent())
  const base = { anchors, intent: intent(), wardrobe, skeleton, bounds, budgetMax: 250, perItemScores: new Map() }

  it('passes for a single-gender (+ unisex) outfit', () => {
    const rules = evaluateOutfitRules({
      ...base,
      products: [product({ id: 'a', gender: 'women' }), product({ id: 'b', category: 'footwear', gender: 'unisex' })],
    })
    expect(rules.find((r) => r.ruleId === 'gender_coherence')?.passed).toBe(true)
  })
  it('fails when an outfit mixes men and women', () => {
    const rules = evaluateOutfitRules({
      ...base,
      products: [product({ id: 'a', gender: 'women' }), product({ id: 'b', category: 'footwear', gender: 'men' })],
    })
    expect(rules.find((r) => r.ruleId === 'gender_coherence')?.passed).toBe(false)
  })
})

describe('buildAnchors', () => {
  it('matches the reused item to a wardrobe entry (price 0, reused)', () => {
    const anchors = buildAnchors(intent({ anchorItems: ['black jeans'] }), wardrobe)
    expect(anchors).toHaveLength(1)
    expect(anchors[0].wardrobeItem?.name).toBe('Black jeans')
    expect(anchors[0].colors).toContain('black')
  })
})

describe('passesHardItemRules', () => {
  const bounds = deriveFormalityBounds(intent())
  it('rejects forbidden colours', () => {
    const r = passesHardItemRules(product({ colors: ['red'] }), intent({ avoidColors: ['red'] }), bounds)
    expect(r?.ruleId).toBe('color_excluded')
  })
  it('rejects gender mismatch but allows unisex', () => {
    expect(passesHardItemRules(product({ gender: 'men' }), intent({ genderPreference: 'women' }), bounds)?.ruleId).toBe(
      'gender_mismatch',
    )
    expect(passesHardItemRules(product({ gender: 'unisex' }), intent({ genderPreference: 'women' }), bounds)).toBeNull()
  })
  it('rejects items above the formality cap', () => {
    const r = passesHardItemRules(product({ formality: 'formal' }), intent({ avoidItems: ['overly formal'] }), bounds)
    expect(r?.ruleId).toBe('formality_too_high')
  })
  it('accepts an in-band item', () => {
    expect(passesHardItemRules(product({ formality: 'elegant-casual' }), intent(), bounds)).toBeNull()
  })
})

describe('scoreProduct', () => {
  it('returns all dimensions within [0,1]', () => {
    const s = scoreProduct(product(), { intent: intent(), wardrobe, anchors: [], budgetMax: 250 })
    for (const v of Object.values(s)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(1)
    }
  })
  it('boosts colour compatibility for preferred colours', () => {
    const beige = scoreProduct(product({ colors: ['beige'] }), { intent: intent(), wardrobe, anchors: [], budgetMax: 250 })
    const green = scoreProduct(product({ colors: ['green'] }), { intent: intent(), wardrobe, anchors: [], budgetMax: 250 })
    expect(beige.colorCompatibility).toBeGreaterThan(green.colorCompatibility)
  })
})

describe('evaluateOutfitRules', () => {
  const anchors = buildAnchors(intent(), wardrobe)
  const skeleton = deriveSkeleton(intent(), new Set(anchors.map((a) => a.category)))
  const bounds = deriveFormalityBounds(intent())
  const top = product({ id: 'cat-1', category: 'top', formality: 'elegant-casual' })
  const shoe = product({ id: 'cat-2', category: 'footwear', price: 60, formality: 'elegant-casual' })
  const perItemScores = new Map([
    [top.id, scoreProduct(top, { intent: intent(), wardrobe, anchors, budgetMax: 250 })],
    [shoe.id, scoreProduct(shoe, { intent: intent(), wardrobe, anchors, budgetMax: 250 })],
  ])

  it('passes when the outfit respects budget and includes the anchor', () => {
    const rules = evaluateOutfitRules({
      products: [top, shoe],
      anchors,
      intent: intent(),
      wardrobe,
      skeleton,
      bounds,
      budgetMax: 250,
      perItemScores,
    })
    const byId = Object.fromEntries(rules.map((r) => [r.ruleId, r]))
    expect(byId.budget_total.passed).toBe(true)
    expect(byId.anchor_included.passed).toBe(true)
    expect(byId.required_categories.passed).toBe(true)
    expect(byId.one_footwear.passed).toBe(true)
  })

  it('fails the budget rule when total exceeds the budget', () => {
    const rules = evaluateOutfitRules({
      products: [top, shoe],
      anchors,
      intent: intent(),
      wardrobe,
      skeleton,
      bounds,
      budgetMax: 50,
      perItemScores,
    })
    expect(rules.find((r) => r.ruleId === 'budget_total')?.passed).toBe(false)
  })

  it('flags forbidden colours in the chosen outfit', () => {
    const red = product({ id: 'cat-9', category: 'top', colors: ['red'] })
    const rules = evaluateOutfitRules({
      products: [red, shoe],
      anchors,
      intent: intent({ avoidColors: ['red'] }),
      wardrobe,
      skeleton,
      bounds,
      budgetMax: 250,
      perItemScores: new Map([[red.id, perItemScores.get(top.id)!], [shoe.id, perItemScores.get(shoe.id)!]]),
    })
    expect(rules.find((r) => r.ruleId === 'color_exclusions')?.passed).toBe(false)
  })
})
