import express, { type Request, type Response, type NextFunction } from 'express'
import cors from 'cors'
import multer from 'multer'
import { rateLimit } from 'express-rate-limit'
import { z } from 'zod'
import { config } from './config'
import { businessRules, OPTIMIZATION_POLICIES } from './businessRules'
import { countProducts, getProductById } from './catalog/db'
import { getLlmProvider } from './llm/provider'
import { analyzeWardrobe } from './llm/wardrobe'
import { extractIntent } from './llm/intent'
import { recommend } from './recommend/orchestrator'
import { errorHandler, HttpError, notFound } from './http/errors'

const app = express()
app.disable('x-powered-by')

app.use(cors({ origin: config.api.corsOrigins, methods: ['GET', 'POST'] }))
app.use(express.json({ limit: '1mb' }))

// Basic rate limiting (per IP).
app.use(
  '/api/',
  rateLimit({ windowMs: 60_000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }),
)

// Minimal request log — never logs bodies, images or secrets.
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now()
  res.on('finish', () => {
    console.log(`${req.method} ${req.path} → ${res.statusCode} (${Date.now() - start}ms)`)
  })
  next()
})

// In-memory uploads only (buffers) — images are never written to disk and are
// discarded as soon as the request completes.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.api.maxUploadBytes, files: 6 },
})

const asyncH =
  (fn: (req: Request, res: Response) => Promise<void>) =>
  (req: Request, res: Response, next: NextFunction) =>
    fn(req, res).catch(next)

// --- health ---------------------------------------------------------------
app.get(
  '/api/health',
  asyncH(async (_req, res) => {
    let catalogCount = -1
    try {
      catalogCount = await countProducts()
    } catch {
      catalogCount = -1
    }
    res.json({
      status: 'ok',
      llm: { provider: getLlmProvider().name, configured: getLlmProvider().available },
      catalog: { products: catalogCount, ready: catalogCount > 0 },
      solver: { url: config.solver.url },
      policies: OPTIMIZATION_POLICIES,
      defaultPolicy: businessRules.defaultPolicy,
    })
  }),
)

// --- wardrobe analysis (multipart: text + images) -------------------------
app.post(
  '/api/wardrobe/analyze',
  upload.array('images', 6),
  asyncH(async (req, res) => {
    const text = typeof req.body?.text === 'string' ? req.body.text : ''
    const files = (req.files as Express.Multer.File[] | undefined) ?? []
    if (!text.trim() && files.length === 0) {
      throw new HttpError(400, 'VALIDATION', 'Provide wardrobe text and/or at least one image.')
    }
    const images = files.map((f) => ({ mimeType: f.mimetype, data: f.buffer }))
    const result = await analyzeWardrobe(getLlmProvider(), { text, images })
    res.json(result)
  }),
)

// --- intent extraction ----------------------------------------------------
const IntentBody = z.object({ text: z.string().min(1, 'text is required') })
app.post(
  '/api/intent/extract',
  asyncH(async (req, res) => {
    const { text } = IntentBody.parse(req.body)
    const result = await extractIntent(getLlmProvider(), text)
    res.json(result)
  }),
)

// --- recommendations (end-to-end, or with pre-computed stages) ------------
const RecommendBody = z
  .object({
    intentText: z.string().optional(),
    wardrobeText: z.string().optional(),
    wardrobe: z.unknown().optional(),
    intent: z.unknown().optional(),
    // The frontend may only choose a NAMED policy — never send raw weights.
    optimizationPolicy: z.string().max(40).optional(),
    requestedSizes: z.array(z.string().max(20)).max(10).optional(),
    maxResults: z.number().int().min(1).max(5).optional(),
  })
  .refine((d) => Boolean(d.intentText?.trim()) || Boolean(d.intent), {
    message: 'Provide intentText or a pre-extracted intent.',
  })
app.post(
  '/api/recommendations',
  asyncH(async (req, res) => {
    const body = RecommendBody.parse(req.body)
    const result = await recommend({
      provider: getLlmProvider(),
      intentText: body.intentText,
      wardrobeText: body.wardrobeText,
      // Pre-computed stages are produced by our own endpoints; passed through.
      wardrobe: (body.wardrobe as never) ?? null,
      intent: (body.intent as never) ?? null,
      optimizationPolicy: body.optimizationPolicy,
      requestedSizes: body.requestedSizes,
      maxResults: body.maxResults,
    })
    res.json(result)
  }),
)

// --- local product image (named <id>.png, guaranteed to match the product) -
app.get('/api/catalog/image/:id', (req: Request, res: Response) => {
  const match = req.params.id.match(/(\d+)/) // accepts "cat-123" or "123"
  if (!match) {
    res.status(400).json({ error: 'Invalid id', code: 'VALIDATION' })
    return
  }
  res.sendFile(
    `${match[1]}.png`,
    { root: config.images.dir, maxAge: '7d', dotfiles: 'deny' },
    (err) => {
      if (err && !res.headersSent) res.status(404).json({ error: 'Image not found', code: 'NOT_FOUND' })
    },
  )
})

// --- single product lookup ------------------------------------------------
app.get(
  '/api/catalog/products/:id',
  asyncH(async (req, res) => {
    const product = await getProductById(req.params.id)
    if (!product) throw new HttpError(404, 'NOT_FOUND', `Product ${req.params.id} not found`)
    res.json(product)
  }),
)

app.use(notFound)
app.use(errorHandler)

// Start listening only when run as the server (not when imported by tests).
if (process.env.NODE_ENV !== 'test') {
  const port = config.api.port
  app.listen(port, () => {
    console.log(`\n🚀 AI Fashion Copilot API on http://localhost:${port}`)
    console.log(`   LLM provider:   ${getLlmProvider().name} (${config.ollama.model})`)
    console.log(`   Solver URL:     ${config.solver.url}`)
  })
}

export { app }
