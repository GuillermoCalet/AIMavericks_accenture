// ---------------------------------------------------------------------------
// Shared, framework-agnostic domain contracts.
//
// TYPE-ONLY by design: nothing here emits runtime code, so both the Vite
// frontend and the tsx/Node backend can import these without any bundling or
// resolution concerns. Runtime validation (Zod) lives in the backend.
// ---------------------------------------------------------------------------

export type Formality = 'casual' | 'smart-casual' | 'elegant-casual' | 'formal'
export type Warmth = 'light' | 'medium' | 'warm'
export type Gender = 'women' | 'men' | 'unisex'
export type BudgetLevel = 'low' | 'medium' | 'high' | 'unknown'

/** Inventory/stock status. `unknown` is a first-class value (dataset has no stock). */
export type StockStatus = 'in_stock' | 'out_of_stock' | 'unknown'

/** Availability sub-contract — also the shape a future inventory API adapter returns. */
export interface InventoryAvailability {
  /** Sizes known to be available, or null when unknown (never invented). */
  availableSizes: string[] | null
  stockStatus: StockStatus
  stockQuantity: number | null
  /** Where the availability came from, e.g. "catalog-default", "inventory-api". */
  availabilitySource: string
}

/** A catalog product — every field traces back to a real row of Data - Copy.csv. */
export interface Product {
  id: string
  sourceId: number
  brand: string
  title: string
  /** Normalized current price in catalog currency units (number). */
  price: number
  /** Normalized original/list price, if present. */
  listPrice: number | null
  currency: string
  url: string
  image: string
  category: string
  subcategory: string | null
  colors: string[]
  styleTags: string[]
  formality: Formality
  warmth: Warmth
  gender: Gender
  available: boolean
  source: 'catalog'
  // --- inventory (see InventoryAvailability) ---
  availableSizes: string[] | null
  stockStatus: StockStatus
  stockQuantity: number | null
  availabilitySource: string
}

export interface WardrobeItem {
  name: string
  category: string
  subcategory: string | null
  color: string
  secondaryColors: string[]
  formality: Formality
  warmth: Warmth
  styleTags: string[]
}

export interface WardrobeContext {
  detectedStyle: string
  styleConfidence: number
  frequentColors: { name: string; hex: string }[]
  keyPieces: string[]
  missingPieces: string[]
  predominantFormality: Formality
  items: WardrobeItem[]
}

export interface IntentMetadata {
  occasion: string
  location: string | null
  weatherContext: string | null
  desiredStyle: string
  budgetLevel: BudgetLevel
  minBudget: number | null
  maxBudget: number | null
  anchorItems: string[]
  avoidItems: string[]
  avoidColors: string[]
  preferredColors: string[]
  requiredCategories: string[]
  optionalCategories: string[]
  recommendationGoal: string
  sizeConstraints: string | null
  /** Concrete sizes the buyer needs the items to be available in (hard filter when present). */
  requestedSizes: string[]
  genderPreference: Gender | null
}

/** A single explainable rule evaluation (deterministic engine output). */
export interface RuleResult {
  ruleId: string
  label: string
  type: 'hard' | 'soft'
  passed: boolean
  score: number
  maxScore: number
  reason: string
  evidence: Record<string, unknown>
}

/** A retrieved candidate product with its preliminary per-category ranking. */
export interface Candidate {
  product: Product
  category: string
  preliminaryScore: number
  /** Per-signal contributions to the preliminary score, for auditability. */
  signals: Record<string, number>
}

export type SolverStatus = 'OPTIMAL' | 'FEASIBLE' | 'INFEASIBLE' | 'MODEL_INVALID' | 'UNKNOWN'

export interface ScoreBreakdown {
  contextFit: number
  styleFit: number
  colorCompatibility: number
  wardrobeCompatibility: number
  complementarity: number
  versatility: number
  budgetEfficiency: number
}

export type OptimizationPolicy = string

/** Real, deterministic compatibility between two co-selectable products. */
export interface PairCompatibility {
  a: string
  b: string
  /** 0..1 compatibility score. */
  score: number
  /** Per-factor breakdown (color, formality, style, warmth, category, occasion, reuse). */
  factors: Record<string, number>
  reason: string
}

/** Net economic/quality contribution of a single selected item. */
export interface ItemContribution {
  productId: string
  /** Weighted soft-preference score (integer, CP-SAT scale). */
  grossScore: number
  /** Penalties applied to this item (optional + complexity + price share). */
  penalty: number
  /** grossScore − penalty. An optional item is only chosen when this is positive. */
  net: number
  optional: boolean
  reused: boolean
  redundant: boolean
}

/** Integer-scaled breakdown of the objective for one outfit (CP-SAT scale). */
export interface ObjectiveBreakdown {
  qualityScore: number
  pairCompatibilityScore: number
  completenessBonus: number
  pricePenalty: number
  optionalItemPenalty: number
  complexityPenalty: number
  diversityPenalty: number
  finalObjectiveScore: number
}

/** How different an alternative outfit is from the previous ones. */
export interface DiversityMetrics {
  sharedProductCount: number
  jaccardSimilarity: number
  diversityScore: number
  diversityPenalty: number
  reason: string
}

/** One attempt of the progressive, explicit relaxation ladder. */
export interface RelaxationAttempt {
  level: number
  label: string
  relaxedRules: string[]
  reason: string
  originalValues: Record<string, unknown>
  relaxedValues: Record<string, unknown>
  solverStatus: SolverStatus
  solvingTimeMs: number
  feasible: boolean
}

/** Model-size / performance metrics for one solver run. */
export interface SolverMetrics {
  candidateCount: number
  pairVariableCount: number
  constraintCount: number
  solveTimeMs: number
  solverStatus: SolverStatus
}

/** A fully assembled, real recommendation surfaced to the UI. */
export interface OutfitRecommendation {
  rank: number
  /** Final position after deterministic solver + LLM stylist blending. */
  hybridRank: number
  products: Product[]
  reusedWardrobeItems: WardrobeItem[]
  totalPrice: number
  currency: string
  /** True only when an explicit business rule authorized exceeding the budget. */
  overBudget: boolean
  objectiveScore: number
  scoreBreakdown: ScoreBreakdown
  objectiveBreakdown: ObjectiveBreakdown
  itemContributions: ItemContribution[]
  pairCompatibilities: PairCompatibility[]
  diversity: DiversityMetrics | null
  /** Rules that were evaluated for this specific outfit. */
  rules: RuleResult[]
  /** LLM (or deterministic-fallback) explanation, grounded in solver output. */
  explanation: {
    summary: string
    perItem: { productId: string; reason: string }[]
    source: 'llm' | 'deterministic'
  }
}

export interface StylistOutfitEvaluation {
  /** Original solver rank, kept stable for auditability. */
  outfitRank: number
  solverScore: number
  llmScore: number | null
  hybridScore: number
  colorHarmony: number | null
  styleCoherence: number | null
  occasionFit: number | null
  wardrobeFit: number | null
  reason: string
}

export interface RecommendationResult {
  intent: IntentMetadata
  wardrobe: WardrobeContext | null
  policy: OptimizationPolicy
  solver: {
    status: SolverStatus
    evaluatedCandidates: number
    candidatePoolSize: number
    solvingTimeMs: number
    appliedConstraints: string[]
    rejectedConstraints: string[]
    /** Final relaxation outcome. */
    relaxationLevel: number
    relaxed: boolean
    relaxedRules: string[]
    relaxationAttempts: RelaxationAttempt[]
    metrics: SolverMetrics
  }
  /** Final stylist choice among the solver-valid outfits. */
  stylistSelection: {
    selectedOutfitRank: number
    source: 'hybrid' | 'solver'
    reason: string
    solverWeight: number
    llmWeight: number
    evaluations: StylistOutfitEvaluation[]
  } | null
  outfits: OutfitRecommendation[]
  /** Present when no outfit could be produced — actionable guidance. */
  infeasibility: {
    message: string
    conflictingConstraints: string[]
    suggestions: string[]
  } | null
}

// --- API request payloads --------------------------------------------------

export interface RecommendRequest {
  intentText?: string
  wardrobeText?: string
  /** Pre-computed wardrobe context (from /wardrobe/analyze) to avoid re-analysis. */
  wardrobe?: WardrobeContext | null
  /** Pre-extracted intent (from /intent/extract) to avoid re-extraction. */
  intent?: IntentMetadata | null
  /** Named optimization policy (best_quality, balanced, …). Defaults to balanced. */
  optimizationPolicy?: OptimizationPolicy
  /** Concrete required sizes (hard filter when products carry size data). */
  requestedSizes?: string[]
  maxResults?: number
}

export interface ApiError {
  error: string
  code: string
  details?: unknown
}
