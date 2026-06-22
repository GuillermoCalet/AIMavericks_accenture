import { config } from '../config'

// ---------------------------------------------------------------------------
// LLM provider abstraction.
//
// The rest of the backend depends only on this interface, so tests inject a
// deterministic fake and never call the network. Production can select local
// Ollama or Google's Gemini API without changing the recommendation pipeline.
// ---------------------------------------------------------------------------

export interface LlmImage {
  mimeType: string
  data: Buffer
}

export interface GenerateArgs {
  system?: string
  prompt: string
  images?: LlmImage[]
  /** Task-specific output cap. Structured multi-outfit evaluation needs more than extraction. */
  maxOutputTokens?: number
  /**
   * Selects the local model family for this request. When omitted, requests
   * with images use vision and text-only requests use the faster text model.
   */
  modelRole?: 'text' | 'vision'
}

export interface LlmProvider {
  readonly name: string
  readonly available: boolean
  /** Returns the raw model text (expected to be JSON). Throws on transport errors. */
  generateJson(args: GenerateArgs): Promise<string>
}

export class LlmUnavailableError extends Error {
  code = 'LLM_UNAVAILABLE'
  status = 503
}

/** The model provider rejected the request due to rate limit / quota (HTTP 429). */
export class LlmRateLimitError extends Error {
  code = 'LLM_RATE_LIMITED'
  status = 429
  constructor(
    message: string,
    public retryAfterSeconds?: number,
  ) {
    super(message)
  }
}

/** A transport / API error from the model provider (not a validation problem). */
export class LlmTransportError extends Error {
  code = 'LLM_ERROR'
  status = 502
}

/** Map a raw SDK error to a typed LLM error so the API/UX can react correctly. */
export function classifyProviderError(err: unknown): Error {
  if (err instanceof LlmUnavailableError) return err
  const anyErr = err as { message?: string; status?: number; code?: number }
  const msg = anyErr?.message ?? String(err)
  const status = typeof anyErr?.status === 'number' ? anyErr.status : anyErr?.code
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate[\s_-]?limit|\b429\b/i.test(msg)) {
    const m = msg.match(/retry in ([\d.]+)s/i) ?? msg.match(/retryDelay"?:\s*"?(\d+)/i)
    return new LlmRateLimitError(
      'The AI service is rate-limited or out of quota. Please wait a moment and try again.',
      m ? Math.ceil(Number(m[1])) : undefined,
    )
  }
  return new LlmTransportError(`AI request failed: ${msg.slice(0, 200)}`)
}

/** Strip ```json fences / prose and return the first JSON object/array found. */
export function extractJson(text: string): unknown {
  const trimmed = text.trim().replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim()
  try {
    return JSON.parse(trimmed)
  } catch {
    const match = trimmed.match(/[[{][\s\S]*[\]}]/)
    if (match) return JSON.parse(match[0])
    throw new Error('LLM response was not valid JSON')
  }
}

interface OllamaChatResponse {
  message?: { content?: string }
}

interface GeminiGenerateResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>
    }
  }>
  promptFeedback?: { blockReason?: string }
}

export class OllamaProvider implements LlmProvider {
  readonly name = 'ollama'
  readonly available = true

  async generateJson(args: GenerateArgs): Promise<string> {
    const modelRole = args.modelRole ?? (args.images?.length ? 'vision' : 'text')
    const model =
      modelRole === 'vision' ? config.ollama.visionModel : config.ollama.textModel
    const messages: Array<Record<string, unknown>> = []
    if (args.system) messages.push({ role: 'system', content: args.system })
    messages.push({
      role: 'user',
      content: args.prompt,
      ...(args.images?.length
        ? { images: args.images.map((image) => image.data.toString('base64')) }
        : {}),
    })

    let response: Response
    try {
      response = await fetch(`${config.ollama.url}/api/chat`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        signal: AbortSignal.timeout(config.ollama.timeoutMs),
        body: JSON.stringify({
          model,
          messages,
          stream: false,
          format: 'json',
          think: false,
          keep_alive: config.ollama.keepAlive,
          options: {
            temperature: 0,
            seed: 42,
            num_ctx: config.ollama.numCtx,
            num_predict: args.maxOutputTokens ?? 2048,
          },
        }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/abort|timeout/i.test(message)) {
        throw new LlmTransportError(
          `Ollama timed out after ${config.ollama.timeoutMs} ms while running ${model}.`,
        )
      }
      throw new LlmUnavailableError(
        `Could not reach Ollama at ${config.ollama.url}. Start Ollama and ensure ${model} is installed.`,
      )
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 300)
      if (response.status === 404 || /model.*not found/i.test(detail)) {
        throw new LlmUnavailableError(
          `Ollama model ${model} is unavailable. Run: ollama pull ${model}`,
        )
      }
      throw classifyProviderError({
        status: response.status,
        message: `Ollama HTTP ${response.status}: ${detail}`,
      })
    }

    let result: OllamaChatResponse
    try {
      result = (await response.json()) as OllamaChatResponse
    } catch {
      throw new LlmTransportError('Ollama returned an invalid HTTP response.')
    }
    const content = result.message?.content?.trim()
    if (!content) throw new LlmTransportError('Ollama returned an empty response.')
    return content
  }
}

export class GeminiProvider implements LlmProvider {
  readonly name = 'gemini'
  readonly available = Boolean(config.gemini.apiKey)

  async generateJson(args: GenerateArgs): Promise<string> {
    if (!config.gemini.apiKey) {
      throw new LlmUnavailableError(
        'Gemini is selected but GEMINI_API_KEY is missing. Add it to the backend .env file.',
      )
    }

    const parts: Array<Record<string, unknown>> = [{ text: args.prompt }]
    for (const image of args.images ?? []) {
      parts.push({
        inlineData: {
          mimeType: image.mimeType,
          data: image.data.toString('base64'),
        },
      })
    }

    const endpoint =
      `https://generativelanguage.googleapis.com/v1beta/models/` +
      `${encodeURIComponent(config.gemini.model)}:generateContent`

    let response: Response
    try {
      response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-goog-api-key': config.gemini.apiKey,
        },
        signal: AbortSignal.timeout(config.gemini.timeoutMs),
        body: JSON.stringify({
          ...(args.system
            ? { systemInstruction: { parts: [{ text: args.system }] } }
            : {}),
          contents: [{ role: 'user', parts }],
          generationConfig: {
            temperature: 0,
            candidateCount: 1,
            maxOutputTokens: args.maxOutputTokens ?? 2048,
            responseMimeType: 'application/json',
          },
        }),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      if (/abort|timeout/i.test(message)) {
        throw new LlmTransportError(
          `Gemini timed out after ${config.gemini.timeoutMs} ms while running ${config.gemini.model}.`,
        )
      }
      throw new LlmUnavailableError(`Could not reach the Gemini API: ${message.slice(0, 160)}`)
    }

    if (!response.ok) {
      const detail = (await response.text()).slice(0, 500)
      if (response.status === 401 || response.status === 403) {
        throw new LlmUnavailableError(
          'Gemini rejected the API key or project permissions. Check GEMINI_API_KEY.',
        )
      }
      throw classifyProviderError({
        status: response.status,
        message: `Gemini HTTP ${response.status}: ${detail}`,
      })
    }

    let result: GeminiGenerateResponse
    try {
      result = (await response.json()) as GeminiGenerateResponse
    } catch {
      throw new LlmTransportError('Gemini returned an invalid HTTP response.')
    }

    const content = result.candidates?.[0]?.content?.parts
      ?.map((part) => part.text ?? '')
      .join('')
      .trim()
    if (!content) {
      const blocked = result.promptFeedback?.blockReason
      throw new LlmTransportError(
        blocked
          ? `Gemini blocked the request (${blocked}).`
          : 'Gemini returned an empty response.',
      )
    }
    return content
  }
}

let singleton: LlmProvider | null = null
export function getLlmProvider(): LlmProvider {
  if (!singleton) {
    singleton =
      config.llmProvider === 'gemini' ? new GeminiProvider() : new OllamaProvider()
  }
  return singleton
}
