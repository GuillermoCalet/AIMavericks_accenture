import { describe, it, expect } from 'vitest'
import {
  businessRules,
  OPTIMIZATION_POLICIES,
  resolvePolicy,
  validateBusinessRules,
} from '../src/businessRules'

describe('business rules config', () => {
  it('loads and validates the versioned config at startup', () => {
    expect(businessRules.version).toBeGreaterThan(0)
    expect(OPTIMIZATION_POLICIES).toContain('balanced')
    expect(OPTIMIZATION_POLICIES).toContain('minimum_items')
  })

  it('resolves the default (balanced) policy for unknown names', () => {
    expect(resolvePolicy('does-not-exist').policy).toBe(businessRules.defaultPolicy)
  })

  it('merges policy overrides over the base config', () => {
    const min = resolvePolicy('minimum_items')
    const grow = resolvePolicy('basket_growth')
    const quality = resolvePolicy('best_quality')
    // minimum_items penalizes extra items far more than basket_growth
    expect(min.objective.complexityPenaltyPerItem).toBeGreaterThan(grow.objective.complexityPenaltyPerItem)
    expect(min.optionalItemPenalty.default).toBeGreaterThan(grow.optionalItemPenalty.default)
    expect(quality.stylist.llmWeight).toBeGreaterThan(businessRules.stylist.llmWeight)
  })

  it('rejects an invalid configuration (would block startup)', () => {
    const bad = { ...(businessRules as unknown as Record<string, unknown>), version: -1 }
    expect(validateBusinessRules(bad).success).toBe(false)
    const missing = { version: 1 }
    expect(validateBusinessRules(missing).success).toBe(false)
  })
})
