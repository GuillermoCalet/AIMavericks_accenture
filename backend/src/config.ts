import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { config as loadEnv } from 'dotenv'
import { z } from 'zod'

// Repo root is two levels up from backend/src/.
export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')

loadEnv({ path: path.join(REPO_ROOT, '.env') })

/** Resolve a possibly-relative path against the repo root for stable cwd-independent paths. */
function resolveFromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p)
}

const EnvSchema = z.object({
  LLM_PROVIDER: z.enum(['ollama', 'gemini']).default('ollama'),
  OLLAMA_URL: z.string().url().default('http://127.0.0.1:11434'),
  // OLLAMA_MODEL is retained as a backwards-compatible single-model fallback.
  OLLAMA_MODEL: z.string().trim().min(1).optional(),
  OLLAMA_TEXT_MODEL: z.string().trim().min(1).optional(),
  OLLAMA_VISION_MODEL: z.string().trim().min(1).optional(),
  OLLAMA_TIMEOUT_MS: z.coerce.number().int().positive().default(300_000),
  OLLAMA_KEEP_ALIVE: z.string().trim().min(1).default('10m'),
  OLLAMA_NUM_CTX: z.coerce.number().int().positive().default(8192),
  GEMINI_API_KEY: z.string().trim().optional(),
  GEMINI_MODEL: z.string().trim().min(1).default('gemini-2.5-flash'),
  GEMINI_TIMEOUT_MS: z.coerce.number().int().positive().default(60_000),
  API_PORT: z.coerce.number().int().positive().default(3001),
  CORS_ORIGINS: z.string().default('http://localhost:5173'),
  MAX_UPLOAD_SIZE_MB: z.coerce.number().positive().default(8),
  SOLVER_URL: z.string().url().default('http://localhost:8000'),
  SOLVER_TIME_LIMIT_S: z.coerce.number().positive().default(5),
  SOLVER_SEED: z.coerce.number().int().default(42),
  CATALOG_CSV_PATH: z.string().default('./Data - Copy.csv'),
  CATALOG_DB_PATH: z.string().default('./data/catalog.duckdb'),
  MAX_CANDIDATES_PER_CATEGORY: z.coerce.number().int().positive().default(20),
  // Local product images named <id>.png (matches the CSV id). Optional.
  PRODUCT_IMAGES_DIR: z.string().default('./Flipkart'),
})

const parsed = EnvSchema.safeParse(process.env)
if (!parsed.success) {
  console.error('❌ Invalid environment configuration:')
  console.error(parsed.error.flatten().fieldErrors)
  throw new Error('Environment validation failed')
}

const env = parsed.data
const legacyOllamaModel = env.OLLAMA_MODEL

export const config = {
  repoRoot: REPO_ROOT,
  llmProvider: env.LLM_PROVIDER,
  ollama: {
    url: env.OLLAMA_URL.replace(/\/+$/, ''),
    textModel: env.OLLAMA_TEXT_MODEL ?? legacyOllamaModel ?? 'llama3.2:3b',
    visionModel: env.OLLAMA_VISION_MODEL ?? legacyOllamaModel ?? 'gemma3:4b',
    timeoutMs: env.OLLAMA_TIMEOUT_MS,
    keepAlive: env.OLLAMA_KEEP_ALIVE,
    numCtx: env.OLLAMA_NUM_CTX,
  },
  gemini: {
    apiKey: env.GEMINI_API_KEY ?? '',
    model: env.GEMINI_MODEL.replace(/^models\//, ''),
    timeoutMs: env.GEMINI_TIMEOUT_MS,
  },
  api: {
    port: env.API_PORT,
    corsOrigins: env.CORS_ORIGINS.split(',').map((s) => s.trim()).filter(Boolean),
    maxUploadBytes: Math.round(env.MAX_UPLOAD_SIZE_MB * 1024 * 1024),
  },
  solver: {
    url: env.SOLVER_URL,
    timeLimitS: env.SOLVER_TIME_LIMIT_S,
    seed: env.SOLVER_SEED,
  },
  catalog: {
    csvPath: resolveFromRoot(env.CATALOG_CSV_PATH),
    dbPath: resolveFromRoot(env.CATALOG_DB_PATH),
    maxCandidatesPerCategory: env.MAX_CANDIDATES_PER_CATEGORY,
  },
  images: {
    dir: resolveFromRoot(env.PRODUCT_IMAGES_DIR),
  },
} as const

/**
 * Documented currency conversion. The source catalog (Data - Copy.csv) prices
 * are in INR; budgets in the product are expressed in EUR. We apply a single,
 * fixed, documented rate so price filtering and budgets are comparable. This is
 * a deterministic transform of real data — not an invented price.
 */
export const INR_TO_EUR = 0.011
export const CURRENCY = '€'
