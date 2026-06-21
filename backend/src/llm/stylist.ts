import { z } from 'zod'
import type {
  IntentMetadata,
  OutfitRecommendation,
  WardrobeContext,
} from '@copilot/shared'
import type { LlmProvider } from './provider'
import { StylistSelectionLlmSchema } from './schemas'
import { generateStructured } from './structured'

export interface StylistSelectionInput {
  intent: IntentMetadata
  wardrobe: WardrobeContext | null
  outfits: OutfitRecommendation[]
}

export interface StylistSelectionResult {
  selectedOutfitRank: number
  source: 'llm' | 'solver'
  reason: string
  explanation: OutfitRecommendation['explanation']
}

const SYSTEM = `You are the final fashion stylist in a constrained recommendation pipeline.
A deterministic OR-Tools solver has already produced feasible outfits. Select the best existing
outfit for this user's intent and wardrobe.

Rules:
- You may ONLY select one supplied outfitId.
- You may NOT add, remove, replace, rename or invent products.
- Prefer pieces that complement the clothes the user already owns, fill useful wardrobe gaps,
  fit the occasion and style, and respect the solver evidence.
- Treat solver constraints as authoritative.
- Base every claim only on the supplied JSON.
- Return strictly valid JSON.`

function outfitId(rank: number): string {
  return `solver-outfit-${rank}`
}

function buildPrompt(input: StylistSelectionInput): string {
  const candidates = input.outfits.map((outfit) => ({
    outfitId: outfitId(outfit.rank),
    solverRank: outfit.rank,
    objectiveScore: outfit.objectiveScore,
    totalPrice: outfit.totalPrice,
    currency: outfit.currency,
    products: outfit.products.map((product) => ({
      id: product.id,
      title: product.title,
      brand: product.brand,
      category: product.category,
      subcategory: product.subcategory,
      colors: product.colors,
      styleTags: product.styleTags,
      formality: product.formality,
      warmth: product.warmth,
      price: product.price,
    })),
    reusedWardrobeItems: outfit.reusedWardrobeItems,
    scoreBreakdown: outfit.scoreBreakdown,
    passedRules: outfit.rules
      .filter((rule) => rule.passed)
      .map((rule) => ({ id: rule.ruleId, label: rule.label, reason: rule.reason })),
  }))

  return `Choose the best solver-valid outfit using the complete context below.
Return JSON with this exact shape:
{
  "selectedOutfitId": string,
  "reason": string,
  "summary": string,
  "perItem": [{ "productId": string, "reason": string }]
}

"selectedOutfitId" must be one of the supplied outfitId values.
"perItem" may only reference product IDs from the selected outfit.
"reason" briefly explains why this candidate wins over the other feasible candidates.
"summary" is a concise 2-3 sentence recommendation for the user.

intentMetadata: ${JSON.stringify(input.intent)}
wardrobeContext: ${JSON.stringify(input.wardrobe)}
solverValidOutfits: ${JSON.stringify(candidates)}`
}

function solverFallback(input: StylistSelectionInput): StylistSelectionResult {
  const first = input.outfits[0]
  return {
    selectedOutfitRank: first.rank,
    source: 'solver',
    reason: 'Selected as the highest-ranked feasible outfit from the deterministic solver.',
    explanation: first.explanation,
  }
}

export async function selectBestOutfit(
  provider: LlmProvider,
  input: StylistSelectionInput,
): Promise<StylistSelectionResult> {
  if (input.outfits.length === 0) {
    throw new Error('Cannot select an outfit from an empty solver result.')
  }
  if (!provider.available) return solverFallback(input)

  const byId = new Map(input.outfits.map((outfit) => [outfitId(outfit.rank), outfit]))
  const validatedSchema = StylistSelectionLlmSchema.superRefine((value, ctx) => {
    const selected = byId.get(value.selectedOutfitId)
    if (!selected) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['selectedOutfitId'],
        message: 'Must reference one of the supplied solver-valid outfit IDs.',
      })
      return
    }
    const validProductIds = new Set(selected.products.map((product) => product.id))
    value.perItem.forEach((item, index) => {
      if (!validProductIds.has(item.productId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['perItem', index, 'productId'],
          message: 'Must reference a product in the selected outfit.',
        })
      }
    })
  })

  try {
    const result = await generateStructured(provider, validatedSchema, {
      system: SYSTEM,
      prompt: buildPrompt(input),
    })
    const selected = byId.get(result.selectedOutfitId)
    if (!selected) return solverFallback(input)

    const llmReasons = new Map(result.perItem.map((item) => [item.productId, item.reason]))
    const deterministicReasons = new Map(
      selected.explanation.perItem.map((item) => [item.productId, item.reason]),
    )
    const perItem = selected.products.map((product) => ({
      productId: product.id,
      reason:
        llmReasons.get(product.id) ??
        deterministicReasons.get(product.id) ??
        `Selected as part of the solver-valid outfit for ${input.intent.occasion}.`,
    }))

    return {
      selectedOutfitRank: selected.rank,
      source: 'llm',
      reason: result.reason,
      explanation: { summary: result.summary, perItem, source: 'llm' },
    }
  } catch {
    return solverFallback(input)
  }
}
