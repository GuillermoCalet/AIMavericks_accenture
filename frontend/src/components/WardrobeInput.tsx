import { useRef } from 'react'
import { Check, ImagePlus, Loader2, Shirt, Sparkles, X } from 'lucide-react'
import type { WardrobeContext } from '@copilot/shared'
import type { UploadedImage } from '../hooks/useCopilot'

interface Props {
  text: string
  onTextChange: (v: string) => void
  images: UploadedImage[]
  onAddImages: (files: FileList | File[]) => void
  onRemoveImage: (index: number) => void
  analyzing: boolean
  result: WardrobeContext | null
  onAnalyze: () => void
}

const FORMALITY_LABEL: Record<string, string> = {
  casual: 'Casual',
  'smart-casual': 'Smart-casual',
  'elegant-casual': 'Elegant-casual',
  formal: 'Formal',
}

export function WardrobeInput({
  text,
  onTextChange,
  images,
  onAddImages,
  onRemoveImage,
  analyzing,
  result,
  onAnalyze,
}: Props) {
  const fileInput = useRef<HTMLInputElement>(null)

  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <p className="section-label">Step 01 · Wardrobe context</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Tell the copilot what you already own
        </h2>
        <p className="mt-3 text-ink-muted">
          Describe your wardrobe or add real photos. The configured AI provider analyses them and
          returns a structured style profile.
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
          <input
            ref={fileInput}
            type="file"
            accept="image/*"
            multiple
            className="hidden"
            onChange={(e) => {
              if (e.target.files) onAddImages(e.target.files)
              e.target.value = ''
            }}
          />
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            className="mt-2 flex flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-sand-200 bg-sand-50/50 px-4 py-7 text-center transition hover:border-accent hover:bg-accent-soft/40"
          >
            <ImagePlus className="h-6 w-6 text-sand-500" />
            <span className="text-sm font-medium text-ink">Click to add garment photos</span>
            <span className="text-xs text-ink-muted">
              Sent securely to the backend, analysed in memory, never stored.
            </span>
          </button>

          {images.length > 0 && (
            <div className="mt-3 grid grid-cols-4 gap-2 sm:grid-cols-6">
              {images.map((img, i) => (
                <div key={img.previewUrl} className="group relative aspect-square overflow-hidden rounded-lg border border-sand-200">
                  <img src={img.previewUrl} alt={`upload ${i + 1}`} className="h-full w-full object-cover" />
                  <button
                    onClick={() => onRemoveImage(i)}
                    className="absolute right-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-ink/80 text-white opacity-0 transition group-hover:opacity-100"
                    aria-label={`remove image ${i + 1}`}
                  >
                    <X className="h-3 w-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          <button
            onClick={onAnalyze}
            disabled={analyzing || (!text.trim() && images.length === 0)}
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
          <div key={i} className="skeleton h-20" />
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
          <h3 className="font-display text-lg font-semibold text-ink">Wardrobe context generated</h3>
        </div>
        <span className="badge bg-accent-soft text-accent">
          {Math.round(result.styleConfidence * 100)}% conf.
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Stat label="Detected style" value={result.detectedStyle} />
        <Stat label="Predominant formality" value={formalityLabel[result.predominantFormality] ?? result.predominantFormality} />
      </div>

      {result.frequentColors.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">Frequent colours</p>
          <div className="flex flex-wrap gap-2">
            {result.frequentColors.map((c) => (
              <span key={c.name} className="chip bg-sand-50">
                <span className="h-3 w-3 rounded-full border border-black/10" style={{ backgroundColor: c.hex }} />
                {c.name}
              </span>
            ))}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <PillList label="Key pieces" items={result.keyPieces} tone="ink" />
        <PillList label="Missing pieces" items={result.missingPieces} tone="accent" />
      </div>

      {result.items.length > 0 && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">Detected garments</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {result.items.map((item, i) => (
              <div key={`${item.name}-${i}`} className="rounded-xl border border-sand-100 bg-sand-50/60 p-2.5">
                <p className="truncate text-xs font-semibold text-ink">{item.name}</p>
                <p className="text-[10px] text-ink-muted">
                  {item.category} · {item.color} · {item.formality}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
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

function PillList({ label, items, tone }: { label: string; items: string[]; tone: 'ink' | 'accent' }) {
  return (
    <div>
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-sand-500">{label}</p>
      <ul className="space-y-1.5">
        {items.length === 0 && <li className="text-sm text-ink-muted">—</li>}
        {items.map((i) => (
          <li key={i} className="flex items-center gap-2 text-sm text-ink">
            <span className={`h-1.5 w-1.5 rounded-full ${tone === 'accent' ? 'bg-accent' : 'bg-ink'}`} />
            {i}
          </li>
        ))}
      </ul>
    </div>
  )
}
