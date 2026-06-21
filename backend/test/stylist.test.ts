import { describe, expect, it } from 'vitest'
import type {
  IntentMetadata,
  OutfitRecommendation,
  Product,
  WardrobeContext,
} from '@copilot/shared'
import type { GenerateArgs, LlmProvider } from '../src/llm/provider'
import { selectBestOutfit } from '../src/llm/stylist'

class CapturingProvider implements LlmProvider {
  name = 'fake'
  available = true
  calls: GenerateArgs[] = []

  constructor(private readonly responses: string[]) {}

  async generateJson(args: GenerateArgs): Promise<string> {
    this.calls.push(args)
    return this.responses.shift() ?? '{}'
  }
}

const scores = {
  contextFit: 0.8,
  styleFit: 0.8,
  colorCompatibility: 0.8,
  wardrobeCompatibility: 0.8,
  complementarity: 0.8,
  versatility: 0.8,
  budgetEfficiency: 0.8,
}

function product(id: string, title: string): Product {
  return {
    id,
    sourceId: Number(id.replace(/\D/g, '')),
    brand: 'Test brand',
    title,
    price: 50,
    listPrice: null,
    currency: '€',
    url: '',
    image: '',
    category: 'top',
    subcategory: null,
    colors: ['black'],
    styleTags: ['minimal'],
    formality: 'smart-casual',
    warmth: 'medium',
    gender: 'women',
    available: true,
    source: 'catalog',
    availableSizes: null,
    stockStatus: 'unknown',
    stockQuantity: null,
    availabilitySource: 'catalog-default',
  }
}

function outfit(rank: number, item: Product): OutfitRecommendation {
  return {
    rank,
    products: [item],
    reusedWardrobeItems: [],
    totalPrice: item.price,
    currency: '€',
    overBudget: false,
    objectiveScore: 1000 - rank,
    scoreBreakdown: scores,
    objectiveBreakdown: {
      qualityScore: 1,
      pairCompatibilityScore: 1,
      completenessBonus: 1,
      pricePenalty: 0,
      optionalItemPenalty: 0,
      complexityPenalty: 0,
      diversityPenalty: 0,
      finalObjectiveScore: 1,
    },
    itemContributions: [],
    pairCompatibilities: [],
    diversity: null,
    rules: [],
    explanation: {
      summary: `Solver explanation ${rank}`,
      perItem: [{ productId: item.id, reason: 'Deterministic reason' }],
      source: 'deterministic',
    },
  }
}

const intent: IntentMetadata = {
  occasion: 'dinner',
  location: null,
  weatherContext: null,
  desiredStyle: 'minimal',
  budgetLevel: 'medium',
  minBudget: null,
  maxBudget: 200,
  anchorItems: [],
  avoidItems: [],
  avoidColors: [],
  preferredColors: ['black'],
  requiredCategories: [],
  optionalCategories: [],
  recommendationGoal: 'complete outfit',
  sizeConstraints: null,
  requestedSizes: [],
  genderPreference: 'women',
}

const wardrobe: WardrobeContext = {
  detectedStyle: 'minimal',
  styleConfidence: 0.9,
  frequentColors: [{ name: 'black', hex: '#000000' }],
  keyPieces: ['black trousers'],
  missingPieces: ['elevated top'],
  predominantFormality: 'smart-casual',
  items: [],
}

describe('post-solver stylist selection', () => {
  it('selects only from solver-valid outfits and receives the wardrobe context', async () => {
    const first = outfit(1, product('cat-1', 'Basic top'))
    const second = outfit(2, product('cat-2', 'Elevated top'))
    const provider = new CapturingProvider([
      JSON.stringify({
        selectedOutfitId: 'solver-outfit-2',
        reason: 'It fills the elevated-top wardrobe gap.',
        summary: 'Choose the elevated top for the dinner look.',
        perItem: [{ productId: 'cat-2', reason: 'Complements the black trousers.' }],
      }),
    ])

    const result = await selectBestOutfit(provider, { intent, wardrobe, outfits: [first, second] })

    expect(result.selectedOutfitRank).toBe(2)
    expect(result.source).toBe('llm')
    expect(result.explanation.perItem[0].productId).toBe('cat-2')
    expect(provider.calls[0].prompt).toContain('"detectedStyle":"minimal"')
    expect(provider.calls[0].prompt).toContain('solver-outfit-1')
    expect(provider.calls[0].prompt).toContain('solver-outfit-2')
  })

  it('falls back to solver rank one when the model invents an outfit id twice', async () => {
    const first = outfit(1, product('cat-1', 'Basic top'))
    const second = outfit(2, product('cat-2', 'Elevated top'))
    const invalid = JSON.stringify({
      selectedOutfitId: 'invented-outfit',
      reason: 'Invalid',
      summary: 'Invalid',
      perItem: [],
    })
    const provider = new CapturingProvider([invalid, invalid])

    const result = await selectBestOutfit(provider, { intent, wardrobe, outfits: [first, second] })

    expect(provider.calls).toHaveLength(2)
    expect(result.selectedOutfitRank).toBe(1)
    expect(result.source).toBe('solver')
    expect(result.explanation.source).toBe('deterministic')
  })
})
