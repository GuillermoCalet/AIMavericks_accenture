// ---------------------------------------------------------------------------
// Shared domain types for the AI Fashion Copilot demo.
// Everything here mirrors the structured contracts that a real pipeline
// (wardrobe API -> LLM -> rules/SAT solver -> recommender API) would exchange.
// ---------------------------------------------------------------------------

export type Formality = 'casual' | 'smart-casual' | 'elegant-casual' | 'formal'

/** A single product as it would arrive from the retailer catalog API. */
export interface Product {
  id: string
  name: string
  brand: string
  category: string
  price: number
  /** Original list price, used to show a discount/value signal. */
  listPrice?: number
  currency: string
  /** Remote catalog image (real Flipkart CDN). Falls back gracefully offline. */
  image: string
  colors: string[]
  /** Human-readable reason the recommender surfaced this item. */
  reason: string
  /** Marketing-style tag shown on the card. */
  tag: 'Best match' | 'Complements wardrobe' | 'Increases versatility' | 'Reuse from wardrobe' | 'Trending pick'
  /** Whether the item is already owned by the user (reused) or new to buy. */
  source: 'wardrobe' | 'catalog'
}

/** Output of the (mock) wardrobe analysis API. */
export interface WardrobeContext {
  detectedStyle: string
  styleConfidence: number
  frequentColors: { name: string; hex: string }[]
  keyPieces: string[]
  missingPieces: string[]
  predominantFormality: Formality
  /** Visual cards of pieces "detected" in the wardrobe. */
  items: WardrobeItem[]
}

export interface WardrobeItem {
  name: string
  category: string
  color: string
  hex: string
}

/** Structured metadata an LLM would extract from the buyer's free-text intent. */
export interface IntentMetadata {
  occasion: string
  location: string
  weather_context: string
  desired_style: string
  budget: 'low' | 'medium' | 'high'
  budget_range: string
  anchor_item: string
  avoid: string
  recommendation_goal: string
  preferred_colors: string[]
}

/** One step in the reasoning pipeline visualisation. */
export type StageStatus = 'pending' | 'processing' | 'completed'

export interface PipelineStage {
  id: string
  title: string
  subtitle: string
  /** Short technical descriptor of the "engine" behind the step. */
  engine: string
  detail: string
}

/** A constraint as the (mock) rules / SAT solver would express it. */
export interface SolverConstraint {
  id: string
  label: string
  expression: string
  satisfied: boolean
}

/** The final assembled recommendation. */
export interface Recommendation {
  outfitName: string
  hero: Product
  complements: Product[]
  reused: Product[]
  explanation: string
  rationale: {
    contextFit: string
    styleFit: string
    wardrobeCompatibility: string
    businessValue: string
  }
  metrics: { label: string; value: string; delta: string }[]
}
