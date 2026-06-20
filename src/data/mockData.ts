import type {
  IntentMetadata,
  Recommendation,
  SolverConstraint,
  WardrobeContext,
} from './types'
import { CATALOG } from './catalog'

// ---------------------------------------------------------------------------
// Hardcoded, demo-ready domain data. Each block is the "response" a real
// service would return; the mock API layer in services/mockApi.ts simply
// resolves these after a small, realistic delay.
// ---------------------------------------------------------------------------

/** Pre-filled wardrobe description used by the one-click demo. */
export const DEFAULT_WARDROBE_TEXT =
  'Black jeans, white cotton shirts, a beige trench coat, navy knitwear, ' +
  'a couple of plain tees, white sneakers and black ankle boots. ' +
  'Mostly minimal, neutral colours.'

/** Pre-filled buyer intent used by the one-click demo. */
export const DEFAULT_INTENT_TEXT =
  'I need an outfit for a casual dinner this Saturday in Barcelona. I want ' +
  'something elegant but comfortable, and I’d like to reuse my black jeans.'

export const MOCK_WARDROBE_CONTEXT: WardrobeContext = {
  detectedStyle: 'Minimal Smart-Casual',
  styleConfidence: 0.91,
  frequentColors: [
    { name: 'Black', hex: '#15151a' },
    { name: 'Ivory', hex: '#f4efe6' },
    { name: 'Navy', hex: '#27324d' },
    { name: 'Beige', hex: '#d8c6a6' },
  ],
  keyPieces: ['Black jeans', 'White cotton shirt', 'Beige trench coat', 'Navy knit', 'White sneakers'],
  missingPieces: ['Elevated evening top', 'Tailored layer', 'Dressier footwear', 'Statement accessory'],
  predominantFormality: 'smart-casual',
  items: [
    { name: 'Black Jeans', category: 'Bottoms', color: 'Black', hex: '#15151a' },
    { name: 'White Cotton Shirt', category: 'Tops', color: 'Ivory', hex: '#f4efe6' },
    { name: 'Beige Trench Coat', category: 'Outerwear', color: 'Beige', hex: '#d8c6a6' },
    { name: 'Navy Knit', category: 'Knitwear', color: 'Navy', hex: '#27324d' },
    { name: 'White Sneakers', category: 'Footwear', color: 'White', hex: '#fbfbf9' },
    { name: 'Black Ankle Boots', category: 'Footwear', color: 'Black', hex: '#1c1c22' },
  ],
}

export const MOCK_INTENT_METADATA: IntentMetadata = {
  occasion: 'casual dinner',
  location: 'Barcelona',
  weather_context: 'mild evening · ~19°C',
  desired_style: 'elegant casual',
  budget: 'medium',
  budget_range: '€80–€250',
  anchor_item: 'black jeans',
  avoid: 'overly formal',
  recommendation_goal: 'complete outfit + accessories',
  preferred_colors: ['neutral', 'beige', 'gold accents'],
}

// Internal constraint set used by the (invisible) mock solver. Kept server-side
// in spirit — never surfaced to the shopper, who only ever sees the final look.
export const SOLVER_CONSTRAINTS: SolverConstraint[] = [
  {
    id: 'occasion',
    label: 'Match occasion',
    expression: 'occasion(item) ⊇ {casual_dinner, evening}',
    satisfied: true,
  },
  {
    id: 'budget',
    label: 'Respect budget',
    expression: 'Σ price(items) ≤ €250  ∧  price(item) ≤ budget.max',
    satisfied: true,
  },
  {
    id: 'colors',
    label: 'Coordinate colours',
    expression: 'palette(outfit) ⊆ {black, beige, ivory, gold}',
    satisfied: true,
  },
  {
    id: 'reuse',
    label: 'Reuse wardrobe item',
    expression: 'anchor = wardrobe.black_jeans  ∈  outfit',
    satisfied: true,
  },
  {
    id: 'formality',
    label: 'Avoid over-formal',
    expression: 'formality(outfit) ≤ elegant_casual',
    satisfied: true,
  },
  {
    id: 'complementarity',
    label: 'Maximise basket complementarity',
    expression: 'argmax Σ complement(itemᵢ, itemⱼ)',
    satisfied: true,
  },
]

export const MOCK_RECOMMENDATION: Recommendation = {
  outfitName: 'Elegant-Casual Dinner, Reimagined',
  hero: CATALOG.blazer,
  complements: [CATALOG.top, CATALOG.sandals, CATALOG.earrings, CATALOG.bag],
  reused: [CATALOG.jeans],
  explanation:
    'We selected the beige blazer because it upgrades the user’s existing black jeans into an ' +
    'elegant-casual dinner outfit while staying within a medium budget and matching the mild ' +
    'evening context in Barcelona.',
  rationale: {
    contextFit:
      'Tuned for a mild Barcelona evening and a relaxed dinner: a light tailored layer over a ' +
      'satin top reads dressy without overheating or feeling stiff.',
    styleFit:
      'Holds the buyer’s minimal, neutral aesthetic — beige, black and gold — while nudging it one ' +
      'notch up to “elegant casual” exactly as requested.',
    wardrobeCompatibility:
      'Built around the black jeans already owned. Every added piece also coordinates with the ' +
      'existing trench, knit and boots, so cost-per-wear stays low.',
    businessValue:
      'Anchoring on an owned item lifts relevance and trust; four coordinated add-ons grow basket ' +
      'value while the “reuse what you own” framing reduces hesitation and abandonment.',
  },
  metrics: [
    { label: 'Relevance', value: '94%', delta: '+22 pts vs. generic' },
    { label: 'Outfit AOV', value: '€233', delta: '+38% basket' },
    { label: 'Items added', value: '4', delta: 'all coordinated' },
    { label: 'Cost-per-wear', value: 'Low', delta: 'reuses owned jeans' },
  ],
}
