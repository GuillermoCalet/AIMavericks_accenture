import type {
  ApiError,
  IntentMetadata,
  RecommendationResult,
  WardrobeContext,
} from '@copilot/shared'

const BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3001'

/** Local catalog image served by the backend (named by product id → always correct). */
export function productImageUrl(id: string): string {
  return `${BASE_URL}/api/catalog/image/${encodeURIComponent(id)}`
}

export class ApiRequestError extends Error {
  constructor(
    message: string,
    public code: string,
    public status: number,
  ) {
    super(message)
  }
}

async function handle<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let body: ApiError | null = null
    try {
      body = (await res.json()) as ApiError
    } catch {
      /* ignore */
    }
    throw new ApiRequestError(
      body?.error ?? `Request failed (HTTP ${res.status})`,
      body?.code ?? 'HTTP_ERROR',
      res.status,
    )
  }
  return (await res.json()) as T
}

export interface HealthResponse {
  status: string
  llm: {
    provider: string
    configured: boolean
    model?: string
    textModel?: string
    visionModel?: string
  }
  catalog: { products: number; ready: boolean }
  solver: { url: string }
  policies?: string[]
  defaultPolicy?: string
}

export const api = {
  async health(signal?: AbortSignal): Promise<HealthResponse> {
    return handle<HealthResponse>(await fetch(`${BASE_URL}/api/health`, { signal }))
  },

  async analyzeWardrobe(
    text: string,
    files: File[],
    signal?: AbortSignal,
  ): Promise<WardrobeContext> {
    const form = new FormData()
    form.append('text', text)
    for (const f of files) form.append('images', f)
    return handle<WardrobeContext>(
      await fetch(`${BASE_URL}/api/wardrobe/analyze`, { method: 'POST', body: form, signal }),
    )
  },

  async extractIntent(text: string, signal?: AbortSignal): Promise<IntentMetadata> {
    return handle<IntentMetadata>(
      await fetch(`${BASE_URL}/api/intent/extract`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ text }),
        signal,
      }),
    )
  },

  async recommend(
    payload: {
      intentText?: string
      wardrobeText?: string
      wardrobe?: WardrobeContext | null
      intent?: IntentMetadata | null
      optimizationPolicy?: string
      requestedSizes?: string[]
      maxResults?: number
    },
    signal?: AbortSignal,
  ): Promise<RecommendationResult> {
    return handle<RecommendationResult>(
      await fetch(`${BASE_URL}/api/recommendations`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(payload),
        signal,
      }),
    )
  },
}
