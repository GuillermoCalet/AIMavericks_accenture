import fs from 'node:fs'
import path from 'node:path'
import { z } from 'zod'
import { REPO_ROOT } from './config'

// ---------------------------------------------------------------------------
// Versioned business configuration (config/business-rules.json).
//
// Single source of truth for weights, penalties, limits, incompatibilities,
// inventory policy, the relaxation ladder, diversity/pair/quality thresholds
// and the named optimization policies. Validated with Zod at startup; an
// invalid file makes the backend fail fast with a clear message. There are no
// magic numbers scattered through the code — everything tunable lives here.
// ---------------------------------------------------------------------------

const ScoreWeightsSchema = z.object({
  contextFit: z.number(),
  styleFit: z.number(),
  colorCompatibility: z.number(),
  wardrobeCompatibility: z.number(),
  complementarity: z.number(),
  versatility: z.number(),
  budgetEfficiency: z.number(),
})

const ObjectiveSchema = z.object({
  pairCompatibilityWeight: z.number().nonnegative(),
  completenessBonusPerRequired: z.number().nonnegative(),
  complexityPenaltyPerItem: z.number().nonnegative(),
  pricePenaltyWeight: z.number().nonnegative(),
  diversityPenaltyWeight: z.number().nonnegative(),
})

const OptionalPenaltySchema = z.object({
  default: z.number().nonnegative(),
  perCategory: z.record(z.string(), z.number().nonnegative()).default({}),
})

const PolicyOverrideSchema = z.object({
  weights: ScoreWeightsSchema.partial().optional(),
  objective: ObjectiveSchema.partial().optional(),
  optionalItemPenalty: z
    .object({
      default: z.number().nonnegative().optional(),
      perCategory: z.record(z.string(), z.number().nonnegative()).optional(),
    })
    .optional(),
})

const UnknownPolicy = z.enum(['allow', 'penalize', 'reject'])

const BusinessRulesSchema = z.object({
  version: z.number().int().positive(),
  scoreScale: z.number().int().positive(),
  weights: ScoreWeightsSchema,
  objective: ObjectiveSchema,
  optionalItemPenalty: OptionalPenaltySchema,
  categoryMax: z.record(z.string(), z.number().int().nonnegative()),
  incompatibleCategories: z.array(z.tuple([z.string(), z.string()])),
  items: z.object({ min: z.number().int().nonnegative(), max: z.number().int().positive() }),
  retrieval: z.object({
    maxCandidatesPerCategory: z.number().int().positive(),
    broadLimit: z.number().int().positive(),
  }),
  pairs: z.object({
    compatibilityThreshold: z.number().min(0).max(1),
    maxPairs: z.number().int().positive(),
  }),
  diversity: z.object({
    maxSharedProducts: z.number().int().nonnegative(),
    minJaccardDistance: z.number().min(0).max(1),
    minQualityRatio: z.number().min(0).max(1),
  }),
  inventory: z.object({
    unknownStockPolicy: UnknownPolicy,
    unknownSizePolicy: UnknownPolicy,
    unknownDataPenalty: z.number().nonnegative(),
  }),
  relaxation: z.object({
    allowOverBudget: z.boolean(),
    relaxableRequiredCategories: z.array(z.string()),
    immutableHard: z.array(z.string()),
    ladder: z
      .array(
        z.object({
          level: z.number().int().nonnegative(),
          label: z.string(),
          relaxes: z.array(z.string()),
        }),
      )
      .min(1),
  }),
  policies: z.record(z.string(), PolicyOverrideSchema),
  defaultPolicy: z.string(),
})

export type BusinessRules = z.infer<typeof BusinessRulesSchema>
export type ScoreWeights = z.infer<typeof ScoreWeightsSchema>
export type ObjectiveConfig = z.infer<typeof ObjectiveSchema>
export type OptionalPenaltyConfig = z.infer<typeof OptionalPenaltySchema>
export type UnknownDataPolicy = z.infer<typeof UnknownPolicy>

const CONFIG_PATH = path.join(REPO_ROOT, 'config', 'business-rules.json')

function loadBusinessRules(): BusinessRules {
  let raw: unknown
  try {
    raw = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'))
  } catch (err) {
    throw new Error(`Could not read business rules at ${CONFIG_PATH}: ${String(err)}`)
  }
  const parsed = BusinessRulesSchema.safeParse(raw)
  if (!parsed.success) {
    console.error('❌ Invalid config/business-rules.json:')
    console.error(JSON.stringify(parsed.error.flatten(), null, 2))
    throw new Error('Business rules validation failed')
  }
  const cfg = parsed.data
  if (!cfg.policies[cfg.defaultPolicy]) {
    throw new Error(`defaultPolicy "${cfg.defaultPolicy}" is not defined in policies`)
  }
  if (cfg.items.min > cfg.items.max) {
    throw new Error('items.min cannot exceed items.max')
  }
  return cfg
}

/** Validate an arbitrary object against the business-rules schema (used by tests). */
export function validateBusinessRules(obj: unknown) {
  return BusinessRulesSchema.safeParse(obj)
}

export const businessRules: BusinessRules = loadBusinessRules()

export const OPTIMIZATION_POLICIES = Object.keys(businessRules.policies)
export type OptimizationPolicy = string

/** A fully merged configuration for a specific optimization policy. */
export interface ResolvedBusinessConfig {
  policy: string
  scoreScale: number
  weights: ScoreWeights
  objective: ObjectiveConfig
  optionalItemPenalty: OptionalPenaltyConfig
  categoryMax: Record<string, number>
  incompatibleCategories: [string, string][]
  items: { min: number; max: number }
  retrieval: { maxCandidatesPerCategory: number; broadLimit: number }
  pairs: { compatibilityThreshold: number; maxPairs: number }
  diversity: { maxSharedProducts: number; minJaccardDistance: number; minQualityRatio: number }
  inventory: BusinessRules['inventory']
  relaxation: BusinessRules['relaxation']
}

export function resolvePolicy(name?: string | null): ResolvedBusinessConfig {
  const policy = name && businessRules.policies[name] ? name : businessRules.defaultPolicy
  const override = businessRules.policies[policy] ?? {}
  return {
    policy,
    scoreScale: businessRules.scoreScale,
    weights: { ...businessRules.weights, ...(override.weights ?? {}) },
    objective: { ...businessRules.objective, ...(override.objective ?? {}) },
    optionalItemPenalty: {
      default: override.optionalItemPenalty?.default ?? businessRules.optionalItemPenalty.default,
      perCategory: {
        ...businessRules.optionalItemPenalty.perCategory,
        ...(override.optionalItemPenalty?.perCategory ?? {}),
      },
    },
    categoryMax: businessRules.categoryMax,
    incompatibleCategories: businessRules.incompatibleCategories as [string, string][],
    items: businessRules.items,
    retrieval: businessRules.retrieval,
    pairs: businessRules.pairs,
    diversity: businessRules.diversity,
    inventory: businessRules.inventory,
    relaxation: businessRules.relaxation,
  }
}

export function isValidPolicy(name: string): boolean {
  return Boolean(businessRules.policies[name])
}
