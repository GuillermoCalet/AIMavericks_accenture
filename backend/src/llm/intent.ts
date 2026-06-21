import type { IntentMetadata } from '@copilot/shared'
import type { LlmProvider } from './provider'
import { generateStructured } from './structured'
import { IntentLlmSchema } from './schemas'

export const INTENT_SYSTEM = `You convert a shopper's natural-language request into STRUCTURED JSON
metadata for a deterministic recommender. You extract only what the user states or
clearly implies. You NEVER invent weather or temperature: if the user does not
mention it, weatherContext MUST be null. You NEVER invent a budget the user did not
state. Output strictly valid JSON.`
const SYSTEM = INTENT_SYSTEM

export function buildIntentPrompt(text: string): string {
  return buildPrompt(text)
}

function buildPrompt(text: string): string {
  return `Extract shopping intent from this request and return JSON with this exact shape:
{
  "occasion": string,
  "location": string|null,
  "weatherContext": string|null,        // null unless the user mentions weather/season
  "desiredStyle": string,
  "budgetLevel": "low"|"medium"|"high"|"unknown",
  "minBudget": number|null,             // in EUR, only if stated
  "maxBudget": number|null,             // in EUR, only if stated
  "anchorItems": string[],              // items the user wants to REUSE / keep (e.g. "black jeans")
  "avoidItems": string[],
  "avoidColors": string[],
  "preferredColors": string[],
  "requiredCategories": string[],       // categories that MUST be in the outfit
  "optionalCategories": string[],
  "recommendationGoal": string,
  "sizeConstraints": string|null,
  "genderPreference": "women"|"men"|"unisex"|null
}

Use lowercase for colours and categories. Categories must come from:
top, bottom, dress, outerwear, footwear, bag, jewellery, accessory, ethnic, innerwear.
If the user says "elegant but comfortable for dinner", that is occasion + desiredStyle, not weather.

User request: ${JSON.stringify(text)}`
}

/**
 * Real intent extraction. Replaces the former mockMetadataExtractor().
 */
export async function extractIntent(
  provider: LlmProvider,
  text: string,
): Promise<IntentMetadata> {
  const llm = await generateStructured(provider, IntentLlmSchema, {
    system: SYSTEM,
    prompt: buildPrompt(text),
  })

  // Normalize to lowercase for downstream deterministic matching.
  const lower = (xs: string[]) => xs.map((s) => s.toLowerCase().trim()).filter(Boolean)

  return {
    occasion: llm.occasion,
    location: llm.location,
    weatherContext: llm.weatherContext,
    desiredStyle: llm.desiredStyle,
    budgetLevel: llm.budgetLevel,
    minBudget: llm.minBudget,
    maxBudget: llm.maxBudget,
    anchorItems: lower(llm.anchorItems),
    avoidItems: lower(llm.avoidItems),
    avoidColors: lower(llm.avoidColors),
    preferredColors: lower(llm.preferredColors),
    requiredCategories: lower(llm.requiredCategories),
    optionalCategories: lower(llm.optionalCategories),
    recommendationGoal: llm.recommendationGoal,
    sizeConstraints: llm.sizeConstraints,
    requestedSizes: llm.requestedSizes.map((s) => s.trim()).filter(Boolean),
    genderPreference: llm.genderPreference,
  }
}
