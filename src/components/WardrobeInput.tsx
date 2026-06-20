import { Check, ImagePlus, Loader2, Shirt, Sparkles, X } from 'lucide-react'
import type { WardrobeContext } from '../data/types'

interface Props {
  text: string
  onTextChange: (v: string) => void
  imageCount: number
  onImageCountChange: (n: number) => void
  analyzing: boolean
  result: WardrobeContext | null
  onAnalyze: () => void
}

const MOCK_PHOTOS = ['Black jeans.jpg', 'Trench.jpg', 'White shirt.jpg', 'Navy knit.jpg']

const FORMALITY_LABEL: Record<string, string> = {
  casual: 'Casual',
  'smart-casual': 'Smart-casual',
  'elegant-casual': 'Elegant-casual',
  formal: 'Formal',
}

export function WardrobeInput({
  text,
  onTextChange,
  imageCount,
  onImageCountChange,
  analyzing,
  result,
  onAnalyze,
}: Props) {
  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <p className="section-label">Step 01 · Wardrobe context</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Tell the copilot what you already own
        </h2>
        <p className="mt-3 text-ink-muted">
          Describe your wardrobe or drop in a few photos. A vision + tagging service turns it into a
          structured style profile — palette, key pieces and the gaps worth filling.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Input column */}
        <div className="card flex flex-col p-6">
          <label className="text-sm font-semibold text-ink">Describe your wardrobe</label>
          <textarea
            value={text}
            onChange={(e) => onTextChange(e.target.value)}
            rows={5}
            placeholder="e.g. black jeans, white shirts, beige trench, navy knit, white sneakers…"
            className="mt-2 w-full resize-none rounded-xl border border-sand-200 bg-sand-50/60 px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/10"
          />

          <label className="mt-5 text-sm font-semibold text-ink">Add photos (optional)</label>
          <button
            type="button"
            onClick={() => onImageCountChange(Math.min(imageCount + 1, MOCK_PHOTOS.length))}
            className="mt-2 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-sand-200 bg-sand-50/50 px-4 py-7 text-center transition hover:border-accent hover:bg-accent-soft/40"
          >
            <ImagePlus className="h-6 w-6 text-sand-500" />
            <span className="text-sm font-medium text-ink">Click to add a garment photo</span>
            <span className="text-xs text-ink-muted">Mock upload · no file leaves your machine</span>
          </button>

          {imageCount > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              {MOCK_PHOTOS.slice(0, imageCount).map((p) => (
                <span key={p} className="chip bg-sand-50">
                  <span className="grid h-4 w-4 place-items-center rounded bg-sand-200 text-[9px]">
                    <Shirt className="h-2.5 w-2.5" />
                  </span>
                  {p}
                  <button
                    onClick={() => onImageCountChange(imageCount - 1)}
                    className="ml-0.5 text-sand-500 hover:text-ink"
                    aria-label={`remove ${p}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </span>
              ))}
            </div>
          )}

          <button
            onClick={onAnalyze}
            disabled={analyzing}
            className="btn-primary mt-6 w-full py-3"
          >
            {analyzing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Analyzing wardrobe…
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Analyze wardrobe
              </>
            )}
          </button>
        </div>

        {/* Output column */}
        <div className="min-h-[420px]">
          {analyzing && !result && <WardrobeSkeleton />}
          {!analyzing && !result && <WardrobeEmpty />}
          {result && <WardrobeResult result={result} formalityLabel={FORMALITY_LABEL} />}
        </div>
      </div>
    </div>
  )
}

function WardrobeEmpty() {
  return (
    <div className="card flex h-full flex-col items-center justify-center gap-3 border-dashed p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-sand-100 text-sand-500">
        <Shirt className="h-6 w-6" />
      </span>
      <p className="font-display text-lg text-ink">Wardrobe context will appear here</p>
      <p className="max-w-xs text-sm text-ink-muted">
        Run the analysis to generate a structured style profile from your wardrobe.
      </p>
    </div>
  )
}

function WardrobeSkeleton() {
  return (
    <div className="card h-full space-y-4 p-6">
      <div className="skeleton h-6 w-48" />
      <div className="flex gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton h-8 w-8 rounded-full" />
        ))}
      </div>
      <div className="skeleton h-4 w-full" />
      <div className="skeleton h-4 w-3/4" />
      <div className="grid grid-cols-3 gap-3 pt-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="skeleton h-24" />
        ))}
      </div>
    </div>
  )
}

function WardrobeResult({
  result,
  formalityLabel,
}: {
  result: WardrobeContext
  formalityLabel: Record<string, string>
}) {
  return (
    <div className="card animate-fade-up space-y-5 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-full bg-emerald-100 text-emerald-600">
            <Check className="h-4 w-4" />
          </span>
          <h3 className="font-display text-lg font-semibold text-ink">Wardrobe Context Generated</h3>
        </div>
        <span className="badge bg-accent-soft text-accent">
          {Math.round(result.styleConfidence * 100)}% conf.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Detected style" value={result.detectedStyle} />
        <Stat label="Predominant formality" value={formalityLabel[result.predominantFormality]} />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">
          Frequent colours
        </p>
        <div className="flex flex-wrap gap-2">
          {result.frequentColors.map((c) => (
            <span key={c.name} className="chip bg-sand-50">
              <span
                className="h-3 w-3 rounded-full border border-black/10"
                style={{ backgroundColor: c.hex }}
              />
              {c.name}
            </span>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <PillList label="Key pieces" items={result.keyPieces} tone="ink" />
        <PillList label="Missing pieces" items={result.missingPieces} tone="accent" />
      </div>

      <div>
        <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">
          Detected garments
        </p>
        <div className="grid grid-cols-3 gap-3 sm:grid-cols-3">
          {result.items.map((item) => (
            <div
              key={item.name}
              className="overflow-hidden rounded-xl border border-sand-100 bg-sand-50/60"
            >
              <div className="h-16" style={{ backgroundColor: item.hex }} />
              <div className="p-2">
                <p className="truncate text-xs font-semibold text-ink">{item.name}</p>
                <p className="text-[10px] text-ink-muted">{item.category}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-sand-100 bg-sand-50/60 px-4 py-3">
      <p className="text-xs font-medium uppercase tracking-wide text-sand-500">{label}</p>
      <p className="mt-0.5 font-display text-base font-semibold text-ink">{value}</p>
    </div>
  )
}

function PillList({
  label,
  items,
  tone,
}: {
  label: string
  items: string[]
  tone: 'ink' | 'accent'
}) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">{label}</p>
      <ul className="space-y-1.5">
        {items.map((i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-ink">
            <span
              className={`h-1.5 w-1.5 rounded-full ${
                tone === 'accent' ? 'bg-accent' : 'bg-ink'
              }`}
            />
            {i}
          </li>
        ))}
      </ul>
    </div>
  )
}
