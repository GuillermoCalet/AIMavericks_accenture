import type {
  DiversityMetrics,
  IntentMetadata,
  ItemContribution,
  ObjectiveBreakdown,
  OutfitRecommendation,
  PairCompatibility,
  Product,
  RecommendationResult,
  RelaxationAttempt,
  ScoreBreakdown,
  WardrobeContext,
  WardrobeItem,
} from '@copilot/shared'
import { CURRENCY } from '../config'
import { resolvePolicy } from '../businessRules'
import { getProductsByIds } from '../catalog/db'
import { analyzeWardrobe } from '../llm/wardrobe'
import { extractIntent } from '../llm/intent'
import { enrichIntentWeather } from '../weather/provider'
import { deterministicExplanation } from '../llm/explain'
import type { LlmProvider } from '../llm/provider'
import { selectBestOutfit } from '../llm/stylist'
import {
  buildAnchors,
  deriveFormalityBounds,
  deriveSkeleton,
  deriveTargetFormality,
  evaluateOutfitRules,
  resolveTargetGender,
  type AnchorCandidate,
  type FormalityBounds,
} from '../rules/engine'
import { FORMALITY_RANK, INCOMPATIBLE_CATEGORIES, SCORE_SCALE } from '../rules/config'
import { computePairCompatibility, type Wearable } from '../rules/pairs'
import { retrieveCandidates, type RankedCandidate } from './candidates'
import {
  callSolver,
  type RawSolverOutfit,
  type RawSolverResponse,
  type SolverCandidateInput,
  type SolverConstraintsInput,
  type SolverObjectiveInput,
  type SolverPairInput,
} from './solverClient'

const ANCHOR_SCORES: ScoreBreakdown = {
  contextFit: 0.7,
  styleFit: 0.7,
  colorCompatibility: 0.8,
  wardrobeCompatibility: 1,
  complementarity: 1,
  versatility: 0.8,
  budgetEfficiency: 1,
}

export interface RecommendArgs {
  provider: LlmProvider
  intentText?: string
  intent?: IntentMetadata | null
  wardrobeText?: string
  wardrobe?: WardrobeContext | null
  maxResults?: number
  optimizationPolicy?: string
  requestedSizes?: string[]
}

const pairKey = (a: string, b: string) => [a, b].sort().join('|')

function anchorToWardrobeItem(a: AnchorCandidate): WardrobeItem {
  if (a.wardrobeItem) return a.wardrobeItem
  return {
    name: a.name,
    category: a.category,
    subcategory: null,
    color: a.colors[0] ?? 'black',
    secondaryColors: a.colors.slice(1),
    formality: a.formality,
    warmth: a.warmth,
    styleTags: [],
  }
}

interface PoolBundle {
  solverCandidates: SolverCandidateInput[]
  pairs: SolverPairInput[]
  pairMeta: Map<string, { factors: Record<string, number>; reason: string }>
  productById: Map<string, Product>
  candidatePoolSize: number
}

export async function recommend(args: RecommendArgs): Promise<RecommendationResult> {
  const cfg = resolvePolicy(args.optimizationPolicy)
  const maxResults = Math.min(Math.max(args.maxResults ?? 3, 1), 5)

  // 1. Intent (+ requested sizes from the request).
  let intent = args.intent ?? (await extractIntent(args.provider, args.intentText ?? ''))
  // 1b. Fill an unknown weatherContext with a live forecast for the occasion's
  // location + date. No-op (returns intent unchanged) if the user stated the
  // weather, gave no location, or the lookup fails.
  intent = await enrichIntentWeather(intent, args.intentText ?? '')
  if (args.requestedSizes?.length) {
    intent = {
      ...intent,
      requestedSizes: Array.from(new Set([...intent.requestedSizes, ...args.requestedSizes])),
    }
  }

  // 2. Wardrobe.
  let wardrobe = args.wardrobe ?? null
  if (!wardrobe && args.wardrobeText && args.wardrobeText.trim()) {
    wardrobe = await analyzeWardrobe(args.provider, { text: args.wardrobeText, images: [] })
  }

  // 2b. Resolve a single concrete gender (preference → wardrobe → anchors →
  // fallback) and pin it on the intent so retrieval filters to {gender, unisex}.
  // This guarantees a recommendation never mixes men's and women's items.
  intent = { ...intent, genderPreference: resolveTargetGender(intent, wardrobe) }

  // 3. Deterministic derivations.
  const anchors = buildAnchors(intent, wardrobe)
  const anchorCats = anchors.map((a) => a.category)
  const skeleton = deriveSkeleton(intent, new Set(anchorCats))
  const baseBounds = deriveFormalityBounds(intent)
  const budgetMax = intent.maxBudget
  const targetRank = FORMALITY_RANK[deriveTargetFormality(intent)]

  const objInput: SolverObjectiveInput = { weights: cfg.weights, objective: cfg.objective }

  // --- helper: build candidate pool + pairs for given filters ----------
  const buildPool = async (bounds: FormalityBounds, dropGender: boolean): Promise<PoolBundle> => {
    const usedIntent = dropGender ? { ...intent, genderPreference: null } : intent
    const ctx = { intent: usedIntent, wardrobe, anchors, budgetMax }
    const pool = await retrieveCandidates([...skeleton.required, ...skeleton.optional], ctx, bounds, {
      weights: cfg.weights,
      maxPerCategory: cfg.retrieval.maxCandidatesPerCategory,
      broadLimit: cfg.retrieval.broadLimit,
      inventory: cfg.inventory,
      requestedSizes: intent.requestedSizes,
    })

    const productById = new Map<string, Product>()
    const wearables: Wearable[] = []
    const solverCandidates: SolverCandidateInput[] = []
    const ranked: RankedCandidate[] = []
    for (const list of pool.byCategory.values()) {
      for (const rc of list) {
        ranked.push(rc)
        productById.set(rc.product.id, rc.product)
        const isOptional = skeleton.optional.includes(rc.category)
        const basePenalty = isOptional
          ? cfg.optionalItemPenalty.perCategory[rc.category] ?? cfg.optionalItemPenalty.default
          : 0
        solverCandidates.push({
          id: rc.product.id,
          category: rc.category,
          price: rc.product.price,
          isAnchor: false,
          isOptional,
          optionalPenalty: isOptional ? basePenalty + rc.unknownPenalty : 0,
          scores: rc.signals,
        })
        wearables.push({
          id: rc.product.id,
          category: rc.category,
          colors: rc.product.colors,
          formality: rc.product.formality,
          warmth: rc.product.warmth,
          styleTags: rc.product.styleTags,
        })
      }
    }
    for (const a of anchors) {
      solverCandidates.push({
        id: a.id,
        category: a.category,
        price: 0,
        isAnchor: true,
        isOptional: false,
        optionalPenalty: 0,
        scores: ANCHOR_SCORES,
      })
      wearables.push({
        id: a.id,
        category: a.category,
        colors: a.colors,
        formality: a.formality,
        warmth: a.warmth,
        styleTags: [],
        isAnchor: true,
      })
    }

    // pairwise compatibility — only coexistable, above-threshold pairs (bounded).
    const incompatible = new Set(INCOMPATIBLE_CATEGORIES.map(([x, y]) => [x, y].sort().join('|')))
    const anchorColors = anchors.flatMap((a) => a.colors)
    const scored: { a: string; b: string; score: number; factors: Record<string, number>; reason: string }[] = []
    for (let i = 0; i < wearables.length; i++) {
      for (let j = i + 1; j < wearables.length; j++) {
        const wa = wearables[i]
        const wb = wearables[j]
        if (wa.category === wb.category) continue
        if (incompatible.has([wa.category, wb.category].sort().join('|'))) continue
        const pc = computePairCompatibility(wa, wb, { targetFormalityRank: targetRank, anchorColors })
        if (pc.score >= cfg.pairs.compatibilityThreshold) {
          scored.push({ a: wa.id, b: wb.id, score: pc.score, factors: pc.factors, reason: pc.reason })
        }
      }
    }
    scored.sort((p, q) => q.score - p.score)
    const capped = scored.slice(0, cfg.pairs.maxPairs)
    const pairs: SolverPairInput[] = capped.map((p) => ({ a: p.a, b: p.b, score: p.score }))
    const pairMeta = new Map<string, { factors: Record<string, number>; reason: string }>()
    for (const p of capped) pairMeta.set(pairKey(p.a, p.b), { factors: p.factors, reason: p.reason })

    return { solverCandidates, pairs, pairMeta, productById, candidatePoolSize: solverCandidates.length }
  }

  // --- constraint builder ----------------------------------------------
  const excludePairsFor = (cands: SolverCandidateInput[]): [string, string][] => {
    const out: [string, string][] = []
    for (const [c1, c2] of INCOMPATIBLE_CATEGORIES) {
      const a = cands.filter((s) => s.category === c1)
      const b = cands.filter((s) => s.category === c2)
      for (const x of a) for (const y of b) out.push([x.id, y.id])
    }
    return out
  }
  const requiredMinOptional = skeleton.optional.length > 0 ? 1 : 0
  const baseMinItems = anchors.length + skeleton.required.length + requiredMinOptional
  const relaxableReq = new Set(cfg.relaxation.relaxableRequiredCategories)

  const makeConstraints = (
    cands: SolverCandidateInput[],
    opts: {
      dropRequiredMins?: boolean
      minItemsOverride?: number | null
      overBudgetAllowed?: boolean
    },
  ): SolverConstraintsInput => {
    const limits = new Map<string, { min: number; max: number }>()
    const set = (cat: string, min: number) => {
      const max = cfg.categoryMax[cat] ?? 1
      const cur = limits.get(cat)
      limits.set(cat, { min: Math.max(cur?.min ?? 0, min), max })
    }
    for (const c of skeleton.required) set(c, opts.dropRequiredMins && relaxableReq.has(c) ? 0 : 1)
    for (const c of skeleton.optional) set(c, 0)
    for (const c of anchorCats) set(c, 0)
    return {
      budgetMax,
      categoryLimits: Array.from(limits.entries()).map(([category, v]) => ({ category, ...v })),
      completenessCategories: skeleton.required,
      anchorIds: anchors.map((a) => a.id),
      excludePairs: excludePairsFor(cands),
      minItems: baseMinItems,
      maxItems: cfg.items.max + anchors.length,
      maxResults,
      maxSharedProducts: cfg.diversity.maxSharedProducts,
      minQualityRatioPct: Math.round(cfg.diversity.minQualityRatio * 100),
      dropRequiredCategories: false,
      minItemsOverride: opts.minItemsOverride ?? null,
      overBudgetAllowed: opts.overBudgetAllowed ?? false,
    }
  }

  // --- progressive relaxation ladder -----------------------------------
  const attempts: RelaxationAttempt[] = []
  let chosen: { response: RawSolverResponse; pool: PoolBundle; level: number; label: string; relaxedRules: string[] } | null = null

  const strict = await buildPool(baseBounds, false)

  for (const step of cfg.relaxation.ladder) {
    if (chosen) break
    let pool = strict
    let constraints: SolverConstraintsInput
    const original: Record<string, unknown> = {}
    const relaxed: Record<string, unknown> = {}
    let reason = ''

    if (step.level === 0) {
      constraints = makeConstraints(strict.solverCandidates, {})
    } else if (step.level === 1) {
      const override = anchors.length + skeleton.required.length
      original.minItems = baseMinItems
      relaxed.minItems = override
      reason = 'Drop the requirement to add an optional complement.'
      constraints = makeConstraints(strict.solverCandidates, { minItemsOverride: override })
    } else if (step.level === 2) {
      const relaxedCats = skeleton.required.filter((c) => relaxableReq.has(c))
      original.requiredCategories = skeleton.required
      relaxed.relaxedCategories = relaxedCats
      reason = 'Allow configured required categories to be absent.'
      constraints = makeConstraints(strict.solverCandidates, {
        dropRequiredMins: true,
        minItemsOverride: Math.max(1, anchors.length + skeleton.required.length - relaxedCats.length),
      })
    } else if (step.level === 3) {
      const widened: FormalityBounds = {
        minRank: baseBounds.minRank === null ? null : Math.max(0, baseBounds.minRank - 1),
        maxRank: baseBounds.maxRank === null ? null : Math.min(3, baseBounds.maxRank + 1),
      }
      original.formalityBounds = baseBounds
      relaxed.formalityBounds = widened
      reason = 'Widen the acceptable formality range by one level.'
      pool = await buildPool(widened, false)
      constraints = makeConstraints(pool.solverCandidates, {
        dropRequiredMins: true,
        minItemsOverride: anchors.length + 1,
      })
    } else if (step.level === 4) {
      original.filters = { formalityBounds: baseBounds }
      relaxed.filters = { formalityBounds: null }
      // Gender is NEVER relaxed — an outfit must never mix men's and women's items.
      reason = 'Drop formality bounds and preferred-colour weighting (gender kept).'
      pool = await buildPool({ minRank: null, maxRank: null }, false)
      constraints = makeConstraints(pool.solverCandidates, {
        dropRequiredMins: true,
        minItemsOverride: anchors.length + 1,
      })
    } else {
      // level 5 — suggest budget increase; only over-budget if a business rule allows.
      original.budgetMax = budgetMax
      reason = cfg.relaxation.allowOverBudget
        ? 'Authorized to exceed budget; results flagged over-budget.'
        : 'Suggest increasing the budget (not applied automatically).'
      if (!cfg.relaxation.allowOverBudget) {
        attempts.push({
          level: step.level,
          label: step.label,
          relaxedRules: step.relaxes,
          reason,
          originalValues: original,
          relaxedValues: { budgetMax: 'suggest_increase' },
          solverStatus: 'INFEASIBLE',
          solvingTimeMs: 0,
          feasible: false,
        })
        break
      }
      relaxed.budgetMax = 'unbounded'
      pool = strict
      constraints = makeConstraints(strict.solverCandidates, {
        dropRequiredMins: true,
        minItemsOverride: anchors.length + 1,
        overBudgetAllowed: true,
      })
    }

    if (pool.solverCandidates.length === 0) {
      attempts.push({
        level: step.level, label: step.label, relaxedRules: step.relaxes, reason: 'Empty candidate pool',
        originalValues: original, relaxedValues: relaxed, solverStatus: 'INFEASIBLE', solvingTimeMs: 0, feasible: false,
      })
      continue
    }

    const response = await callSolver(pool.solverCandidates, pool.pairs, objInput, constraints)
    const feasible = response.outfits.length > 0
    attempts.push({
      level: step.level,
      label: step.label,
      relaxedRules: step.relaxes,
      reason,
      originalValues: original,
      relaxedValues: relaxed,
      solverStatus: response.status,
      solvingTimeMs: response.solving_time_ms,
      feasible,
    })
    if (feasible) chosen = { response, pool, level: step.level, label: step.label, relaxedRules: step.relaxes }
  }

  // --- no feasible outfit ----------------------------------------------
  if (!chosen) {
    const last = attempts[attempts.length - 1]
    const conflicts = ['budget_max', 'required_categories']
    return {
      intent,
      wardrobe,
      policy: cfg.policy,
      solver: {
        status: 'INFEASIBLE',
        evaluatedCandidates: strict.solverCandidates.length,
        candidatePoolSize: strict.candidatePoolSize,
        solvingTimeMs: last?.solvingTimeMs ?? 0,
        appliedConstraints: [],
        rejectedConstraints: [],
        relaxationLevel: last?.level ?? 0,
        relaxed: true,
        relaxedRules: last?.relaxedRules ?? [],
        relaxationAttempts: attempts,
        metrics: {
          candidateCount: strict.candidatePoolSize,
          pairVariableCount: strict.pairs.length,
          constraintCount: 0,
          solveTimeMs: last?.solvingTimeMs ?? 0,
          solverStatus: 'INFEASIBLE',
        },
      },
      stylistSelection: null,
      outfits: [],
      infeasibility: {
        message: 'No outfit satisfies your constraints, even after progressive relaxation.',
        conflictingConstraints: conflicts,
        suggestions: [
          'Increase your budget.',
          'Relax required categories or colours.',
          'Remove some hard exclusions.',
        ],
      },
    }
  }

  // --- assemble outfits from the chosen attempt ------------------------
  const { response, pool, level } = chosen
  const assembledOutfits = await assembleOutfits(response.outfits, {
    pool,
    anchors,
    intent,
    wardrobe,
    skeleton,
    bounds: baseBounds,
    budgetMax,
  })
  // The LLM stylist only judges the top solver outfits — the dominant cost on
  // local CPU models is the prompt/response size, which scales with the number
  // of outfits evaluated. The remaining alternates are still returned, ordered
  // by the deterministic solver, keeping their deterministic explanations.
  const evaluatedCount = Math.min(cfg.stylist.maxEvaluatedOutfits, assembledOutfits.length)
  const evaluatedOutfits = assembledOutfits.slice(0, evaluatedCount)
  const remainingOutfits = assembledOutfits.slice(evaluatedCount)

  const stylistSelection = await selectBestOutfit(args.provider, {
    intent,
    wardrobe,
    outfits: evaluatedOutfits,
    solverWeight: cfg.stylist.solverWeight,
    llmWeight: cfg.stylist.llmWeight,
  })
  const evaluationByRank = new Map(
    stylistSelection.evaluations.map((evaluation) => [evaluation.outfitRank, evaluation]),
  )
  const rankedEvaluated = evaluatedOutfits
    .map((outfit) =>
      outfit.rank === stylistSelection.selectedOutfitRank
        ? { ...outfit, explanation: stylistSelection.explanation }
        : outfit,
    )
    .sort((a, b) => {
      const evalA = evaluationByRank.get(a.rank)
      const evalB = evaluationByRank.get(b.rank)
      return (
        (evalB?.hybridScore ?? 0) - (evalA?.hybridScore ?? 0) ||
        a.rank - b.rank
      )
    })
  const outfits = [...rankedEvaluated, ...remainingOutfits].map((outfit, index) => ({
    ...outfit,
    hybridRank: index + 1,
  }))

  return {
    intent,
    wardrobe,
    policy: cfg.policy,
    solver: {
      status: response.status,
      evaluatedCandidates: response.evaluated_candidates,
      candidatePoolSize: pool.candidatePoolSize,
      solvingTimeMs: response.solving_time_ms,
      appliedConstraints: response.applied_constraints,
      rejectedConstraints: response.rejected_constraints,
      relaxationLevel: level,
      relaxed: level > 0,
      relaxedRules: chosen.relaxedRules,
      relaxationAttempts: attempts,
      metrics: {
        candidateCount: response.metrics.candidate_count,
        pairVariableCount: response.metrics.pair_variable_count,
        constraintCount: response.metrics.constraint_count,
        solveTimeMs: response.metrics.solve_time_ms,
        solverStatus: response.metrics.solver_status,
      },
    },
    stylistSelection: {
      selectedOutfitRank: stylistSelection.selectedOutfitRank,
      source: stylistSelection.source,
      reason: stylistSelection.reason,
      solverWeight: stylistSelection.solverWeight,
      llmWeight: stylistSelection.llmWeight,
      evaluations: stylistSelection.evaluations,
    },
    outfits,
    infeasibility: null,
  }
}

// ---------------------------------------------------------------------------

interface AssembleCtx {
  pool: PoolBundle
  anchors: AnchorCandidate[]
  intent: IntentMetadata
  wardrobe: WardrobeContext | null
  skeleton: { required: string[]; optional: string[] }
  bounds: FormalityBounds
  budgetMax: number | null
}

async function assembleOutfits(
  rawOutfits: RawSolverOutfit[],
  ctx: AssembleCtx,
): Promise<OutfitRecommendation[]> {
  const { pool, anchors, intent, wardrobe, skeleton, bounds, budgetMax } = ctx
  const anchorById = new Map(anchors.map((a) => [a.id, a]))
  const out: OutfitRecommendation[] = []

  for (let i = 0; i < rawOutfits.length; i++) {
    const o = rawOutfits[i]
    const purchasedIds = o.product_ids.filter((id) => !id.startsWith('wardrobe-anchor-'))
    const reusedIds = o.product_ids.filter((id) => id.startsWith('wardrobe-anchor-'))

    const missing = purchasedIds.filter((id) => !pool.productById.has(id))
    if (missing.length) for (const p of await getProductsByIds(missing)) pool.productById.set(p.id, p)
    const products = purchasedIds
      .map((id) => pool.productById.get(id))
      .filter((p): p is Product => Boolean(p))

    const usedAnchors = reusedIds.map((id) => anchorById.get(id)).filter((a): a is AnchorCandidate => Boolean(a))
    const reusedWardrobeItems = usedAnchors.map(anchorToWardrobeItem)

    const perItemScores = new Map<string, ScoreBreakdown>()
    for (const p of products) perItemScores.set(p.id, ANCHOR_SCORES)

    const rules = evaluateOutfitRules({
      products,
      anchors: usedAnchors,
      intent,
      wardrobe,
      skeleton,
      bounds,
      budgetMax,
      perItemScores,
    })

    const totalPrice = products.reduce((s, p) => s + p.price, 0)
    const itemCount = products.length + usedAnchors.length
    const breakdown = normalizedBreakdown(o.score_breakdown, itemCount)

    const itemContributions: ItemContribution[] = o.item_contributions.map((c) => ({
      productId: c.product_id,
      grossScore: c.gross_score,
      penalty: c.penalty,
      net: c.net,
      optional: c.optional,
      reused: c.reused,
      redundant: c.redundant,
    }))

    const pairCompatibilities: PairCompatibility[] = o.active_pairs.map((p) => {
      const meta = pool.pairMeta.get(pairKey(p.a, p.b))
      return {
        a: p.a,
        b: p.b,
        score: Number((p.score / SCORE_SCALE).toFixed(3)),
        factors: meta?.factors ?? {},
        reason: meta?.reason ?? 'compatible',
      }
    })

    const diversity: DiversityMetrics | null =
      i === 0
        ? null
        : {
            sharedProductCount: o.diversity.shared_product_count,
            jaccardSimilarity: Number((o.diversity.jaccard_similarity_pct / 100).toFixed(3)),
            diversityScore: Number((1 - o.diversity.jaccard_similarity_pct / 100).toFixed(3)),
            diversityPenalty: o.diversity.diversity_penalty,
            reason:
              o.diversity.shared_product_count === 0
                ? 'Shares no products with previous outfits.'
                : `Shares ${o.diversity.shared_product_count} product(s); ${100 - o.diversity.jaccard_similarity_pct}% different.`,
          }

    const objectiveBreakdown: ObjectiveBreakdown = {
      qualityScore: o.objective_breakdown.quality_score,
      pairCompatibilityScore: o.objective_breakdown.pair_compatibility_score,
      completenessBonus: o.objective_breakdown.completeness_bonus,
      pricePenalty: o.objective_breakdown.price_penalty,
      optionalItemPenalty: o.objective_breakdown.optional_item_penalty,
      complexityPenalty: o.objective_breakdown.complexity_penalty,
      diversityPenalty: o.objective_breakdown.diversity_penalty,
      finalObjectiveScore: o.objective_breakdown.final_objective_score,
    }

    const explainInput = {
      products,
      anchors: usedAnchors,
      occasion: intent.occasion,
      desiredStyle: intent.desiredStyle,
      totalPrice,
      currency: CURRENCY,
      budgetMax,
      passedRules: rules,
      scoreBreakdown: breakdown,
    }
    const explanation = deterministicExplanation(explainInput)

    out.push({
      rank: i + 1,
      hybridRank: i + 1,
      products,
      reusedWardrobeItems,
      totalPrice: Number(totalPrice.toFixed(2)),
      currency: CURRENCY,
      overBudget: o.over_budget,
      objectiveScore: o.objective_score,
      scoreBreakdown: breakdown,
      objectiveBreakdown,
      itemContributions,
      pairCompatibilities,
      diversity,
      rules,
      explanation,
    })
  }
  return out
}

function normalizedBreakdown(raw: Record<keyof ScoreBreakdown, number>, itemCount: number): ScoreBreakdown {
  const n = Math.max(1, itemCount)
  const norm = (v: number) => Number((v / (SCORE_SCALE * n)).toFixed(3))
  return {
    contextFit: norm(raw.contextFit),
    styleFit: norm(raw.styleFit),
    colorCompatibility: norm(raw.colorCompatibility),
    wardrobeCompatibility: norm(raw.wardrobeCompatibility),
    complementarity: norm(raw.complementarity),
    versatility: norm(raw.versatility),
    budgetEfficiency: norm(raw.budgetEfficiency),
  }
}
