import type { Product } from '@copilot/shared'
import type { UnknownDataPolicy } from '../businessRules'

// ---------------------------------------------------------------------------
// Deterministic stock & size rules.
//
// Hard, never inferred by the LLM. The source dataset has no stock/size data,
// so the dominant case is "unknown", governed by an explicit, configurable
// policy (allow | penalize | reject). A product known to be out of stock is
// never treated as available; a confirmed size mismatch is always rejected.
// ---------------------------------------------------------------------------

export interface InventoryConfig {
  unknownStockPolicy: UnknownDataPolicy
  unknownSizePolicy: UnknownDataPolicy
  unknownDataPenalty: number
}

export interface InventoryReject {
  ruleId: string
  reason: string
}

export interface InventoryOutcome {
  rejected: InventoryReject | null
  /** Soft penalty (scaled) to apply when unknown data is merely penalized. */
  unknownPenalty: number
}

export function evaluateInventory(
  product: Product,
  requestedSizes: string[],
  cfg: InventoryConfig,
): InventoryOutcome {
  let unknownPenalty = 0

  // --- stock (immutable hard for out_of_stock) ---
  if (product.stockStatus === 'out_of_stock') {
    return { rejected: { ruleId: 'stock_out', reason: 'Product is out of stock' }, unknownPenalty: 0 }
  }
  if (product.stockStatus === 'unknown') {
    if (cfg.unknownStockPolicy === 'reject') {
      return { rejected: { ruleId: 'stock_unknown', reason: 'Stock unknown and policy=reject' }, unknownPenalty: 0 }
    }
    if (cfg.unknownStockPolicy === 'penalize') unknownPenalty += cfg.unknownDataPenalty
  }

  // --- size (immutable hard for a confirmed mismatch) ---
  if (requestedSizes.length > 0) {
    if (Array.isArray(product.availableSizes)) {
      const want = requestedSizes.map((s) => s.toLowerCase())
      const have = product.availableSizes.map((s) => s.toLowerCase())
      const ok = want.some((s) => have.includes(s))
      if (!ok) {
        return {
          rejected: { ruleId: 'size_incompatible', reason: `None of sizes [${requestedSizes.join(', ')}] available` },
          unknownPenalty: 0,
        }
      }
    } else {
      // size unknown
      if (cfg.unknownSizePolicy === 'reject') {
        return { rejected: { ruleId: 'size_unknown', reason: 'Size unknown and policy=reject' }, unknownPenalty: 0 }
      }
      if (cfg.unknownSizePolicy === 'penalize') unknownPenalty += cfg.unknownDataPenalty
    }
  }

  return { rejected: null, unknownPenalty }
}
