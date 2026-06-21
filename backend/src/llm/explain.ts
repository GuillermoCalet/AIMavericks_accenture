import type { Product, RuleResult, ScoreBreakdown } from '@copilot/shared'
import type { AnchorCandidate } from '../rules/engine'
import type { LlmProvider } from './provider'
import { generateStructured } from './structured'
import { ExplanationLlmSchema } from './schemas'

export interface ExplainInput {
  products: Product[]
  anchors: AnchorCandidate[]
  occasion: string
  desiredStyle: string
  totalPrice: number
  currency: string
  budgetMax: number | null
  passedRules: RuleResult[]
  scoreBreakdown: ScoreBreakdown
}

export interface OutfitExplanation {
  summary: string
  perItem: { productId: string; reason: string }[]
  source: 'llm' | 'deterministic'
}

const SYSTEM = `You are a fashion stylist writing the rationale for an outfit that has
ALREADY been chosen by a deterministic optimizer. You must:
- NOT change, add or remove products.
- NOT invent prices, discounts, metrics or weather.
- Base every statement ONLY on the products, the satisfied rules and the scores given.
Return strictly valid JSON.`

function buildPrompt(input: ExplainInput): string {
  const items = input.products.map((p) => ({
    id: p.id,
    title: p.title,
    category: p.category,
    colors: p.colors,
    formality: p.formality,
    price: p.price,
  }))
  const reused = input.anchors.map((a) => ({ name: a.name, category: a.category, colors: a.colors }))
  const rules = input.passedRules.filter((r) => r.passed).map((r) => r.label)

  return `The optimizer selected this outfit. Write the explanation.
Return JSON: { "summary": string, "perItem": [{ "productId": string, "reason": string }] }

occasion: ${JSON.stringify(input.occasion)}
desiredStyle: ${JSON.stringify(input.desiredStyle)}
totalPrice: ${input.totalPrice} ${input.currency}
budgetMax: ${input.budgetMax ?? 'none'}
reusedWardrobeItems: ${JSON.stringify(reused)}
selectedProducts: ${JSON.stringify(items)}
satisfiedRules: ${JSON.stringify(rules)}
scoreBreakdown(0..1): ${JSON.stringify(input.scoreBreakdown)}

Write a concise summary (2-3 sentences) and one short reason per selected product id.
Do not mention any product not in selectedProducts.`
}

/**
 * Deterministic explanation built ONLY from real product data + satisfied rules.
 * This is an allowed fallback because it never fabricates data.
 */
export function deterministicExplanation(input: ExplainInput): OutfitExplanation {
  const reused = input.anchors.map((a) => a.name)
  const within =
    input.budgetMax !== null
      ? `within the ${input.currency}${input.budgetMax} budget (total ${input.currency}${input.totalPrice.toFixed(2)})`
      : `for a total of ${input.currency}${input.totalPrice.toFixed(2)}`
  const reuseClause = reused.length ? `, built around your ${reused.join(' and ')}` : ''
  const summary =
    `This ${input.desiredStyle} look for a ${input.occasion}${reuseClause} keeps every piece ` +
    `coordinated and stays ${within}. It satisfied ` +
    `${input.passedRules.filter((r) => r.passed && r.type === 'hard').length} hard constraints ` +
    `from the rules engine.`

  const perItem = input.products.map((p) => {
    const colors = p.colors.length ? p.colors.join('/') : 'neutral'
    return {
      productId: p.id,
      reason:
        `${p.category} in ${colors} (${p.formality}) — coordinates with the rest of the outfit ` +
        `and fits the ${input.occasion} occasion at ${input.currency}${p.price.toFixed(2)}.`,
    }
  })

  return { summary, perItem, source: 'deterministic' }
}

/**
 * Generate the outfit explanation. Tries the configured LLM (grounded strictly in the chosen
 * outfit), validates with Zod, and falls back to the deterministic explanation
 * on any failure — never to fabricated data.
 */
export async function explainOutfit(
  provider: LlmProvider,
  input: ExplainInput,
): Promise<OutfitExplanation> {
  if (!provider.available) return deterministicExplanation(input)
  try {
    const llm = await generateStructured(provider, ExplanationLlmSchema, {
      system: SYSTEM,
      prompt: buildPrompt(input),
    })
    const validIds = new Set(input.products.map((p) => p.id))
    // Guard: drop any per-item entry that references a product not in the outfit.
    const perItem = llm.perItem.filter((e) => validIds.has(e.productId))
    return { summary: llm.summary, perItem, source: 'llm' }
  } catch {
    return deterministicExplanation(input)
  }
}
