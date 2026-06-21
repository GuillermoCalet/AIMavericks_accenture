import { z } from 'zod'
import { extractJson, type GenerateArgs, type LlmProvider } from './provider'

export class LlmInvalidOutputError extends Error {
  code = 'LLM_INVALID_OUTPUT'
  status = 502
  constructor(
    message: string,
    public readonly details: unknown,
  ) {
    super(message)
  }
}

/**
 * Call the LLM, parse + validate the JSON against `schema`. Only an actual
 * VALIDATION failure (bad/invalid JSON) triggers exactly ONE controlled repair.
 * Transport/rate-limit/availability errors propagate immediately with their own
 * error code (no wasted second call). Fabricated fallbacks are never used.
 */
export async function generateStructured<T extends z.ZodTypeAny>(
  provider: LlmProvider,
  schema: T,
  args: GenerateArgs,
): Promise<z.infer<T>> {
  // The model call itself: transport errors propagate out of generateStructured.
  const callModel = (repairNote?: string): Promise<string> =>
    provider.generateJson({
      ...args,
      prompt: repairNote ? `${args.prompt}\n\n${repairNote}` : args.prompt,
    })

  const parseValidate = (text: string): z.infer<T> => schema.parse(extractJson(text)) as z.infer<T>

  // First model call — transport errors here bubble up untouched (503/429/502).
  const firstText = await callModel()
  try {
    return parseValidate(firstText)
  } catch (validationErr) {
    // Only reaches here for parse / Zod errors. Attempt one repair.
    const detail =
      validationErr instanceof z.ZodError ? JSON.stringify(validationErr.flatten()) : String(validationErr)
    // A transport/rate-limit error during the repair call propagates untouched.
    const secondText = await callModel(
      `Your previous response was invalid (${detail}). ` +
        `Respond again with ONLY valid minified JSON that satisfies the required schema. ` +
        `Do not include any commentary or markdown.`,
    )
    try {
      return parseValidate(secondText)
    } catch (second) {
      throw new LlmInvalidOutputError(
        'The language model returned data that failed validation twice.',
        second instanceof z.ZodError ? second.flatten() : String(second),
      )
    }
  }
}
