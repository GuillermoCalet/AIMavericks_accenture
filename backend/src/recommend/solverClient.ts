import type { ScoreBreakdown } from '@copilot/shared'
import { config } from '../config'
import type { ObjectiveConfig, ScoreWeights } from '../businessRules'
import { SCORE_SCALE } from '../rules/config'

// ---------------------------------------------------------------------------
// Client for the Python OR-Tools CP-SAT service.
//
// CP-SAT is integer-only, so soft scores and pair scores are scaled by
// SCORE_SCALE (1000) and prices converted to integer cents before sending.
// The same scale is used to convert the returned breakdown back.
// ---------------------------------------------------------------------------

export interface SolverCandidateInput {
  id: string
  category: string
  price: number
  isAnchor: boolean
  isOptional: boolean
  /** Already-scaled penalty (config units) for choosing this optional item. */
  optionalPenalty: number
  scores: ScoreBreakdown
}

export interface SolverPairInput {
  a: string
  b: string
  /** 0..1 compatibility; scaled here. */
  score: number
}

export interface SolverObjectiveInput {
  weights: ScoreWeights
  objective: ObjectiveConfig
}

export interface SolverConstraintsInput {
  budgetMax: number | null
  categoryLimits: { category: string; min: number; max: number }[]
  completenessCategories: string[]
  anchorIds: string[]
  excludePairs: [string, string][]
  minItems: number
  maxItems: number
  maxResults: number
  maxSharedProducts: number
  minQualityRatioPct: number
  // relaxation flags (set by the backend ladder)
  dropRequiredCategories: boolean
  minItemsOverride: number | null
  overBudgetAllowed: boolean
}

export interface RawItemContribution {
  product_id: string
  gross_score: number
  penalty: number
  net: number
  optional: boolean
  reused: boolean
  redundant: boolean
}

export interface RawObjectiveBreakdown {
  quality_score: number
  pair_compatibility_score: number
  completeness_bonus: number
  price_penalty: number
  optional_item_penalty: number
  complexity_penalty: number
  diversity_penalty: number
  final_objective_score: number
}

export interface RawSolverOutfit {
  product_ids: string[]
  objective_score: number
  score_breakdown: Record<keyof ScoreBreakdown, number>
  total_price: number
  over_budget: boolean
  item_contributions: RawItemContribution[]
  active_pairs: { a: string; b: string; score: number }[]
  objective_breakdown: RawObjectiveBreakdown
  diversity: { shared_product_count: number; jaccard_similarity_pct: number; diversity_penalty: number }
}

export interface RawSolverMetrics {
  candidate_count: number
  pair_variable_count: number
  constraint_count: number
  solve_time_ms: number
  solver_status: 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'MODEL_INVALID' | 'UNKNOWN'
}

export interface RawSolverResponse {
  status: RawSolverMetrics['solver_status']
  evaluated_candidates: number
  solving_time_ms: number
  applied_constraints: string[]
  rejected_constraints: string[]
  relaxed_preferences: string[]
  conflicting_constraints: string[]
  metrics: RawSolverMetrics
  outfits: RawSolverOutfit[]
}

function scaleScores(s: ScoreBreakdown) {
  return {
    contextFit: Math.round(s.contextFit * SCORE_SCALE),
    styleFit: Math.round(s.styleFit * SCORE_SCALE),
    colorCompatibility: Math.round(s.colorCompatibility * SCORE_SCALE),
    wardrobeCompatibility: Math.round(s.wardrobeCompatibility * SCORE_SCALE),
    complementarity: Math.round(s.complementarity * SCORE_SCALE),
    versatility: Math.round(s.versatility * SCORE_SCALE),
    budgetEfficiency: Math.round(s.budgetEfficiency * SCORE_SCALE),
  }
}

export class SolverError extends Error {
  code = 'SOLVER_ERROR'
}

export function buildSolverPayload(
  candidates: SolverCandidateInput[],
  pairs: SolverPairInput[],
  obj: SolverObjectiveInput,
  c: SolverConstraintsInput,
) {
  return {
    candidates: candidates.map((cand) => ({
      id: cand.id,
      category: cand.category,
      price: Math.round(cand.price * 100),
      is_anchor: cand.isAnchor,
      is_optional: cand.isOptional,
      optional_penalty: Math.round(cand.optionalPenalty),
      scores: scaleScores(cand.scores),
    })),
    pairs: pairs.map((p) => ({ a: p.a, b: p.b, score: Math.round(p.score * SCORE_SCALE) })),
    budget_max: c.budgetMax === null ? null : Math.round(c.budgetMax * 100),
    category_limits: c.categoryLimits.map((l) => ({ category: l.category, min: l.min, max: l.max })),
    completeness_categories: c.completenessCategories,
    anchor_ids: c.anchorIds,
    exclude_pairs: c.excludePairs,
    min_items: c.minItems,
    max_items: c.maxItems,
    objective: {
      weights: { ...obj.weights },
      pair_weight: obj.objective.pairCompatibilityWeight,
      completeness_bonus_per_required: obj.objective.completenessBonusPerRequired,
      complexity_penalty_per_item: obj.objective.complexityPenaltyPerItem,
      price_penalty_weight: obj.objective.pricePenaltyWeight,
      diversity_penalty_weight: obj.objective.diversityPenaltyWeight,
      score_scale: SCORE_SCALE,
    },
    diversity: { max_shared_products: c.maxSharedProducts, min_quality_ratio_pct: c.minQualityRatioPct },
    max_results: c.maxResults,
    time_limit_s: config.solver.timeLimitS,
    seed: config.solver.seed,
    drop_required_categories: c.dropRequiredCategories,
    min_items_override: c.minItemsOverride,
    over_budget_allowed: c.overBudgetAllowed,
  }
}

export async function callSolver(
  candidates: SolverCandidateInput[],
  pairs: SolverPairInput[],
  obj: SolverObjectiveInput,
  constraints: SolverConstraintsInput,
): Promise<RawSolverResponse> {
  const payload = buildSolverPayload(candidates, pairs, obj, constraints)
  let res: Response
  try {
    res = await fetch(`${config.solver.url}/solve`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(Math.round((config.solver.timeLimitS + 15) * 1000)),
    })
  } catch (err) {
    throw new SolverError(
      `Could not reach the solver service at ${config.solver.url}. Is it running? (${String(err)})`,
    )
  }
  if (!res.ok) {
    throw new SolverError(`Solver responded with HTTP ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as RawSolverResponse
}
