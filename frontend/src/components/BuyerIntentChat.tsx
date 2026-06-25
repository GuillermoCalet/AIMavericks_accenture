import {
  Bot,
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Loader2,
  Lock,
  Send,
  Sun,
  User,
  X,
} from 'lucide-react'
import type { ComponentType } from 'react'
import type { IntentMetadata } from '@copilot/shared'

interface Props {
  text: string
  onTextChange: (v: string) => void
  recommending: boolean
  canRecommend: boolean
  intent: IntentMetadata | null
  policy: string
  availablePolicies: string[]
  onPolicyChange: (p: string) => void
  onSend: () => void
  onCancel: () => void
  onGoToWardrobe: () => void
}

const POLICY_LABELS: Record<string, string> = {
  balanced: 'Balanced',
  best_quality: 'Best quality',
  budget_conscious: 'Budget conscious',
  minimum_items: 'Minimum items',
  basket_growth: 'Basket growth',
}

export function BuyerIntentChat({
  text,
  onTextChange,
  recommending,
  canRecommend,
  intent,
  policy,
  availablePolicies,
  onPolicyChange,
  onSend,
  onCancel,
  onGoToWardrobe,
}: Props) {
  const locked = !canRecommend

  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <p className="section-label">Step 02 · Buyer intent</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Say what you’re looking for
        </h2>
        <p className="mt-3 text-ink-muted">
          Type the occasion in plain language. The configured AI provider extracts structured metadata, and the
          deterministic engine + OR-Tools solver build the outfit.
        </p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        {/* Chat */}
        <div className="card flex flex-col p-5">
          <div className="flex items-center gap-2 border-b border-sand-100 pb-3">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-ink text-sand-400">
              <Bot className="h-4 w-4" />
            </span>
            <div>
              <p className="text-sm font-semibold text-ink">Fashion Copilot</p>
              <p className="text-[11px] text-emerald-600">● online</p>
            </div>
          </div>

          <div className="flex-1 space-y-4 py-5">
            <Bubble role="assistant">
              Tell me about the occasion, your budget and anything you’d like to reuse — I’ll build a
              complete look from the catalog.
            </Bubble>
            {(recommending || intent) && (
              <Bubble role="user">
                <span className="animate-fade-in">{text}</span>
              </Bubble>
            )}
            {recommending && (
              <Bubble role="assistant">
                <span className="flex items-center gap-2 text-ink-muted">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Extracting intent, filtering the catalog and optimizing with OR-Tools…
                </span>
              </Bubble>
            )}
            {intent && !recommending && (
              <Bubble role="assistant">
                Got it — a <strong>{intent.occasion}</strong>
                {intent.location ? (
                  <>
                    {' '}
                    in <strong>{intent.location}</strong>
                  </>
                ) : null}
                {intent.anchorItems.length ? (
                  <>
                    , reusing your <strong>{intent.anchorItems.join(', ')}</strong>
                  </>
                ) : null}
                . See the optimized outfits below.
              </Bubble>
            )}
          </div>

          {!locked && (
            <div className="mb-2 flex items-center gap-2 border-t border-sand-100 pt-3">
              <label className="text-xs font-semibold uppercase tracking-wide text-sand-500">
                Optimization
              </label>
              <select
                value={policy}
                onChange={(e) => onPolicyChange(e.target.value)}
                disabled={recommending}
                className="rounded-lg border border-sand-200 bg-white px-2.5 py-1.5 text-sm font-medium text-ink outline-none focus:border-accent disabled:opacity-60"
              >
                {availablePolicies.map((p) => (
                  <option key={p} value={p}>
                    {POLICY_LABELS[p] ?? p}
                  </option>
                ))}
              </select>
            </div>
          )}

          {locked ? (
            <button
              onClick={onGoToWardrobe}
              className="flex items-center gap-3 rounded-xl border border-dashed border-sand-300 bg-sand-50/70 px-4 py-3 text-left transition hover:border-accent hover:bg-accent-soft/40"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-sand-100 text-sand-500">
                <Lock className="h-4 w-4" />
              </span>
              <span className="text-sm">
                <span className="font-semibold text-ink">Add your wardrobe first</span>
                <span className="block text-ink-muted">
                  A recommendation needs your wardrobe context to stay consistent — tap to go back.
                </span>
              </span>
            </button>
          ) : (
            <div className="flex items-end gap-2 border-t border-sand-100 pt-3">
              <textarea
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                rows={2}
                disabled={recommending}
                placeholder="e.g. casual dinner in Barcelona, elegant but comfy, reuse my black jeans, under €250…"
                className="flex-1 resize-none rounded-xl border border-sand-200 bg-sand-50/60 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/10 disabled:opacity-70"
              />
              {recommending ? (
                <button onClick={onCancel} className="btn-ghost h-[44px] w-[44px] p-0" aria-label="Cancel">
                  <X className="h-4 w-4" />
                </button>
              ) : (
                <button
                  onClick={onSend}
                  disabled={!text.trim()}
                  className="btn-accent h-[44px] w-[44px] shrink-0 p-0"
                  aria-label="Send"
                >
                  <Send className="h-4 w-4" />
                </button>
              )}
            </div>
          )}
        </div>

        {/* Extracted metadata (real) */}
        <div>
          {!intent && !recommending && <MetadataEmpty />}
          {recommending && !intent && <MetadataSkeleton />}
          {intent && <MetadataPanel meta={intent} />}
        </div>
      </div>
    </div>
  )
}

function Bubble({ role, children }: { role: 'assistant' | 'user'; children: React.ReactNode }) {
  const isUser = role === 'user'
  return (
    <div className={`flex items-start gap-2.5 ${isUser ? 'flex-row-reverse' : ''}`}>
      <span
        className={`grid h-8 w-8 shrink-0 place-items-center rounded-full ${
          isUser ? 'bg-accent text-white' : 'bg-sand-100 text-ink'
        }`}
      >
        {isUser ? <User className="h-4 w-4" /> : <Bot className="h-4 w-4" />}
      </span>
      <div
        className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
          isUser ? 'rounded-tr-sm bg-accent text-white' : 'rounded-tl-sm border border-sand-100 bg-sand-50 text-ink'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

function MetadataEmpty() {
  return (
    <div className="card flex h-full min-h-[360px] flex-col items-center justify-center gap-3 border-dashed p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-sand-100 text-sand-500">
        <Bot className="h-6 w-6" />
      </span>
      <p className="font-display text-lg text-ink">Extracted metadata appears here</p>
      <p className="max-w-xs text-sm text-ink-muted">
        Send your request to see the structured fields the AI model extracts.
      </p>
    </div>
  )
}

function MetadataSkeleton() {
  return (
    <div className="card space-y-3 p-6">
      <div className="skeleton h-5 w-40" />
      {Array.from({ length: 8 }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-3">
          <div className="skeleton h-4 w-24" />
          <div className="skeleton h-4 w-32" />
        </div>
      ))}
    </div>
  )
}

/**
 * Live forecasts produced by the weather enrichment always carry a temperature
 * ("hot, 27°C, clear"), unlike user-typed weather ("cold winter night") or the
 * "unknown" fallback. That marker lets the UI flag the value as live data.
 */
function isLiveForecast(weatherContext: string | null): boolean {
  return !!weatherContext && /-?\d+\s*°c/i.test(weatherContext)
}

/** Pick a weather glyph from the forecast condition keywords. */
function weatherIcon(weatherContext: string): ComponentType<{ className?: string }> {
  const w = weatherContext.toLowerCase()
  if (/thunder/.test(w)) return CloudLightning
  if (/snow/.test(w)) return CloudSnow
  if (/drizzle/.test(w)) return CloudDrizzle
  if (/rain|shower/.test(w)) return CloudRain
  if (/fog/.test(w)) return CloudFog
  if (/cloud/.test(w)) return Cloud
  return Sun
}

function MetadataPanel({ meta }: { meta: IntentMetadata }) {
  const rows: { label: string; value: string; highlight?: boolean }[] = [
    { label: 'occasion', value: meta.occasion },
    { label: 'location', value: meta.location ?? 'unknown' },
    { label: 'weatherContext', value: meta.weatherContext ?? 'unknown' },
    { label: 'desiredStyle', value: meta.desiredStyle },
    {
      label: 'budget',
      value:
        meta.maxBudget != null
          ? `${meta.minBudget != null ? `€${meta.minBudget}–` : '≤ €'}${meta.maxBudget}`
          : meta.budgetLevel,
    },
    { label: 'gender', value: meta.genderPreference ?? 'women', highlight: true },
    { label: 'anchorItems', value: meta.anchorItems.join(', ') || '—', highlight: true },
    { label: 'avoid', value: [...meta.avoidItems, ...meta.avoidColors].join(', ') || '—' },
    { label: 'goal', value: meta.recommendationGoal },
  ]
  return (
    <div className="card animate-fade-up overflow-hidden">
      <div className="flex items-center justify-between border-b border-sand-100 bg-ink px-5 py-3">
        <p className="font-mono text-xs font-semibold text-sand-100">intent_metadata.json</p>
        <span className="badge bg-emerald-500/20 text-emerald-300">AI · structured output</span>
      </div>
      <dl className="divide-y divide-sand-100">
        {rows.map((r) => {
          const live = r.label === 'weatherContext' && isLiveForecast(meta.weatherContext)
          const WeatherGlyph = live ? weatherIcon(meta.weatherContext as string) : null
          return (
            <div
              key={r.label}
              className={`flex items-center justify-between gap-3 px-5 py-2.5 ${r.highlight ? 'bg-accent-soft/50' : ''}`}
            >
              <dt className="font-mono text-xs text-ink-muted">{r.label}</dt>
              <dd
                className={`flex items-center justify-end gap-2 text-right text-sm font-semibold ${
                  r.highlight ? 'text-accent' : 'text-ink'
                }`}
              >
                {WeatherGlyph && <WeatherGlyph className="h-4 w-4 text-sky-500" />}
                <span>{r.value}</span>
                {live && (
                  <span
                    className="badge gap-1 bg-sky-500/15 text-sky-600"
                    title="Live forecast from Open-Meteo"
                  >
                    <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-sky-500" />
                    live
                  </span>
                )}
              </dd>
            </div>
          )
        })}
      </dl>
      {meta.preferredColors.length > 0 && (
        <div className="flex flex-wrap gap-1.5 border-t border-sand-100 px-5 py-3">
          {meta.preferredColors.map((c) => (
            <span key={c} className="chip py-0.5 text-[11px]">
              {c}
            </span>
          ))}
        </div>
      )}
    </div>
  )
}
