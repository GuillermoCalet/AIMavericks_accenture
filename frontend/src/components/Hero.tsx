import { ArrowRight, MessagesSquare, Play, Shirt, Sparkles } from 'lucide-react'

const FLOW = [
  {
    icon: Shirt,
    label: 'Add your wardrobe',
    sub: 'tell us what you already own',
  },
  {
    icon: MessagesSquare,
    label: 'Tell us the occasion',
    sub: 'in your own words',
  },
  {
    icon: Sparkles,
    label: 'Get your look',
    sub: 'a complete, coordinated outfit',
  },
]

interface Props {
  onStart: () => void
  onRunDemo: () => void
  runningDemo: boolean
}

export function Hero({ onStart, onRunDemo, runningDemo }: Props) {
  return (
    <section className="relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-5 pb-16 pt-16 sm:px-8 sm:pt-24">
        <div className="grid items-center gap-12 lg:grid-cols-[1.05fr_0.95fr]">
          {/* Left: copy */}
          <div className="animate-fade-up">
            <span className="chip mb-5 border-sand-300 bg-white/70">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
              Accenture · GenAI Mavericks challenge
            </span>
            <h1 className="font-display text-4xl font-semibold leading-[1.05] text-ink text-balance sm:text-6xl">
              AI Fashion <span className="text-sand-500">Copilot</span>
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-ink-muted text-balance">
              Conversational outfit recommendations powered by{' '}
              <strong className="text-ink">wardrobe context</strong>,{' '}
              <strong className="text-ink">buyer intent</strong> and{' '}
              <strong className="text-ink">logical reasoning</strong> — coordinated to the catalog,
              and explained item by item.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <button onClick={onStart} className="btn-primary px-6 py-3 text-base">
                Start demo
                <ArrowRight className="h-4 w-4" />
              </button>
              <button
                onClick={onRunDemo}
                disabled={runningDemo}
                className="btn-accent px-6 py-3 text-base"
              >
                <Play className="h-4 w-4" />
                {runningDemo ? 'Running…' : 'Run full demo'}
              </button>
            </div>

            <dl className="mt-10 grid max-w-md grid-cols-3 gap-4">
              {[
                { v: 'Higher', l: 'relevance' },
                { v: '+AOV', l: 'basket value' },
                { v: 'Lower', l: 'abandonment' },
              ].map((s) => (
                <div key={s.l} className="rounded-xl border border-sand-100 bg-white/60 px-3 py-3">
                  <dt className="font-display text-xl font-semibold text-ink">{s.v}</dt>
                  <dd className="text-xs font-medium uppercase tracking-wide text-sand-500">
                    {s.l}
                  </dd>
                </div>
              ))}
            </dl>
          </div>

          {/* Right: architecture flow card */}
          <div className="animate-fade-up [animation-delay:120ms]">
            <div className="card relative p-6 sm:p-8">
              <div className="mb-5 flex items-center justify-between">
                <p className="section-label">How it works</p>
                <span className="chip py-0.5">3 simple steps</span>
              </div>

              <div className="space-y-2.5">
                {FLOW.map((step, i) => (
                  <div key={step.label} className="flex items-center gap-3">
                    <div className="flex flex-1 items-center gap-3 rounded-xl border border-sand-100 bg-sand-50/70 px-3.5 py-3">
                      <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-white text-ink shadow-sm">
                        <step.icon className="h-[18px] w-[18px]" />
                      </span>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-ink">{step.label}</p>
                        <p className="truncate text-xs text-ink-muted">{step.sub}</p>
                      </div>
                      <span className="ml-auto font-mono text-[11px] text-sand-400">
                        0{i + 1}
                      </span>
                    </div>
                  </div>
                ))}
              </div>

              <div className="mt-5 flex items-center gap-2 rounded-xl bg-ink px-4 py-3 text-sm text-sand-100">
                <Sparkles className="h-4 w-4 text-sand-400" />
                <span>Built around what you already own — reuse, don’t re-buy.</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
