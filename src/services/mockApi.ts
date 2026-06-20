import type {
  IntentMetadata,
  Recommendation,
  SolverConstraint,
  WardrobeContext,
} from '../data/types'
import {
  MOCK_INTENT_METADATA,
  MOCK_RECOMMENDATION,
  MOCK_WARDROBE_CONTEXT,
  SOLVER_CONSTRAINTS,
} from '../data/mockData'

// ---------------------------------------------------------------------------
// Mock service layer.
//
// Every function here imitates a network call to a real microservice and
// resolves hardcoded, demo-ready data after a small delay. The signatures are
// intentionally clean so the UI could be re-pointed at real endpoints later
// without touching components — only the bodies of these functions change.
// ---------------------------------------------------------------------------

/** Resolve after `ms` milliseconds — simulates network / inference latency. */
export const delay = (ms: number) => new Promise<void>((r) => setTimeout(r, ms))

/**
 * mockWardrobeAnalyzer
 * Real-world equivalent: a vision + tagging API that ingests garment text/photos
 * and returns a structured wardrobe context (style, palette, gaps, formality).
 */
export async function mockWardrobeAnalyzer(_input: {
  text: string
  imageCount: number
}): Promise<WardrobeContext> {
  await delay(1500)
  return MOCK_WARDROBE_CONTEXT
}

/**
 * mockMetadataExtractor
 * Real-world equivalent: an LLM call with structured output that turns the
 * buyer's free-text intent into a typed metadata record.
 */
export async function mockMetadataExtractor(_intent: string): Promise<IntentMetadata> {
  await delay(1400)
  return MOCK_INTENT_METADATA
}

/**
 * mockRuleSolver
 * Real-world equivalent: a rules engine / SAT / constraint solver that filters
 * the candidate space down to coherent, in-budget, in-stock outfits.
 */
export async function mockRuleSolver(
  _ctx: WardrobeContext,
  _meta: IntentMetadata,
): Promise<{ constraints: SolverConstraint[]; survivors: number; evaluated: number }> {
  await delay(1700)
  return {
    constraints: SOLVER_CONSTRAINTS,
    evaluated: 1842,
    survivors: 7,
  }
}

/**
 * mockRecommendationAPI
 * Real-world equivalent: a ranking service that scores the surviving outfit
 * candidates and assembles the final, explained recommendation.
 */
export async function mockRecommendationAPI(
  _ctx: WardrobeContext,
  _meta: IntentMetadata,
): Promise<Recommendation> {
  await delay(1600)
  return MOCK_RECOMMENDATION
}
