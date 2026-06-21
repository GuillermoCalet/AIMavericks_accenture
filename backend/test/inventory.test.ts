import { describe, it, expect } from 'vitest'
import type { Product } from '@copilot/shared'
import { evaluateInventory, type InventoryConfig } from '../src/rules/inventory'

function product(o: Partial<Product> = {}): Product {
  return {
    id: 'cat-1', sourceId: 1, brand: 'B', title: 'T', price: 10, listPrice: null, currency: '€',
    url: '', image: '', category: 'top', subcategory: null, colors: ['black'], styleTags: [],
    formality: 'smart-casual', warmth: 'medium', gender: 'women', available: true, source: 'catalog',
    availableSizes: null, stockStatus: 'unknown', stockQuantity: null, availabilitySource: 'catalog-default',
    ...o,
  }
}

const cfg = (over: Partial<InventoryConfig> = {}): InventoryConfig => ({
  unknownStockPolicy: 'allow',
  unknownSizePolicy: 'allow',
  unknownDataPenalty: 80,
  ...over,
})

describe('evaluateInventory', () => {
  it('rejects out-of-stock products (immutable hard)', () => {
    const r = evaluateInventory(product({ stockStatus: 'out_of_stock' }), [], cfg())
    expect(r.rejected?.ruleId).toBe('stock_out')
  })

  it('rejects a confirmed size mismatch', () => {
    const r = evaluateInventory(product({ availableSizes: ['S', 'M'], stockStatus: 'in_stock' }), ['XL'], cfg())
    expect(r.rejected?.ruleId).toBe('size_incompatible')
  })

  it('accepts a matching size', () => {
    const r = evaluateInventory(product({ availableSizes: ['S', 'M'], stockStatus: 'in_stock' }), ['M'], cfg())
    expect(r.rejected).toBeNull()
  })

  it('follows the unknown-stock policy: allow / penalize / reject', () => {
    expect(evaluateInventory(product(), [], cfg({ unknownStockPolicy: 'allow' })).rejected).toBeNull()
    expect(evaluateInventory(product(), [], cfg({ unknownStockPolicy: 'penalize' })).unknownPenalty).toBe(80)
    expect(evaluateInventory(product(), [], cfg({ unknownStockPolicy: 'reject' })).rejected?.ruleId).toBe('stock_unknown')
  })

  it('follows the unknown-size policy only when sizes are requested', () => {
    // unknown size, sizes requested
    expect(evaluateInventory(product({ stockStatus: 'in_stock' }), ['M'], cfg({ unknownSizePolicy: 'reject' })).rejected?.ruleId).toBe('size_unknown')
    expect(evaluateInventory(product({ stockStatus: 'in_stock' }), ['M'], cfg({ unknownSizePolicy: 'penalize' })).unknownPenalty).toBe(80)
    // no sizes requested -> size policy irrelevant
    expect(evaluateInventory(product({ stockStatus: 'in_stock' }), [], cfg({ unknownSizePolicy: 'reject' })).rejected).toBeNull()
  })
})
