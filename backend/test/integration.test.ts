import fs from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { IntentMetadata, WardrobeContext } from '@copilot/shared'
import { config } from '../src/config'
import { resolvePolicy } from '../src/businessRules'
import { query } from '../src/catalog/db'
import { retrieveCandidates } from '../src/recommend/candidates'
import { recommend } from '../src/recommend/orchestrator'
import type { GenerateArgs, LlmProvider } from '../src/llm/provider'
import type { RawSolverOutfit, RawSolverResponse } from '../src/recommend/solverClient'

// Integration test: real DuckDB catalog + real rules engine, with the Python
// solver call mocked (the solver itself is covered by pytest). Skipped when the
// catalog has not been imported yet.
const dbReady = fs.existsSync(config.catalog.dbPath)
const d = dbReady ? describe : describe.skip

const offlineProvider: LlmProvider = {
  name: 'fake',
  available: false,
  async generateJson(_args: GenerateArgs) {
    return '{}'
  },
}

const intent: IntentMetadata = {
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
  preferredColors: ['black', 'beige'],
  requiredCategories: [],
  optionalCategories: [],
  recommendationGoal: 'complete outfit',
  sizeConstraints: null,
  requestedSizes: [],
  genderPreference: 'women',
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

function outfit(ids: string[]): RawSolverOutfit {
  return {
    product_ids: ids,
    objective_score: 50000,
    score_breakdown: {
      contextFit: 2400, styleFit: 1500, colorCompatibility: 2700, wardrobeCompatibility: 2600,
      complementarity: 2900, versatility: 1800, budgetEfficiency: 1500,
    },
    total_price: 0,
    over_budget: false,
    item_contributions: ids
      .filter((i) => !i.startsWith('wardrobe-anchor-'))
      .map((id) => ({ product_id: id, gross_score: 6000, penalty: 800, net: 5200, optional: false, reused: false, redundant: false })),
    active_pairs: ids.length >= 2 ? [{ a: ids[0], b: ids[1], score: 850 }] : [],
    objective_breakdown: {
      quality_score: 48000, pair_compatibility_score: 2550, completeness_bonus: 4000,
      price_penalty: 1200, optional_item_penalty: 0, complexity_penalty: 2100,
      diversity_penalty: 0, final_objective_score: 50000,
    },
    diversity: { shared_product_count: 0, jaccard_similarity_pct: 0, diversity_penalty: 0 },
  }
}

function resp(status: RawSolverResponse['status'], outfits: RawSolverOutfit[], conflicts: string[] = []): RawSolverResponse {
  return {
    status,
    evaluated_candidates: 42,
    solving_time_ms: 7,
    applied_constraints: ['budget_max', 'item_count', 'pair_compatibility'],
    rejected_constraints: [],
    relaxed_preferences: [],
    conflicting_constraints: conflicts,
    metrics: { candidate_count: 42, pair_variable_count: 30, constraint_count: 120, solve_time_ms: 7, solver_status: status },
    outfits,
  }
}

function mockSolver(response: RawSolverResponse) {
  vi.stubGlobal('fetch', async () => ({
    ok: true,
    status: 200,
    json: async () => response,
    text: async () => JSON.stringify(response),
  }))
}

afterEach(() => vi.unstubAllGlobals())

d('catalog → rules → solver integration', () => {
  it('assembles a recommendation from REAL catalog products', async () => {
    const topId = String((await query("SELECT id FROM products WHERE category='top' AND price <= 100 LIMIT 1"))[0].id)
    const shoeId = String((await query("SELECT id FROM products WHERE category='footwear' AND price <= 100 LIMIT 1"))[0].id)

    mockSolver(resp('OPTIMAL', [outfit([topId, shoeId, 'wardrobe-anchor-0'])]))

    const res = await recommend({ provider: offlineProvider, intent, wardrobe, maxResults: 1 })

    expect(res.outfits).toHaveLength(1)
    const o = res.outfits[0]
    expect(o.products.map((p) => p.id).sort()).toEqual([topId, shoeId].sort())
    expect(o.products.every((p) => p.id.startsWith('cat-'))).toBe(true)
    expect(o.reusedWardrobeItems.map((r) => r.name)).toContain('Black jeans')
    expect(o.totalPrice).toBeLessThanOrEqual(250)
    expect(o.explanation.source).toBe('deterministic')
    expect(res.stylistSelection?.selectedOutfitRank).toBe(1)
    expect(res.stylistSelection?.source).toBe('solver')
    expect(o.rules.some((r) => r.ruleId === 'budget_total' && r.passed)).toBe(true)
    // new fields surfaced
    expect(res.policy).toBeTruthy()
    expect(o.itemContributions.length).toBe(o.products.length)
    expect(o.objectiveBreakdown.finalObjectiveScore).toBe(50000)
    expect(res.solver.relaxationLevel).toBe(0)
    expect(res.solver.metrics.candidateCount).toBeGreaterThan(0)
  })

  it('never retrieves the opposite gender (no mixed-gender outfits)', async () => {
    const cfg = resolvePolicy('balanced')
    const pool = await retrieveCandidates(
      ['top', 'footwear', 'bag'],
      { intent: { ...intent, genderPreference: 'women' }, wardrobe, anchors: [], budgetMax: 250 },
      { minRank: null, maxRank: null },
      {
        weights: cfg.weights,
        maxPerCategory: cfg.retrieval.maxCandidatesPerCategory,
        broadLimit: cfg.retrieval.broadLimit,
        inventory: cfg.inventory,
        requestedSizes: [],
      },
    )
    const all = [...pool.byCategory.values()].flat()
    expect(all.length).toBeGreaterThan(0)
    expect(all.every((rc) => rc.product.gender === 'women' || rc.product.gender === 'unisex')).toBe(true)
  })

  it('returns actionable infeasibility (no fake outfit) when the solver finds none', async () => {
    mockSolver(resp('INFEASIBLE', [], ['budget_max']))

    const res = await recommend({
      provider: offlineProvider,
      intent: { ...intent, maxBudget: 1 },
      wardrobe,
      maxResults: 1,
    })

    expect(res.outfits).toHaveLength(0)
    expect(res.stylistSelection).toBeNull()
    expect(res.infeasibility).not.toBeNull()
    expect(res.infeasibility?.suggestions.length).toBeGreaterThan(0)
    // the full relaxation ladder was attempted and reported
    expect(res.solver.relaxationAttempts.length).toBeGreaterThan(1)
  })
})
