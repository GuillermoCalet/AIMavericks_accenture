import { describe, it, expect } from 'vitest'
import { computePairCompatibility, type Wearable } from '../src/rules/pairs'

const ctx = { targetFormalityRank: 2, anchorColors: ['black'] }

function w(o: Partial<Wearable> & { id: string; category: string }): Wearable {
  return { colors: ['black'], formality: 'elegant-casual', warmth: 'medium', styleTags: [], ...o }
}

describe('computePairCompatibility', () => {
  it('scores a coordinated top+footwear higher than a clashing one', () => {
    const good = computePairCompatibility(
      w({ id: 'a', category: 'top', colors: ['black'], formality: 'elegant-casual' }),
      w({ id: 'b', category: 'footwear', colors: ['black'], formality: 'elegant-casual' }),
      ctx,
    )
    const bad = computePairCompatibility(
      w({ id: 'a', category: 'top', colors: ['red'], formality: 'casual' }),
      w({ id: 'b', category: 'footwear', colors: ['green'], formality: 'formal' }),
      ctx,
    )
    expect(good.score).toBeGreaterThan(bad.score)
    expect(good.factors.color).toBeGreaterThan(bad.factors.color)
  })

  it('rewards the natural top+bottom pairing', () => {
    const pair = computePairCompatibility(
      w({ id: 'a', category: 'top' }),
      w({ id: 'b', category: 'bottom' }),
      ctx,
    )
    expect(pair.factors.category).toBeGreaterThanOrEqual(0.9)
  })

  it('uses the reuse factor against anchor colours', () => {
    const matches = computePairCompatibility(
      w({ id: 'a', category: 'top', colors: ['black'], isAnchor: true }),
      w({ id: 'b', category: 'footwear', colors: ['black'] }),
      ctx,
    )
    const clashes = computePairCompatibility(
      w({ id: 'a', category: 'top', colors: ['black'], isAnchor: true }),
      w({ id: 'b', category: 'footwear', colors: ['red'] }),
      ctx,
    )
    expect(matches.factors.reuse).toBeGreaterThan(clashes.factors.reuse)
  })

  it('produces a human-readable reason', () => {
    const pair = computePairCompatibility(
      w({ id: 'a', category: 'top', colors: ['black'] }),
      w({ id: 'b', category: 'bottom', colors: ['black'] }),
      ctx,
    )
    expect(typeof pair.reason).toBe('string')
    expect(pair.reason.length).toBeGreaterThan(0)
  })
})
