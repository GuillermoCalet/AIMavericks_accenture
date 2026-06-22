import { z } from 'zod'
import type {
  IntentMetadata,
  OutfitRecommendation,
  StylistOutfitEvaluation,
  WardrobeContext,
} from '@copilot/shared'
import type { LlmProvider } from './provider'
import { StylistSelectionLlmSchema } from './schemas'
import { generateStructured } from './structured'

export interface StylistSelectionInput {
  intent: IntentMetadata
  wardrobe: WardrobeContext | null
  outfits: OutfitRecommendation[]
  solverWeight: number
  llmWeight: number
}

export interface StylistSelectionResult {
  selectedOutfitRank: number
  source: 'hybrid' | 'solver'
  reason: string
  explanation: OutfitRecommendation['explanation']
  solverWeight: number
  llmWeight: number
  evaluations: StylistOutfitEvaluation[]
}

const SYSTEM = `You are the fashion-judgement layer in a constrained recommendation pipeline.
A deterministic OR-Tools solver has already produced feasible outfits. Evaluate EVERY supplied
outfit independently as a complete look.

Rules:
- You may ONLY evaluate supplied outfitId values.
- You may NOT add, remove, replace, rename or invent products.
- Score colour harmony, style coherence, occasion fit and wardrobe fit from 0 to 1.
- Use the full outfit, reused wardrobe pieces and solver evidence.
- Do not choose a winner: the backend computes the final hybrid ranking.
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
    pairCompatibilities: outfit.pairCompatibilities
      .slice()
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((pair) => ({ score: pair.score, reason: pair.reason })),
    passedRules: outfit.rules
      .filter((rule) => rule.passed)
      .map((rule) => ({ id: rule.ruleId, label: rule.label, reason: rule.reason })),
  }))

  return `Evaluate every solver-valid outfit using the complete context below.
Return JSON with this exact shape:
{
  "evaluations": [{
    "outfitId": string,
    "colorHarmony": number,
    "styleCoherence": number,
    "occasionFit": number,
    "wardrobeFit": number,
    "reason": string,
    "summary": string,
    "perItem": [{ "productId": string, "reason": string }]
  }]
}

Requirements:
- Return exactly one evaluation for every supplied outfitId, with no duplicates.
- Every score must be between 0 and 1.
- "reason" briefly justifies the four scores.
- "summary" is a concise 2-3 sentence recommendation if that outfit wins.
- "perItem" may only reference product IDs from that same outfit.

intentMetadata: ${JSON.stringify(input.intent)}
wardrobeContext: ${JSON.stringify(input.wardrobe)}
solverValidOutfits: ${JSON.stringify(candidates)}`
}

function normalizedWeights(solverWeight: number, llmWeight: number) {
  const total = solverWeight + llmWeight
  if (total <= 0) return { solverWeight: 1, llmWeight: 0 }
  return {
    solverWeight: solverWeight / total,
    llmWeight: llmWeight / total,
  }
}

/**
 * Keep close solver solutions close: positive objectives are normalized against
 * the best objective rather than stretched across the observed min/max range.
 */
function solverScores(outfits: OutfitRecommendation[]): Map<number, number> {
  const values = outfits.map((outfit) => outfit.objectiveScore)
  const max = Math.max(...values)
  const min = Math.min(...values)
  if (max > 0) {
    return new Map(
      outfits.map((outfit) => [
        outfit.rank,
        Number(Math.max(0, Math.min(1, outfit.objectiveScore / max)).toFixed(4)),
      ]),
    )
  }
  if (max === min) return new Map(outfits.map((outfit) => [outfit.rank, 1]))
  return new Map(
    outfits.map((outfit) => [
      outfit.rank,
      Number(((outfit.objectiveScore - min) / (max - min)).toFixed(4)),
    ]),
  )
}

function solverFallback(input: StylistSelectionInput): StylistSelectionResult {
  const first = input.outfits[0]
  const scores = solverScores(input.outfits)
  return {
    selectedOutfitRank: first.rank,
    source: 'solver',
    reason: 'The AI stylist was unavailable or invalid; solver rank one remains the winner.',
    explanation: first.explanation,
    solverWeight: 1,
    llmWeight: 0,
    evaluations: input.outfits.map((outfit) => ({
      outfitRank: outfit.rank,
      solverScore: scores.get(outfit.rank) ?? 0,
      llmScore: null,
      hybridScore: scores.get(outfit.rank) ?? 0,
      colorHarmony: null,
      styleCoherence: null,
      occasionFit: null,
      wardrobeFit: null,
      reason: 'Ranked by the deterministic solver only.',
    })),
  }
}

export async function selectBestOutfit(
  provider: LlmProvider,
  input: StylistSelectionInput,
): Promise<StylistSelectionResult> {
  if (input.outfits.length === 0) {
    throw new Error('Cannot evaluate an empty solver result.')
  }
  if (!provider.available) return solverFallback(input)

  const byId = new Map(input.outfits.map((outfit) => [outfitId(outfit.rank), outfit]))
  const expectedIds = new Set(byId.keys())
  const validatedSchema = StylistSelectionLlmSchema.superRefine((value, ctx) => {
    const seen = new Set<string>()
    value.evaluations.forEach((evaluation, evaluationIndex) => {
      const outfit = byId.get(evaluation.outfitId)
      if (!outfit) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evaluations', evaluationIndex, 'outfitId'],
          message: 'Must reference a supplied solver-valid outfit ID.',
        })
        return
      }
      if (seen.has(evaluation.outfitId)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evaluations', evaluationIndex, 'outfitId'],
          message: 'Each outfit must be evaluated exactly once.',
        })
      }
      seen.add(evaluation.outfitId)

      const validProductIds = new Set(outfit.products.map((product) => product.id))
      evaluation.perItem.forEach((item, itemIndex) => {
        if (!validProductIds.has(item.productId)) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            path: ['evaluations', evaluationIndex, 'perItem', itemIndex, 'productId'],
            message: 'Must reference a product in the evaluated outfit.',
          })
        }
      })
    })
    for (const id of expectedIds) {
      if (!seen.has(id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['evaluations'],
          message: `Missing evaluation for ${id}.`,
        })
      }
    }
  })

  try {
    const result = await generateStructured(provider, validatedSchema, {
      system: SYSTEM,
      prompt: buildPrompt(input),
      modelRole: 'text',
      maxOutputTokens: 4096,
    })
    const weights = normalizedWeights(input.solverWeight, input.llmWeight)
    const normalizedSolver = solverScores(input.outfits)

    const evaluations = result.evaluations
      .map((evaluation): StylistOutfitEvaluation => {
        const outfit = byId.get(evaluation.outfitId)!
        const llmScore =
          (evaluation.colorHarmony +
            evaluation.styleCoherence +
            evaluation.occasionFit +
            evaluation.wardrobeFit) /
          4
        const solverScore = normalizedSolver.get(outfit.rank) ?? 0
        return {
          outfitRank: outfit.rank,
          solverScore: Number(solverScore.toFixed(4)),
          llmScore: Number(llmScore.toFixed(4)),
          hybridScore: Number(
            (solverScore * weights.solverWeight + llmScore * weights.llmWeight).toFixed(4),
          ),
          colorHarmony: evaluation.colorHarmony,
          styleCoherence: evaluation.styleCoherence,
          occasionFit: evaluation.occasionFit,
          wardrobeFit: evaluation.wardrobeFit,
          reason: evaluation.reason,
        }
      })
      .sort(
        (a, b) =>
          b.hybridScore - a.hybridScore ||
          b.solverScore - a.solverScore ||
          a.outfitRank - b.outfitRank,
      )

    const winnerEvaluation = evaluations[0]
    const selected = input.outfits.find((outfit) => outfit.rank === winnerEvaluation.outfitRank)!
    const llmEvaluation = result.evaluations.find(
      (evaluation) => evaluation.outfitId === outfitId(selected.rank),
    )!
    const llmReasons = new Map(
      llmEvaluation.perItem.map((item) => [item.productId, item.reason]),
    )
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
      source: 'hybrid',
      reason:
        `Hybrid score ${Math.round(winnerEvaluation.hybridScore * 100)}/100 ` +
        `(${Math.round(weights.solverWeight * 100)}% solver, ` +
        `${Math.round(weights.llmWeight * 100)}% AI). ${winnerEvaluation.reason}`,
      explanation: { summary: llmEvaluation.summary, perItem, source: 'llm' },
      solverWeight: weights.solverWeight,
      llmWeight: weights.llmWeight,
      evaluations,
    }
  } catch {
    return solverFallback(input)
  }
}
