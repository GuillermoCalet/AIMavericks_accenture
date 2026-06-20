# AI Fashion Copilot 🪄

**Conversational outfit recommendations powered by wardrobe context, buyer intent and logical reasoning.**

A demo-ready prototype built for the **Accenture · GenAI Mavericks** challenge. It shows how a
provider-agnostic GenAI pipeline would interpret a shopper's wardrobe, occasion, weather, budget and
style to recommend coordinated outfits from a retailer catalog — and *explain why* each item was
chosen.

> ⚠️ This is a **visual prototype for a demo / video**, not a production system. Every service is
> mocked but cleanly structured so it could be re-pointed at real APIs without touching the UI.

---

## ✨ What it shows

A single, smooth, scroll-through experience built around a **clean shopper journey** — the AI
complexity is deliberately hidden:

1. **Hero / Landing** — the value proposition and a simple, 3-step "how it works".
2. **Wardrobe input** — type your garments and/or "upload" photos → a structured **wardrobe context**
   (style, palette, key pieces, gaps, formality). **This step is mandatory** (see below).
3. **Buyer intent chat** — say what you need in natural language. The shopper just talks; nothing
   technical is shown.
4. **Styling** — a single elegant loader ("Styling your look…"). All the reasoning — metadata
   extraction, constraint solving, ranking — happens **invisibly** behind it.
5. **Recommendation** — the final outfit: hero piece, coordinated complements, the **reused wardrobe
   item**, per-item rationale, and a **business-impact** strip (relevance, AOV, abandonment).

### Two product rules baked into the UX

- **🙈 The shopper never sees the machinery.** No LLM metadata, no CSV, no SAT-solver internals are
  surfaced in the app. To the shopper it just feels like magic. (The architecture below is for *you*
  and the jury — it lives in this README, not in the product.)
- **🔒 Wardrobe is required before any recommendation.** The chat stays locked until the wardrobe has
  been analyzed, because a recommendation without wardrobe context would be inconsistent. "Run full
  demo" honours the same rule by always analyzing the wardrobe first.

---

## 🚀 Getting started

Requirements: **Node ≥ 18** (built and tested on Node 22) and npm.

```bash
# 1. install
npm install

# 2. run the dev server (opens http://localhost:5173 automatically)
npm run dev
```

Other scripts:

```bash
npm run build     # type-check + production build into dist/
npm run preview   # serve the production build locally
```

---

## 🎬 Demo mode (for recording the video)

The single most important control for the video is the **“Run full demo”** button (top-right nav and
hero). It orchestrates the entire flow automatically — **no typing required**, using sensible default
inputs:

> `wardrobe analysis → metadata extraction → solver → recommendation`

It auto-scrolls section by section, triggers each loading state, and lands on the final outfit. Press
**“Reset”** (or “New look”) to return to a clean slate between takes.

You can also drive it **manually**:
- *Analyze wardrobe* → generates the wardrobe context.
- Send the pre-filled chat message → extracts metadata, then runs the solver + recommender.

### 60–90 second demo script

| Time | On screen | What to say |
|------|-----------|-------------|
| 0:00–0:10 | **Hero** | "Shoppers want personalised, contextual outfits. This is **AI Fashion Copilot** — wardrobe + intent in, a complete look out." Click **Run full demo**. |
| 0:10–0:30 | **Wardrobe** panel fills | "First — and this is required — we capture what the shopper *already owns*: style, palette, key pieces and the **gaps** worth filling. No wardrobe, no recommendation." |
| 0:30–0:45 | **Intent chat** | "The shopper just *talks*: ‘casual dinner in Barcelona, elegant but comfortable, reuse my black jeans.’ That’s the whole interaction — clean and conversational." |
| 0:45–0:55 | **‘Styling your look…’ loader** | "Behind this one screen, the system extracts intent, applies styling constraints and ranks the catalog — but the shopper never sees any of that complexity." |
| 0:55–1:30 | **Recommendation** | "Out comes the look: a beige blazer over the shopper’s **own black jeans**, plus coordinated complements — each with a reason. Business impact: **higher relevance, +38% basket value, less abandonment.**" |

> 💡 The reasoning architecture (LLM → solver → recommender) is intentionally **invisible in the
> product**. If you want to talk the jury through it, use the diagram in the next section — it’s your
> speaker note, not something the shopper ever sees.

---

## 🧱 Simulated architecture

Under the hood there *is* a full pipeline — it simply runs **invisibly**, behind the single "Styling
your look…" loader. The UI is wired to a clean **mock service layer** that mirrors the real
contracts. Swapping mocks for real endpoints means changing only the function bodies in
`src/services/mockApi.ts` — components stay untouched.

```
 ┌────────────┐   ┌──────────────────┐   ┌────────────────────┐
 │  UI (React)│──▶│ Wardrobe API     │──▶│ LLM metadata        │
 │  inputs    │   │ (vision+tagging) │   │ extraction (Claude) │
 └────────────┘   └──────────────────┘   └─────────┬──────────┘
                                                     │ typed metadata (1-row CSV)
                                                     ▼
 ┌────────────┐   ┌──────────────────┐   ┌────────────────────┐
 │ UI explains│◀──│ Recommender API  │◀──│ Rules / SAT solver  │
 │ the outfit │   │ (ranking)        │   │ (constraint filter) │
 └────────────┘   └──────────────────┘   └────────────────────┘
```

| Mock service | Stands in for | File |
|--------------|---------------|------|
| `mockWardrobeAnalyzer()` | Vision + garment-tagging API | `src/services/mockApi.ts` |
| `mockMetadataExtractor()` | LLM structured-output call | `src/services/mockApi.ts` |
| `mockRuleSolver()` | Rules engine / SAT / CLIPS | `src/services/mockApi.ts` |
| `mockRecommendationAPI()` | Catalog ranking service | `src/services/mockApi.ts` |

Each mock resolves hardcoded data (in `src/data/`) after a small `delay()` so loading states feel
real on camera.

### Project structure

```
src/
├─ App.tsx                  # composes the sections, wires the flow
├─ hooks/
│  └─ useCopilot.ts         # single orchestrator: wardrobe gate, invisible reasoning, demo
├─ services/
│  └─ mockApi.ts            # the 4 mock services + delay()
├─ data/
│  ├─ types.ts              # shared domain contracts
│  ├─ catalog.ts            # curated products (real catalog images)
│  └─ mockData.ts           # wardrobe ctx, metadata, stages, constraints, result
└─ components/              # Hero, WardrobeInput, BuyerIntentChat (styling loader),
                            # RecommendationResults, …
```

### A note on the catalog data

The recommended products are a **real slice of the challenge dataset** (62k Flipkart SKUs), including
their live CDN images, so the demo feels authentic. Prices are shown in a EUR-style figure for a
European audience. If an image can't load (e.g. recording offline), the card falls back to a tasteful
on-brand placeholder — the prototype always looks finished.

---

## 🎨 Design

Premium fashion-tech: light background, sand / ink / blue accents, soft shadows, serif display type
(*Fraunces*) over *Inter*, with chips, badges, skeleton loaders and animated progress steps. Built
with **React + TypeScript + Vite + Tailwind CSS**.

---

## 🧭 Why this wins the brief

- **Combines all the moving parts** the challenge asks for — wardrobe context + chat + LLM metadata +
  rule/SAT reasoning + recommender API — but runs them **invisibly** for a frictionless shopper UX.
- **Explainable where it counts**: the *outfit* is fully justified (per-item reasons + business
  value), without leaking technical internals to the shopper.
- **Consistent by design**: a recommendation can’t be produced without wardrobe context first.
- **Business-oriented**: relevance, AOV uplift and reduced abandonment are front and centre.
- **Provider-agnostic & extensible**: a clean mock boundary makes "swap any vendor" a one-file change.
```
