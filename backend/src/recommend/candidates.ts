import type { Product, ScoreBreakdown } from '@copilot/shared'
import { queryCategoryCandidates } from '../catalog/db'
import type { ScoreWeights } from '../businessRules'
import {
  passesHardItemRules,
  scoreProduct,
  type FormalityBounds,
  type ScoringContext,
} from '../rules/engine'
import { deriveTargetFormality } from '../rules/engine'
import { evaluateInventory, type InventoryConfig } from '../rules/inventory'

export interface RankedCandidate {
  product: Product
  category: string
  preliminaryScore: number
  signals: ScoreBreakdown
  /** Soft penalty (scaled) from unknown stock/size under a "penalize" policy. */
  unknownPenalty: number
}

export interface CandidatePool {
  byCategory: Map<string, RankedCandidate[]>
  retrieved: number
  kept: number
  rejected: { id: string; title: string; ruleId: string; reason: string }[]
}

export interface RetrievalOptions {
  weights: ScoreWeights
  maxPerCategory: number
  broadLimit: number
  inventory: InventoryConfig
  requestedSizes: string[]
}

export function weightedScore(s: ScoreBreakdown, w: ScoreWeights): number {
  return (
    s.contextFit * w.contextFit +
    s.styleFit * w.styleFit +
    s.colorCompatibility * w.colorCompatibility +
    s.wardrobeCompatibility * w.wardrobeCompatibility +
    s.complementarity * w.complementarity +
    s.versatility * w.versatility +
    s.budgetEfficiency * w.budgetEfficiency
  )
}

/**
 * Two-stage retrieval:
 *   1. DuckDB applies hard SQL filters (available, price ≤ budget, gender, category).
 *   2. The backend applies remaining hard rules (style/colour/formality + stock/size
 *      inventory rules), scores survivors, and keeps the top N per category.
 * Every rejection is recorded for auditability.
 */
export async function retrieveCandidates(
  categories: string[],
  ctx: ScoringContext,
  bounds: FormalityBounds,
  opts: RetrievalOptions,
): Promise<CandidatePool> {
  const byCategory = new Map<string, RankedCandidate[]>()
  const rejected: CandidatePool['rejected'] = []
  let retrieved = 0
  let kept = 0

  const uniqueCategories = Array.from(new Set(categories))
  const targetFormality = deriveTargetFormality(ctx.intent)

  for (const category of uniqueCategories) {
    const broad = await queryCategoryCandidates({
      category,
      maxPrice: ctx.budgetMax,
      gender: ctx.intent.genderPreference,
      targetFormality,
      preferredColors: ctx.intent.preferredColors,
      limit: opts.broadLimit,
    })
    retrieved += broad.length

    const ranked: RankedCandidate[] = []
    for (const product of broad) {
      const reject = passesHardItemRules(product, ctx.intent, bounds)
      if (reject) {
        if (rejected.length < 200) {
          rejected.push({ id: product.id, title: product.title, ruleId: reject.ruleId, reason: reject.reason })
        }
        continue
      }
      const inv = evaluateInventory(product, opts.requestedSizes, opts.inventory)
      if (inv.rejected) {
        if (rejected.length < 200) {
          rejected.push({ id: product.id, title: product.title, ruleId: inv.rejected.ruleId, reason: inv.rejected.reason })
        }
        continue
      }
      const signals = scoreProduct(product, ctx)
      const preliminaryScore = weightedScore(signals, opts.weights) - inv.unknownPenalty
      ranked.push({ product, category, preliminaryScore, signals, unknownPenalty: inv.unknownPenalty })
    }
    ranked.sort((a, b) => b.preliminaryScore - a.preliminaryScore)
    const top = ranked.slice(0, opts.maxPerCategory)
    kept += top.length
    byCategory.set(category, top)
  }

  return { byCategory, retrieved, kept, rejected }
}
