# AI Fashion Copilot 🪄 — real recommender

A **functional** conversational outfit recommender for the Accenture · GenAI Mavericks challenge. It
recommends **real outfits** from the **real catalog** (`Data - Copy.csv`, 62k products) using:

1. A selectable LLM provider: fast cloud **Gemini** for demos, or fully local **Ollama**.
2. With Ollama, wardrobe photos use **Gemma 3 4B** and text tasks use **Llama 3.2 3B**.
3. A **deterministic rules engine** (hard constraints + explainable soft scores).
4. **Google OR-Tools CP-SAT** optimization (Python/FastAPI) to select the best combinations.
5. A final **hybrid ranking**: the selected LLM evaluates every solver-valid outfit, then the backend
   combines 70% deterministic solver score with 30% stylist score.

> The LLM never invents products or bypasses constraints. It (a) turns text/images into structured
> data and (b) chooses only among combinations already validated by the solver. Catalog, prices,
> products and constraints always come from real data and deterministic code.

---

## Architecture

```
                        ┌────────────────────────────────────────────────┐
  React + TS + Vite     │  frontend/  (Tailwind UI, real uploads, errors) │
  (browser)             └───────────────┬────────────────────────────────┘
                                         │ HTTP (JSON / multipart)
                        ┌────────────────▼────────────────────────────────┐
  Node + TS (Express)   │  backend/                                        │
                        │   ├─ Gemini or Ollama multimodal analysis        │
                        │   ├─ provider-independent structured extraction  │
                        │   ├─ DuckDB catalog  (62k real products)         │
                        │   ├─ deterministic rules + filters (hard/soft)   │
                        │   ├─ candidate retrieval (DuckDB + ranking)      │
                        │   ├─ solver client ──────────────┐               │
                        │   └─ hybrid solver + AI post-ranking             │
                        └───────────────────────────────────┼──────────────┘
                                                            │ HTTP
                        ┌───────────────────────────────────▼──────────────┐
  Python + FastAPI      │  solver/  Google OR-Tools CP-SAT                  │
                        │   binary x[i] selection · hard constraints ·      │
                        │   integer objective · multiple outfits · relax    │
                        └───────────────────────────────────────────────────┘

  shared/  — type-only contracts imported by frontend + backend
```

**Pipeline:** `UI → selected LLM provider → DuckDB retrieval → rules engine → CP-SAT solver →
AI evaluates all feasible outfits → deterministic 70/30 hybrid ranking → UI`.

---

## Requirements

- **Node.js ≥ 18** (built on Node 22) and npm.
- **Python 3.10+** (built on 3.12) with `venv`.
- Either **Gemini API** with `GEMINI_API_KEY`, or **Ollama** with `gemma3:4b` and
  `llama3.2:3b` installed.

> The full pipeline runs locally without external AI services, request quotas or API keys.

---

## Quick start

```bash
cp .env.example .env          # optional: defaults already target local Ollama
npm install                   # installs all JS workspaces (incl. native DuckDB)
npm run setup                 # creates the Python venv + installs OR-Tools/FastAPI
npm run catalog:import        # builds data/catalog.duckdb from Data - Copy.csv (~62k rows)
npm run dev                   # starts solver (8000) + backend (3001) + frontend (5173)
```

Open **http://localhost:5173**.

> `npm run dev` runs all three services together. You can also run them separately:
> `npm run dev:solver`, `npm run dev:backend`, `npm run dev:frontend`.

For the fastest demo, configure:

```env
LLM_PROVIDER=gemini
GEMINI_API_KEY=your_backend_only_key
GEMINI_MODEL=gemini-2.5-flash
```

For private, local inference:

```bash
ollama pull gemma3:4b
ollama pull llama3.2:3b
```

```env
LLM_PROVIDER=ollama
OLLAMA_TEXT_MODEL=llama3.2:3b
OLLAMA_VISION_MODEL=gemma3:4b
```

### Environment variables (`.env`)

| Variable | Default | Purpose |
|----------|---------|---------|
| `LLM_PROVIDER` | `ollama` | Active provider: `ollama` or `gemini` |
| `OLLAMA_URL` | `http://127.0.0.1:11434` | Local Ollama API |
| `OLLAMA_TEXT_MODEL` | `llama3.2:3b` | Faster model for intent, text-only wardrobe input and stylist output |
| `OLLAMA_VISION_MODEL` | `gemma3:4b` | Multimodal model used only when wardrobe photos are attached |
| `OLLAMA_MODEL` | unset | Backwards-compatible fallback that uses one model for both roles |
| `OLLAMA_TIMEOUT_MS` | `300000` | Maximum time for one local model call |
| `OLLAMA_NUM_CTX` | `8192` | Context window used by the pipeline |
| `OLLAMA_KEEP_ALIVE` | `10m` | Keep model loaded between pipeline stages |
| `GEMINI_API_KEY` | unset | Backend-only Google AI Studio key |
| `GEMINI_MODEL` | `gemini-2.5-flash` | Gemini model used for text and images |
| `GEMINI_TIMEOUT_MS` | `60000` | Maximum time for one Gemini request |
| `API_PORT` | `3001` | Backend port |
| `CORS_ORIGINS` | `http://localhost:5173` | Allowed CORS origins (restrict in prod) |
| `MAX_UPLOAD_SIZE_MB` | `8` | Max image upload size per file |
| `SOLVER_URL` | `http://localhost:8000` | Where the backend reaches the solver |
| `SOLVER_PORT` | `8000` | Solver port |
| `SOLVER_TIME_LIMIT_S` | `5` | CP-SAT wall-clock limit per request |
| `SOLVER_SEED` | `42` | Deterministic solver seed |
| `CATALOG_CSV_PATH` | `./Data - Copy.csv` | Source catalog CSV |
| `CATALOG_DB_PATH` | `./data/catalog.duckdb` | Generated DuckDB file |
| `MAX_CANDIDATES_PER_CATEGORY` | `20` | Candidates per category sent to the solver |
| `PRODUCT_IMAGES_DIR` | `./Flipkart` | Folder of local product images named `<id>.png` (matches the CSV id) |
| `VITE_API_BASE_URL` | `http://localhost:3001` | Browser → backend base URL (safe, no secret) |

---

## Catalog import

`npm run catalog:import` is **reproducible and idempotent**: it rebuilds `data/catalog.duckdb` from
the CSV each run and reports how many rows were imported vs. discarded.

- DuckDB streams/parses the CSV itself; rows are processed in batches (we never load all 62k rows
  into JS memory at once).
- Prices are normalized (INR → EUR via a single documented rate of `0.011`, see
  `backend/src/config.ts`) and only rows with a valid price + title are kept.
- Each product is enriched **deterministically** (titles, regex, dictionaries — *no LLM*) with:
  `category, subcategory, colors, styleTags, formality, warmth, gender, available, source`.
- Indexes are created on `category`, `price`, `gender`.
- Every product keeps its real `sourceId`, brand, title, prices, url and image, so each
  recommendation traces back to a real CSV row.

Typical output: `imported ≈ 62,146`, `discarded ≈ 51`.

> Optional LLM enrichment of the catalog is intentionally **not** implemented as an automatic
> step (enriching 62k rows at startup would be slow and unnecessary). Deterministic enrichment is the
> source of truth; any future LLM enrichment would be opt-in, batched, cached and resumable.

---

## How the recommendation works

1. **Wardrobe** (`POST /api/wardrobe/analyze`, multipart) — the selected provider analyzes text and
   photos. Ollama routes photos to Gemma and text-only requests to Llama; Gemini uses its configured
   multimodal model. The typed `WardrobeContext` is validated with Zod.
2. **Intent** (`POST /api/intent/extract`) — the selected provider extracts typed metadata
   (occasion, weather *only if mentioned*, budget, anchors and constraints). Validated with Zod.
3. **Retrieval** — DuckDB applies hard SQL filters (available, `price ≤ budget`, gender, category)
   and a relevance ordering (formality + preferred colours). The backend then applies the remaining
   hard rules, scores survivors, and keeps the top *N* per category. Rejections are auditable.
4. **Rules engine** (`backend/src/rules/`) — deterministic, LLM-independent, fully tested. Produces
   the hard constraints for the solver and explainable soft scores
   (`contextFit, styleFit, colorCompatibility, wardrobeCompatibility, complementarity, versatility,
   budgetEfficiency`). Weights/thresholds are centralized in `rules/config.ts`.
5. **Pair compatibility** (`backend/src/rules/pairs.ts`) — a deterministic 0..1 score for every
   co-selectable pair, from colour, formality, style, warmth, category affinity, occasion fit and
   reuse-with-anchor. Only above-threshold, bounded pairs are sent to the solver.
6. **Inventory** (`backend/src/rules/inventory.ts`) — hard stock/size filters with an explicit
   unknown-data policy (the dataset has no stock/size, so values are `unknown`; never invented).
7. **CP-SAT solver** (`solver/`) — see the optimization model below.
8. **Post-solver hybrid ranking** (`backend/src/llm/stylist.ts`) — the selected provider receives the
   typed intent, wardrobe and up to five feasible outfits. It must score every supplied outfit for
   colour harmony, style coherence, occasion fit and wardrobe fit. The backend averages those four
   dimensions and combines them with the normalized solver objective (70% solver / 30% AI in the
   `balanced` policy). The model never declares the winner directly. Missing, duplicated or invented
   outfit/product IDs invalidate the response; solver rank 1 is then preserved.

---

## The optimization model (CP-SAT)

All scores are scaled to integers by `scoreScale` (1000) and prices to cents — CP-SAT is integer-only.

**Variables**

- `x[i] ∈ {0,1}` — product *i* is selected.
- `y[i,j] ∈ {0,1}` — both *i* and *j* selected, linearized: `y ≤ x[i]`, `y ≤ x[j]`, `y ≥ x[i]+x[j]−1`.
  Created only for **coexistable, above-threshold** pairs (bounded by `pairs.maxPairs`).
- `has_c ∈ {0,1}` — required category *c* present (`has_c ≤ Σ members`), for the completeness bonus.

**Objective (maximize, integer)**

```
  Σ x[i]·quality_i                      # weighted soft-preference score
+ Σ y[i,j]·pairScore_ij·pairWeight      # real pairwise compatibility
+ Σ_c completenessBonus·has_c           # outfit completeness
− priceWeight·Σ x[i]·normPrice_i        # cost (do NOT spend the whole budget)
− Σ x[i]·optionalPenalty_i              # discourage unnecessary complements
− complexityPenalty·Σ x[i]             # discourage oversized outfits
− diversityWeight·Σ x[i]·appeared_i     # push alternatives apart
```

The reported `objectiveBreakdown` is recomputed from the same coefficients, so it **equals** the
solver's objective value exactly (asserted in tests).

**Constraint classes** (`config/business-rules.json` → `relaxation`)

- **immutableHard** — never relaxed: explicit user exclusions, forbidden colours, out-of-stock,
  confirmed size mismatch, anchor inclusion, structural category incompatibilities, **single-gender
  coherence** (a resolved target gender + unisex — an outfit never mixes men's and women's items), `budget_max`
  (unless a business rule authorizes it and the outfit is flagged `overBudget`).
- **relaxableHard** — required categories, the minimum number of optional complements.
- **soft** — everything in the objective.

**Progressive relaxation** — the backend tries an explicit, configurable ladder and records every
attempt (`relaxationAttempts`: level, label, relaxed rules, reason, original/relaxed values, solver
status, time). Levels: `0 strict → 1 fewer optional complements → 2 drop relaxable required
categories → 3 widen formality range → 4 lower colour affinity (gender remains fixed) → 5 suggest budget
increase` (never auto-exceeds budget unless `allowOverBudget`). Nothing is relaxed silently; the UI
shows the final level and which rules were relaxed.

**Diversity** — the best outfit maximizes quality; each alternative must keep at least
`diversity.minQualityRatio` of the best quality, share at most `diversity.maxSharedProducts`
non-anchor products with any previous outfit (and never repeat the exact set), and pays a diversity
penalty for reused products. Each alternative reports `sharedProductCount`, `jaccardSimilarity`,
`diversityScore` and `diversityPenalty`.

**Optimization policies** (per request, validated; the frontend only sends a *name*, never weights):
`best_quality`, `balanced` (default), `budget_conscious`, `minimum_items`, `basket_growth`. Each
overrides weights/penalties — e.g. `minimum_items` yields a top + footwear + reused jeans, while
`balanced`/`basket_growth` add coordinated complements.

**Performance** — candidates are capped per category, pairs are pruned + bounded, the run is
deterministic (seed + single worker) and time-limited. The response reports `candidateCount`,
`pairVariableCount`, `constraintCount`, `solveTimeMs` and `solverStatus`.

### Worked example

Intent *“elegant-casual dinner in Barcelona, reuse my black jeans, under €250”*, policy `balanced`:

1. Anchor = black jeans (reused, price 0). Skeleton = required {top, footwear} + optional
   {outerwear, bag, jewellery, accessory}.
2. DuckDB + rules retrieve ~20 candidates/category; inventory rules pass (stock unknown → allowed).
3. ~120 candidates → ~1500 pair `y` variables, ~4500 constraints.
4. CP-SAT returns 3 diverse outfits. #1 = embroidered black top + black shoes + shrug + clutch +
   watch + belt, reusing the jeans, €31.79, with `qualityScore 71211 + pairScore 14294 +
   completeness 4000 − optionalPenalty 42000 − complexity 10500 − price 381 = 36624` (matches the
   objective). Alternatives share **0** purchased products (Jaccard ≈ 0.08).

### No solution?
If even the full relaxation ladder fails, the API returns the conflicting constraints + actionable
suggestions and **no fake outfit** — hard constraints are never silently dropped.

---

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET`  | `/api/health` | Status: LLM configured?, catalog size, solver url |
| `POST` | `/api/wardrobe/analyze` | multipart `text` + `images[]` → `WardrobeContext` |
| `POST` | `/api/intent/extract` | `{ text }` → `IntentMetadata` |
| `POST` | `/api/recommendations` | end-to-end; accepts `intentText`/`wardrobeText` or pre-computed `intent`/`wardrobe` → `RecommendationResult` |
| `GET`  | `/api/catalog/products/:id` | a single real product |
| `GET`  | `/api/catalog/image/:id` | the correct local product image (`Flipkart/<id>.png`); UI falls back to the CDN |

Hardening: Zod input validation, JSON/upload size limits, request timeout to the solver, basic IP
rate limiting (60/min), consistent error envelope (`{ error, code, details }`), CORS allow-list, and
logs that never contain secrets or images.

---

## Tests

```bash
npm test            # backend (Vitest) + solver (Pytest)
npm run test:backend
npm run test:solver
```

- **Vitest** (`backend/test/`): price normalization, category classification (incl. the
  "petticoat ≠ coat" edge), colour extraction, Zod validation + LLM repair/failure + unavailable
  provider, hard rules (budget, anchor, forbidden colours, gender, formality), soft scoring, and a
  **catalog → rules → solver integration** test over the real DuckDB catalog (solver call mocked;
  the solver itself is covered by Pytest).
- **Pytest** (`solver/`): feasible/optimal solving, budget respected, anchor always included,
  one-footwear / ≤-one-bag, excluded pairs, multiple distinct outfits, genuine `INFEASIBLE` (no
  silent relaxation), explicit opt-in relaxation, empty pool, and the FastAPI endpoint.

Tests never call a real model — a deterministic fake provider or mocked Ollama HTTP response is used.

### Build / typecheck

```bash
npm run typecheck   # shared + backend + frontend (strict)
npm run build       # backend strict typecheck + frontend production bundle
```

---

## Privacy of images

Uploaded photos are received in memory only (`multer.memoryStorage`), sent to Ollama on localhost,
and discarded when the request finishes — they are **never written to disk**, sent externally or
logged.

---

## Project layout

```
.
├─ Data - Copy.csv            # source catalog (gitignored)
├─ data/catalog.duckdb        # generated (gitignored)
├─ config/business-rules.json # versioned weights, penalties, policies, relaxation, diversity
├─ shared/                    # type-only contracts
├─ frontend/                  # React + TS + Vite + Tailwind
│  └─ src/{components,hooks,services}
├─ backend/                   # Express + DuckDB + local Ollama + rules
│  ├─ src/businessRules.ts    # loads + validates config/business-rules.json (Zod)
│  ├─ src/rules/{engine,pairs,inventory,config}.ts
│  ├─ src/{catalog,llm,recommend,http}
│  ├─ scripts/importCatalog.ts
│  └─ test/
├─ solver/                    # FastAPI + OR-Tools CP-SAT
│  ├─ app.py models.py solver_core.py test_solver.py
└─ scripts/                   # setup-solver.sh, run-solver.sh, run-pytest.sh
```

### Business configuration

All tunable numbers live in **`config/business-rules.json`** (validated with Zod at backend startup
and Pydantic in the solver request). It defines score weights, the price/optional/complexity
penalties, category maxima and incompatibilities, item bounds, candidate limits, the unknown
stock/size policy, the relaxation ladder, pair/quality/diversity thresholds, hybrid stylist weights
and the named optimization policies. **An invalid config makes the backend fail fast** — there are
no magic numbers scattered through the code.

---

## Known limitations

- The catalog is Indian retail (Flipkart). Prices are converted INR→EUR with a single fixed rate, so
  absolute prices read low; budget logic is correct relative to that rate.
- Category/attribute enrichment is dictionary/regex based — good coverage, but some niche titles fall
  into `other`.
- The selected provider must be available. Gemini is faster but has network/quota considerations;
  Ollama is private and quota-free but may be slow without GPU acceleration. If the provider fails
  during the final stylist stage, solver rank 1 and its deterministic explanation are preserved.
- No Docker is required for local dev. (A `docker-compose.yml` could be added but is optional.)
- **Stock & size are `unknown` for the whole dataset** (the CSV has neither). The contracts,
  filters and unknown-data policy are fully implemented; a real inventory API can populate
  `InventoryAvailability` later (the `availabilitySource` field marks the origin). Nothing is invented.
- Pair compatibility is real and pairwise (`y[i,j]`), but pairs are pruned to above-threshold,
  coexistable candidates and capped (`pairs.maxPairs`) to keep the model bounded.
- Penalty/weight magnitudes are calibrated for this (cheap, INR→EUR) catalog; they are all in
  `config/business-rules.json` and can be retuned per deployment or per policy.
