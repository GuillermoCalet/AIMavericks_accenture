import {
  CloudSun,
  Heart,
  Palette,
  RotateCcw,
  Shirt,
  Sparkles,
  TrendingUp,
} from 'lucide-react'
import type { Recommendation } from '../data/types'
import { ProductCard } from './ProductCard'

interface Props {
  recommendation: Recommendation | null
  onReset: () => void
}

export function RecommendationResults({ recommendation, onReset }: Props) {
  if (!recommendation) {
    return (
      <div className="mx-auto max-w-7xl px-5 sm:px-8">
        <div className="card flex min-h-[300px] flex-col items-center justify-center gap-3 border-dashed p-10 text-center">
          <span className="grid h-12 w-12 place-items-center rounded-full bg-sand-100 text-sand-500">
            <Sparkles className="h-6 w-6" />
          </span>
          <p className="font-display text-lg text-ink">Your recommended outfit will appear here</p>
          <p className="max-w-sm text-sm text-ink-muted">
            Complete the steps above — or hit “Run full demo” — to see the final, explained look.
          </p>
        </div>
      </div>
    )
  }

  const rec = recommendation

  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="section-label">Step 04 · Recommendation</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
            {rec.outfitName}
          </h2>
          <p className="mt-3 text-ink-muted">{rec.explanation}</p>
        </div>
        <button onClick={onReset} className="btn-ghost">
          <RotateCcw className="h-4 w-4" />
          New look
        </button>
      </header>

      {/* Metrics strip */}
      <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {rec.metrics.map((m) => (
          <div key={m.label} className="card flex flex-col gap-0.5 p-4">
            <span className="text-xs font-medium uppercase tracking-wide text-sand-500">
              {m.label}
            </span>
            <span className="font-display text-2xl font-semibold text-ink">{m.value}</span>
            <span className="flex items-center gap-1 text-xs font-medium text-emerald-600">
              <TrendingUp className="h-3 w-3" />
              {m.delta}
            </span>
          </div>
        ))}
      </div>

      {/* Outfit grid */}
      <div className="grid gap-6 lg:grid-cols-[1fr_2fr]">
        {/* Hero piece */}
        <div className="lg:row-span-1">
          <div className="mb-3 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sand-500" />
            <p className="section-label">Hero piece</p>
          </div>
          <ProductCard product={rec.hero} featured />
        </div>

        {/* Complements + reuse */}
        <div>
          <div className="mb-3 flex items-center gap-2">
            <Heart className="h-4 w-4 text-sand-500" />
            <p className="section-label">Coordinated complements</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {rec.complements.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>

          <div className="mb-3 mt-6 flex items-center gap-2">
            <Shirt className="h-4 w-4 text-emerald-600" />
            <p className="section-label text-emerald-600">Reused from wardrobe</p>
          </div>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
            {rec.reused.map((p) => (
              <ProductCard key={p.id} product={p} />
            ))}
          </div>
        </div>
      </div>

      {/* Why this works */}
      <div className="mt-12">
        <h3 className="mb-5 font-display text-2xl font-semibold text-ink">
          Why this recommendation works
        </h3>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <RationaleCard
            icon={CloudSun}
            title="Context fit"
            body={rec.rationale.contextFit}
            tone="accent"
          />
          <RationaleCard
            icon={Palette}
            title="Style fit"
            body={rec.rationale.styleFit}
            tone="sand"
          />
          <RationaleCard
            icon={Shirt}
            title="Wardrobe compatibility"
            body={rec.rationale.wardrobeCompatibility}
            tone="emerald"
          />
          <RationaleCard
            icon={TrendingUp}
            title="Business value / AOV uplift"
            body={rec.rationale.businessValue}
            tone="ink"
          />
        </div>
      </div>
    </div>
  )
}

const TONES = {
  accent: 'bg-accent-soft text-accent',
  sand: 'bg-sand-100 text-sand-500',
  emerald: 'bg-emerald-100 text-emerald-600',
  ink: 'bg-ink text-sand-400',
}

function RationaleCard({
  icon: Icon,
  title,
  body,
  tone,
}: {
  icon: typeof CloudSun
  title: string
  body: string
  tone: keyof typeof TONES
}) {
  return (
    <div className="card flex flex-col gap-3 p-5">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${TONES[tone]}`}>
        <Icon className="h-5 w-5" />
      </span>
      <h4 className="font-display text-base font-semibold text-ink">{title}</h4>
      <p className="text-sm leading-relaxed text-ink-muted">{body}</p>
    </div>
  )
}
