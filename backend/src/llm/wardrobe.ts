import type { WardrobeContext } from '@copilot/shared'
import { colorHex } from '../util/colors'
import type { LlmImage, LlmProvider } from './provider'
import { generateStructured } from './structured'
import { WardrobeLlmSchema } from './schemas'

const SYSTEM = `You are a precise fashion cataloguer. You convert a person's wardrobe
(free text and/or photos) into STRUCTURED JSON. You never invent garments that are
not described or visible. You only describe what is present. Output strictly valid JSON.`

function buildPrompt(text: string, imageCount: number): string {
  return `Analyse this wardrobe and return JSON with this exact shape:
{
  "detectedStyle": string,            // e.g. "Minimal smart-casual"
  "styleConfidence": number,          // 0..1
  "frequentColors": string[],         // lowercase colour names, most frequent first
  "keyPieces": string[],              // notable garments the person owns
  "missingPieces": string[],          // useful gaps to complete outfits
  "predominantFormality": "casual"|"smart-casual"|"elegant-casual"|"formal",
  "items": [{
    "name": string,
    "category": string,               // top|bottom|dress|outerwear|footwear|bag|jewellery|accessory|ethnic|innerwear|other
    "subcategory": string|null,
    "color": string,                  // primary colour, lowercase
    "secondaryColors": string[],
    "formality": "casual"|"smart-casual"|"elegant-casual"|"formal",
    "warmth": "light"|"medium"|"warm",
    "styleTags": string[]
  }]
}

Wardrobe description (text): ${text ? JSON.stringify(text) : '(none provided)'}
Number of attached photos: ${imageCount}

Base every item ONLY on the description and photos. Do not fabricate items.`
}

/**
 * Real wardrobe analysis. Replaces the former mockWardrobeAnalyzer().
 * Validates the LLM output with Zod (with one repair retry inside).
 */
export async function analyzeWardrobe(
  provider: LlmProvider,
  input: { text: string; images: LlmImage[] },
): Promise<WardrobeContext> {
  const llm = await generateStructured(provider, WardrobeLlmSchema, {
    system: SYSTEM,
    prompt: buildPrompt(input.text, input.images.length),
    images: input.images,
  })

  return {
    detectedStyle: llm.detectedStyle,
    styleConfidence: llm.styleConfidence,
    frequentColors: llm.frequentColors.map((name) => ({ name, hex: colorHex(name) })),
    keyPieces: llm.keyPieces,
    missingPieces: llm.missingPieces,
    predominantFormality: llm.predominantFormality,
    items: llm.items.map((it) => ({
      name: it.name,
      category: it.category,
      subcategory: it.subcategory ?? null,
      color: it.color,
      secondaryColors: it.secondaryColors,
      formality: it.formality,
      warmth: it.warmth,
      styleTags: it.styleTags,
    })),
  }
}
