import type { Formality, Gender, Warmth } from '@copilot/shared'
import { INR_TO_EUR } from '../config'

// ---------------------------------------------------------------------------
// Deterministic catalog enrichment.
//
// Every attribute is derived from the real CSV row using dictionaries and
// regular expressions — NO LLM is involved. These functions are pure and fully
// unit-tested so the catalog is reproducible and auditable.
// ---------------------------------------------------------------------------

/**
 * Normalize a raw price string from the CSV (e.g. "₹8,599", "₹939", "1,299")
 * into a number in EUR (2 decimals). Returns null when no valid price exists.
 */
export function normalizePrice(raw: string | null | undefined): number | null {
  if (!raw) return null
  // Strip currency symbols/words, thousands separators and whitespace.
  const cleaned = raw.replace(/[₹$€]|rs\.?|inr/gi, '').replace(/,/g, '').trim()
  const value = Number.parseFloat(cleaned)
  if (!Number.isFinite(value) || value <= 0) return null
  const eur = value * INR_TO_EUR
  return Math.round(eur * 100) / 100
}

interface CategoryRule {
  category: string
  keywords: string[]
}

// Ordered by priority — the first matching rule wins. Note that 'innerwear'
// (petticoat, swimsuit, bra…) is checked BEFORE outerwear/top so e.g.
// "petticoat" is not mis-read as a "coat".
const CATEGORY_RULES: CategoryRule[] = [
  { category: 'footwear', keywords: ['sandal', 'heel', 'heels', 'sneaker', 'shoe', 'shoes', 'boot', 'boots', 'slipper', 'loafer', 'flip flop', 'flats', 'footwear', 'mojari', 'juti', 'jutti'] },
  { category: 'bag', keywords: ['handbag', 'sling bag', 'sling', 'clutch', 'backpack', 'wallet', 'purse', 'tote', 'shoulder bag', 'bag'] },
  { category: 'jewellery', keywords: ['earring', 'earrings', 'necklace', 'jewellery', 'jewelry', 'bangle', 'bangles', 'bracelet', 'pendant', 'jhumka', 'jhumki', 'anklet', 'mangalsutra', 'nose pin', 'maang tikka', 'ring'] },
  { category: 'innerwear', keywords: ['bra', 'bralette', 'brief', 'briefs', 'panty', 'panties', 'lingerie', 'petticoat', 'shapewear', 'camisole', 'innerwear', 'vest', 'swimsuit', 'nightwear', 'nighty'] },
  { category: 'ethnic', keywords: ['saree', 'sari', 'lehenga', 'lehanga', 'salwar', 'anarkali', 'dupatta', 'choli', 'sherwani', 'ghagra', 'kurta', 'kurti', 'kurtas'] },
  { category: 'outerwear', keywords: ['blazer', 'jacket', 'coat', 'sweater', 'sweatshirt', 'hoodie', 'cardigan', 'shrug', 'waistcoat', 'overcoat'] },
  { category: 'dress', keywords: ['dress', 'gown', 'jumpsuit', 'frock', 'dungaree'] },
  { category: 'bottom', keywords: ['jeans', 'jegging', 'jeggings', 'trouser', 'trousers', 'pant', 'pants', 'legging', 'leggings', 'palazzo', 'shorts', 'skirt', 'dhoti', 'pyjama', 'capri', 'culotte', 'chino', 'chinos'] },
  { category: 'accessory', keywords: ['belt', 'scarf', 'sunglass', 'sunglasses', 'watch', 'cap', 'hat', 'glove', 'gloves', 'stole', 'socks'] },
  { category: 'top', keywords: ['t-shirt', 'tshirt', 'tee', 'shirt', 'top', 'blouse', 'tank top', 'tunic', 'crop top'] },
]

/** Whole-token match so "coat" does not match inside "petticoat". */
function matchesKeyword(haystack: string, kw: string): boolean {
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^a-z0-9])${escaped}(?:[^a-z0-9]|$)`).test(haystack)
}

export function detectCategory(title: string): { category: string; subcategory: string | null } {
  const t = title.toLowerCase()
  for (const rule of CATEGORY_RULES) {
    for (const kw of rule.keywords) {
      if (matchesKeyword(t, kw)) {
        return { category: rule.category, subcategory: kw }
      }
    }
  }
  return { category: 'other', subcategory: null }
}

const COLOR_DICTIONARY: string[] = [
  'multicolor', 'black', 'white', 'ivory', 'cream', 'beige', 'tan', 'khaki', 'brown',
  'navy', 'blue', 'teal', 'green', 'olive', 'red', 'maroon', 'wine', 'pink', 'peach',
  'purple', 'lavender', 'grey', 'gray', 'silver', 'gold', 'yellow', 'mustard', 'orange', 'rust',
]

export function extractColors(title: string): string[] {
  const t = title.toLowerCase()
  const found: string[] = []
  for (const color of COLOR_DICTIONARY) {
    const re = new RegExp(`\\b${color}\\b`)
    if (re.test(t)) {
      const norm = color === 'gray' ? 'grey' : color
      if (!found.includes(norm)) found.push(norm)
    }
  }
  return found
}

export function detectGender(title: string): Gender {
  const t = ` ${title.toLowerCase()} `
  // Check women first — "women" contains "men".
  if (/\b(women|woman|girls?|ladies|female|saree|sari|kurti|lehenga|bra|bralette|blouse)\b/.test(t)) {
    return 'women'
  }
  if (/\b(men|man|boys?|male|sherwani)\b/.test(t)) {
    return 'men'
  }
  return 'unisex'
}

export function detectFormality(title: string, category: string): Formality {
  const t = title.toLowerCase()
  if (/\b(formal|tuxedo|suit|blazer|sherwani|gown|saree|silk)\b/.test(t)) {
    return category === 'outerwear' || category === 'ethnic' ? 'formal' : 'elegant-casual'
  }
  if (/\b(party|wedding|elegant|satin|embroidered|designer|sequin)\b/.test(t)) {
    return 'elegant-casual'
  }
  if (/\b(jeans|t-shirt|tshirt|tee|sneaker|hoodie|sweatshirt|shorts|casual|track)\b/.test(t)) {
    return 'casual'
  }
  // category defaults
  switch (category) {
    case 'ethnic':
      return 'elegant-casual'
    case 'outerwear':
    case 'dress':
    case 'jewellery':
      return 'elegant-casual'
    case 'bottom':
    case 'top':
      return 'smart-casual'
    default:
      return 'smart-casual'
  }
}

export function detectWarmth(title: string, category: string): Warmth {
  const t = title.toLowerCase()
  if (/\b(sweater|sweatshirt|hoodie|coat|jacket|wool|woolen|fleece|knit|cardigan|thermal|quilted)\b/.test(t)) {
    return 'warm'
  }
  if (/\b(blazer|full sleeve|long sleeve|denim|cotton blend)\b/.test(t) || category === 'outerwear') {
    return 'medium'
  }
  if (/\b(sleeveless|satin|chiffon|sandal|shorts|tank|cami|net|sheer)\b/.test(t)) {
    return 'light'
  }
  return 'medium'
}

const STYLE_TAG_DICTIONARY: string[] = [
  'casual', 'formal', 'party', 'wedding', 'ethnic', 'traditional', 'bollywood',
  'embroidered', 'printed', 'solid', 'floral', 'striped', 'slim', 'regular',
  'designer', 'denim', 'cotton', 'silk', 'satin', 'georgette', 'chiffon', 'woolen',
]

export function extractStyleTags(title: string): string[] {
  const t = title.toLowerCase()
  return STYLE_TAG_DICTIONARY.filter((tag) => new RegExp(`\\b${tag}\\b`).test(t))
}

export interface RawRow {
  id: string
  brand: string
  title: string
  sold_price: string
  actual_price: string
  url: string
  img: string
}

export interface EnrichedProduct {
  id: string
  sourceId: number
  brand: string
  title: string
  price: number
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
  // Inventory — the source CSV has no size/stock data, so these are unknown
  // and never invented. A real inventory adapter would populate them later.
  availableSizes: string[] | null
  stockStatus: 'in_stock' | 'out_of_stock' | 'unknown'
  stockQuantity: number | null
  availabilitySource: string
}

/**
 * Enrich a single raw CSV row. Returns null (to be discarded + counted) when the
 * row lacks the minimum viable data (a title and a valid price).
 */
export function enrichRow(row: RawRow, currency: string): EnrichedProduct | null {
  const title = (row.title ?? '').trim()
  const sourceId = Number.parseInt(row.id, 10)
  if (!title || !Number.isFinite(sourceId)) return null

  const price = normalizePrice(row.sold_price) ?? normalizePrice(row.actual_price)
  if (price === null) return null

  const listPrice = normalizePrice(row.actual_price)
  const { category, subcategory } = detectCategory(title)

  return {
    id: `cat-${sourceId}`,
    sourceId,
    brand: (row.brand ?? '').trim() || 'Unbranded',
    title,
    price,
    listPrice: listPrice && listPrice >= price ? listPrice : null,
    currency,
    url: (row.url ?? '').trim(),
    image: (row.img ?? '').trim(),
    category,
    subcategory,
    colors: extractColors(title),
    styleTags: extractStyleTags(title),
    formality: detectFormality(title, category),
    warmth: detectWarmth(title, category),
    gender: detectGender(title),
    available: true,
    source: 'catalog',
    availableSizes: null,
    stockStatus: 'unknown',
    stockQuantity: null,
    availabilitySource: 'catalog-default',
  }
}
