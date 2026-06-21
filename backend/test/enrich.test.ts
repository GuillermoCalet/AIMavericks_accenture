import { describe, it, expect } from 'vitest'
import {
  detectCategory,
  detectFormality,
  detectGender,
  detectWarmth,
  enrichRow,
  extractColors,
  extractStyleTags,
  normalizePrice,
  type RawRow,
} from '../src/catalog/enrich'

describe('normalizePrice', () => {
  it('parses INR strings and converts to EUR', () => {
    expect(normalizePrice('₹8,599')).toBeCloseTo(94.59, 1)
    expect(normalizePrice('₹939')).toBeCloseTo(10.33, 1)
    expect(normalizePrice('1,299')).toBeCloseTo(14.29, 1)
  })
  it('returns null for missing or invalid prices', () => {
    expect(normalizePrice('')).toBeNull()
    expect(normalizePrice(null)).toBeNull()
    expect(normalizePrice('free')).toBeNull()
    expect(normalizePrice('₹0')).toBeNull()
  })
})

describe('detectCategory', () => {
  it('classifies common garments', () => {
    expect(detectCategory('Regular Women Black Jeans').category).toBe('bottom')
    expect(detectCategory('Women Black Heels Sandal').category).toBe('footwear')
    expect(detectCategory('Satin Drape Camisole Top').category).toBe('innerwear') // camisole
    expect(detectCategory('Casual Solid Women Pink Top').category).toBe('top')
    expect(detectCategory('Gold Plated Pearl Drop Earrings').category).toBe('jewellery')
    expect(detectCategory('Structured Beige Tailored Blazer').category).toBe('outerwear')
    expect(detectCategory('Black Women Sling Bag').category).toBe('bag')
    expect(detectCategory('Embroidered Banarasi Silk Saree').category).toBe('ethnic')
  })
  it('uses whole-word matching ("petticoat" is not a "coat")', () => {
    expect(detectCategory("Women's Satin Petticoat").category).toBe('innerwear')
    expect(detectCategory('Wool Overcoat for Winter').category).toBe('outerwear')
  })
  it('falls back to other', () => {
    expect(detectCategory('Mystery Gadget Holder').category).toBe('other')
  })
})

describe('extractColors', () => {
  it('extracts known colours by whole word', () => {
    expect(extractColors('Structured Beige Tailored Blazer')).toEqual(['beige'])
    expect(extractColors('Girls 3/4th Sleeve Black, White Shrug')).toEqual(['black', 'white'])
  })
  it('normalizes gray to grey and dedupes', () => {
    expect(extractColors('Gray and gray melange tee')).toEqual(['grey'])
  })
})

describe('detectGender', () => {
  it('prefers women over the substring men', () => {
    expect(detectGender('Casual Women Black Top')).toBe('women')
    expect(detectGender("Men's Slim Fit Shirt")).toBe('men')
    expect(detectGender('Solid Cotton Shirt')).toBe('unisex')
  })
})

describe('detectFormality / detectWarmth', () => {
  it('reads formality cues', () => {
    expect(detectFormality('Satin Party Gown', 'dress')).toBe('elegant-casual')
    expect(detectFormality('Casual Cotton T-shirt', 'top')).toBe('casual')
  })
  it('reads warmth cues', () => {
    expect(detectWarmth('Woolen Knit Sweater', 'outerwear')).toBe('warm')
    expect(detectWarmth('Sleeveless Satin Top', 'top')).toBe('light')
  })
})

describe('extractStyleTags', () => {
  it('extracts tags present in the title', () => {
    expect(extractStyleTags('Embroidered Designer Silk Saree')).toEqual(
      expect.arrayContaining(['embroidered', 'designer', 'silk']),
    )
  })
})

describe('enrichRow', () => {
  const row: RawRow = {
    id: '11',
    brand: 'Roadster',
    title: 'Regular Women Black Jeans',
    sold_price: '₹686',
    actual_price: '₹2,199',
    url: 'https://x',
    img: 'https://img',
  }
  it('produces a fully enriched product linked to the source row', () => {
    const p = enrichRow(row, '€')!
    expect(p).not.toBeNull()
    expect(p.id).toBe('cat-11')
    expect(p.sourceId).toBe(11)
    expect(p.category).toBe('bottom')
    expect(p.colors).toContain('black')
    expect(p.gender).toBe('women')
    expect(p.price).toBeGreaterThan(0)
    expect(p.listPrice).toBeGreaterThan(p.price)
  })
  it('discards rows without a usable price or title', () => {
    expect(enrichRow({ ...row, sold_price: '', actual_price: '' }, '€')).toBeNull()
    expect(enrichRow({ ...row, title: '' }, '€')).toBeNull()
  })
})
