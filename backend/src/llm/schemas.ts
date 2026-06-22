import { z } from 'zod'

// ---------------------------------------------------------------------------
// Zod schemas validating the *raw* LLM output. Strict enough to reject
// hallucinated shapes, lenient enough to accept reasonable variation. Backend
// code transforms these into the shared contracts after validation.
// ---------------------------------------------------------------------------

export const FormalityEnum = z.enum(['casual', 'smart-casual', 'elegant-casual', 'formal'])
export const WarmthEnum = z.enum(['light', 'medium', 'warm'])
export const GenderEnum = z.enum(['women', 'men', 'unisex'])

export const WardrobeItemLlmSchema = z.object({
  name: z.string().min(1),
  category: z.string().min(1),
  subcategory: z.string().nullable().optional().default(null),
  color: z.string().min(1),
  secondaryColors: z.array(z.string()).optional().default([]),
  formality: FormalityEnum.catch('smart-casual'),
  warmth: WarmthEnum.catch('medium'),
  styleTags: z.array(z.string()).optional().default([]),
})

export const WardrobeLlmSchema = z.object({
  detectedStyle: z.string().min(1),
  styleConfidence: z.number().min(0).max(1).catch(0.7),
  frequentColors: z.array(z.string()).default([]),
  keyPieces: z.array(z.string()).default([]),
  missingPieces: z.array(z.string()).default([]),
  predominantFormality: FormalityEnum.catch('smart-casual'),
  items: z.array(WardrobeItemLlmSchema).min(1),
})
export type WardrobeLlm = z.infer<typeof WardrobeLlmSchema>

export const BudgetLevelEnum = z.enum(['low', 'medium', 'high', 'unknown'])

export const IntentLlmSchema = z.object({
  occasion: z.string().min(1),
  location: z.string().nullable().default(null),
  weatherContext: z.string().nullable().default(null),
  desiredStyle: z.preprocess((value) => value ?? 'versatile', z.string()),
  budgetLevel: BudgetLevelEnum.catch('unknown'),
  minBudget: z.number().nullable().default(null),
  maxBudget: z.number().nullable().default(null),
  anchorItems: z.array(z.string()).default([]),
  avoidItems: z.array(z.string()).default([]),
  avoidColors: z.array(z.string()).default([]),
  preferredColors: z.array(z.string()).default([]),
  requiredCategories: z.array(z.string()).default([]),
  optionalCategories: z.array(z.string()).default([]),
  recommendationGoal: z.preprocess((value) => value ?? 'complete outfit', z.string()),
  sizeConstraints: z.string().nullable().default(null),
  requestedSizes: z.array(z.string()).default([]),
  genderPreference: GenderEnum.nullable().default(null),
})
export type IntentLlm = z.infer<typeof IntentLlmSchema>

export const ExplanationLlmSchema = z.object({
  summary: z.string().min(1),
  perItem: z
    .array(z.object({ productId: z.string().min(1), reason: z.string().min(1) }))
    .default([]),
})
export type ExplanationLlm = z.infer<typeof ExplanationLlmSchema>

const StylistScore = z.number().min(0).max(1)

export const StylistSelectionLlmSchema = z.object({
  evaluations: z.array(
    z.object({
      outfitId: z.string().min(1),
      colorHarmony: StylistScore,
      styleCoherence: StylistScore,
      occasionFit: StylistScore,
      wardrobeFit: StylistScore,
      reason: z.string().min(1),
      summary: z.string().min(1),
      perItem: z
        .array(z.object({ productId: z.string().min(1), reason: z.string().min(1) }))
        .default([]),
    }),
  ).min(1),
})
export type StylistSelectionLlm = z.infer<typeof StylistSelectionLlmSchema>
