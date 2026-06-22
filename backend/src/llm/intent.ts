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

const ALLOWED_CATEGORIES = new Set([
  'top',
  'bottom',
  'dress',
  'outerwear',
  'footwear',
  'bag',
  'jewellery',
  'accessory',
  'ethnic',
  'innerwear',
])

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
  "requestedSizes": string[],
  "genderPreference": "women"|"men"|"unisex"|null
}

Use lowercase for colours and categories. Categories must come from:
top, bottom, dress, outerwear, footwear, bag, jewellery, accessory, ethnic, innerwear.
Only put a category in requiredCategories when the user explicitly requires that category.
Do not list every available category. If none are explicitly required, return [].
Budget language is directional:
- "under", "up to", "maximum", "no more than" => maxBudget
- "over", "at least", "minimum" => minBudget
recommendationGoal must always be a string such as "complete outfit", never null.
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
    modelRole: 'text',
  })

  // Normalize to lowercase for downstream deterministic matching.
  const lower = (xs: string[]) => xs.map((s) => s.toLowerCase().trim()).filter(Boolean)
  const categories = (xs: string[]) => lower(xs).filter((category) => ALLOWED_CATEGORIES.has(category))
  const explicitCategories = categoriesMentionedInText(text)
  const requiredCategories = categories(llm.requiredCategories).filter((category) =>
    explicitCategories.has(category),
  )
  const normalizedBudget = normalizeBudgetDirection(text, llm.minBudget, llm.maxBudget)

  return {
    occasion: llm.occasion,
    location: llm.location,
    weatherContext: llm.weatherContext,
    desiredStyle: llm.desiredStyle,
    budgetLevel: llm.budgetLevel,
    minBudget: normalizedBudget.minBudget,
    maxBudget: normalizedBudget.maxBudget,
    anchorItems: lower(llm.anchorItems),
    avoidItems: lower(llm.avoidItems),
    avoidColors: lower(llm.avoidColors),
    preferredColors: lower(llm.preferredColors),
    requiredCategories,
    optionalCategories: categories(llm.optionalCategories).filter(
      (category) => !requiredCategories.includes(category),
    ),
    recommendationGoal: llm.recommendationGoal,
    sizeConstraints: llm.sizeConstraints,
    requestedSizes: llm.requestedSizes.map((s) => s.trim()).filter(Boolean),
    genderPreference: llm.genderPreference,
  }
}

/**
 * Small local models occasionally reverse min/max budget semantics. The
 * original user text is authoritative, so directional wording corrects only
 * the corresponding bound without inventing a budget.
 */
function normalizeBudgetDirection(
  text: string,
  minBudget: number | null,
  maxBudget: number | null,
): { minBudget: number | null; maxBudget: number | null } {
  const normalized = text.toLowerCase()
  const upperBound = /\b(under|up to|maximum|max|no more than|less than|below|hasta|máximo|menos de)\b/.test(
    normalized,
  )
  const lowerBound = /\b(over|at least|minimum|min|more than|above|al menos|mínimo|más de)\b/.test(
    normalized,
  )
  if (upperBound && !lowerBound && maxBudget === null && minBudget !== null) {
    return { minBudget: null, maxBudget: minBudget }
  }
  if (lowerBound && !upperBound && minBudget === null && maxBudget !== null) {
    return { minBudget: maxBudget, maxBudget: null }
  }
  return { minBudget, maxBudget }
}

/** Only explicit category words may become hard required-category constraints. */
function categoriesMentionedInText(text: string): Set<string> {
  const normalized = text.toLowerCase()
  const aliases: Record<string, RegExp> = {
    top: /\b(top|shirt|blouse|camisole|tee|t-shirt|camisa|blusa|camiseta)\b/,
    bottom: /\b(bottom|trousers|pants|jeans|skirt|shorts|pantal[oó]n|vaqueros|falda)\b/,
    dress: /\b(dress|gown|vestido)\b/,
    outerwear: /\b(outerwear|coat|jacket|blazer|trench|abrigo|chaqueta|americana)\b/,
    footwear: /\b(footwear|shoes|boots|sandals|sneakers|zapatos|botas|sandalias|zapatillas)\b/,
    bag: /\b(bag|handbag|purse|bolso)\b/,
    jewellery: /\b(jewellery|jewelry|earrings|necklace|bracelet|joyer[ií]a|pendientes|collar|pulsera)\b/,
    accessory: /\b(accessory|accessories|scarf|belt|accesorio|accesorios|bufanda|cintur[oó]n)\b/,
    ethnic: /\b(ethnic|saree|lehenga|kurta|étnic[oa])\b/,
    innerwear: /\b(innerwear|underwear|lingerie|ropa interior)\b/,
  }
  return new Set(
    Object.entries(aliases)
      .filter(([, pattern]) => pattern.test(normalized))
      .map(([category]) => category),
  )
}
