import {
  AlertTriangle,
  Check,
  Cpu,
  Layers,
  Link2,
  RotateCcw,
  Shirt,
  Shuffle,
  Sparkles,
  Timer,
  TriangleAlert,
  X,
} from 'lucide-react'
import type {
  ObjectiveBreakdown,
  OutfitRecommendation,
  PairCompatibility,
  RecommendationResult,
  RuleResult,
  ScoreBreakdown,
} from '@copilot/shared'
import { ProductCard } from './ProductCard'

interface Props {
  recommendation: RecommendationResult | null
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
          <p className="font-display text-lg text-ink">Your optimized outfits will appear here</p>
          <p className="max-w-sm text-sm text-ink-muted">
            Complete the steps above — or hit “Run full demo” — to see real, solver-built looks.
          </p>
        </div>
      </div>
    )
  }

  const { solver, outfits, infeasibility, policy, stylistSelection } = recommendation
  const displayedOutfits = [...outfits].sort((a, b) => a.hybridRank - b.hybridRank)
  const stylistEvaluationByRank = new Map(
    stylistSelection?.evaluations.map((evaluation) => [evaluation.outfitRank, evaluation]) ?? [],
  )


  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <p className="section-label">Step 03 · Recommendation</p>
          <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
            {outfits.length ? 'Your optimized outfits' : 'No outfit could be built'}
          </h2>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="badge bg-ink text-white">policy · {policy}</span>
            {stylistSelection && (
              <span className="badge bg-violet-100 text-violet-700">
                <Sparkles className="h-3 w-3" />
                {stylistSelection.source === 'hybrid' ? 'solver + AI ranking' : 'solver fallback'} ·
                {' '}solver outfit #{stylistSelection.selectedOutfitRank}
              </span>
            )}
            {solver.relaxed ? (
              <span className="badge bg-amber-100 text-amber-700">
                relaxed · level {solver.relaxationLevel}
              </span>
            ) : (
              <span className="badge bg-emerald-100 text-emerald-700">no relaxation needed</span>
            )}
          </div>
        </div>
        <button onClick={onReset} className="btn-ghost">
          <RotateCcw className="h-4 w-4" />
          New look
        </button>
      </header>

      <SolverMeta solver={solver} />

      {infeasibility && (
        <div className="card mt-6 border-amber-200 bg-amber-50/60 p-6">
          <div className="flex items-center gap-2 text-amber-700">
            <AlertTriangle className="h-5 w-5" />
            <h3 className="font-display text-lg font-semibold">{infeasibility.message}</h3>
          </div>
          {infeasibility.conflictingConstraints.length > 0 && (
            <p className="mt-2 text-sm text-ink-muted">
              Conflicting: <span className="font-mono">{infeasibility.conflictingConstraints.join(', ')}</span>
            </p>
          )}
          <ul className="mt-3 space-y-1.5">
            {infeasibility.suggestions.map((s) => (
              <li key={s} className="flex items-start gap-2 text-sm text-ink">
                <span className="mt-1.5 h-1.5 w-1.5 rounded-full bg-amber-500" />
                {s}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-8 space-y-10">
        {displayedOutfits.map((outfit) => (
          <OutfitBlock
            key={outfit.rank}
            outfit={outfit}
            defaultOpen={outfit.rank === stylistSelection?.selectedOutfitRank}
            stylistPick={outfit.rank === stylistSelection?.selectedOutfitRank}
            stylistEvaluation={stylistEvaluationByRank.get(outfit.rank)}
          />
        ))}
      </div>
    </div>
  )
}

function SolverMeta({ solver }: { solver: RecommendationResult['solver'] }) {
  const items = [
    { label: 'Status', value: solver.status },
    { label: 'Candidates', value: solver.metrics.candidateCount.toLocaleString() },
    { label: 'Pair variables', value: solver.metrics.pairVariableCount.toLocaleString() },
    { label: 'Constraints', value: solver.metrics.constraintCount.toLocaleString() },
    { label: 'Solving time', value: `${solver.metrics.solveTimeMs} ms` },
  ]
  return (
    <div className="card overflow-hidden">
      <div className="flex items-center gap-2 border-b border-sand-100 bg-ink px-5 py-2.5 text-sand-100">
        <Cpu className="h-4 w-4 text-sand-400" />
        <p className="text-sm font-semibold">OR-Tools CP-SAT · real run</p>
        {solver.relaxedRules.length > 0 && (
          <span className="badge ml-auto bg-amber-500/20 text-amber-300">
            relaxed: {solver.relaxedRules.join(', ')}
          </span>
        )}
      </div>
      <div className="grid grid-cols-2 divide-sand-100 sm:grid-cols-5 sm:divide-x">
        {items.map((it) => (
          <div key={it.label} className="px-5 py-3">
            <p className="text-xs font-medium uppercase tracking-wide text-sand-500">{it.label}</p>
            <p className="font-display text-lg font-semibold text-ink">{it.value}</p>
          </div>
        ))}
      </div>
      {solver.relaxationAttempts.length > 1 && (
        <details className="border-t border-sand-100">
          <summary className="cursor-pointer px-5 py-2.5 text-sm font-medium text-ink-muted">
            Relaxation ladder · {solver.relaxationAttempts.length} attempt(s)
          </summary>
          <ul className="space-y-1 px-5 pb-4">
            {solver.relaxationAttempts.map((a) => (
              <li key={a.level} className="flex items-center gap-2 text-xs">
                <span
                  className={`grid h-4 w-4 place-items-center rounded-full ${
                    a.feasible ? 'bg-emerald-100 text-emerald-600' : 'bg-sand-100 text-sand-500'
                  }`}
                >
                  {a.feasible ? <Check className="h-2.5 w-2.5" /> : <X className="h-2.5 w-2.5" />}
                </span>
                <span className="font-mono">L{a.level}</span>
                <span className="font-medium text-ink">{a.label}</span>
                <span className="text-ink-muted">— {a.reason}</span>
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  )
}

function OutfitBlock({
  outfit,
  defaultOpen,
  stylistPick,
  stylistEvaluation,
}: {
  outfit: OutfitRecommendation
  defaultOpen: boolean
  stylistPick: boolean
  stylistEvaluation?: NonNullable<RecommendationResult['stylistSelection']>['evaluations'][number]
}) {
  const reasonFor = (id: string) => outfit.explanation.perItem.find((e) => e.productId === id)?.reason
  const contribFor = (id: string) => outfit.itemContributions.find((c) => c.productId === id)

  return (
    <div className="card overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand-100 px-6 py-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="badge bg-ink text-white">Recommendation #{outfit.hybridRank}</span>
          <span className="text-xs text-ink-muted">solver rank #{outfit.rank}</span>
          <span className="font-display text-xl font-semibold text-ink">
            {outfit.currency}
            {outfit.totalPrice.toFixed(2)}
          </span>
          <span className="text-sm text-ink-muted">to buy · {outfit.products.length} new items</span>
          {outfit.overBudget && (
            <span className="badge bg-amber-100 text-amber-700">
              <TriangleAlert className="h-3 w-3" /> over budget
            </span>
          )}
          {stylistPick && (
            <span className="badge bg-violet-100 text-violet-700">
              <Sparkles className="h-3 w-3" /> stylist pick
            </span>
          )}
          {outfit.diversity && (
            <span className="badge bg-sand-100 text-sand-500">
              <Shuffle className="h-3 w-3" /> {Math.round(outfit.diversity.diversityScore * 100)}% different
            </span>
          )}
        </div>
        <span className="chip">
          <Timer className="h-3.5 w-3.5" />
          {stylistEvaluation
            ? `hybrid ${Math.round(stylistEvaluation.hybridScore * 100)}`
            : `objective ${outfit.objectiveScore.toLocaleString()}`}
        </span>
      </div>

      <div className="p-6">
        <div className="mb-5 rounded-xl border border-sand-100 bg-sand-50/60 p-4">
          <div className="mb-1 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-sand-500" />
            <span className="badge bg-sand-200 text-ink">explanation · {outfit.explanation.source}</span>
          </div>
          <p className="text-sm leading-relaxed text-ink">{outfit.explanation.summary}</p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
          {outfit.products.map((p, i) => (
            <ProductCard
              key={p.id}
              product={p}
              reason={reasonFor(p.id)}
              contribution={contribFor(p.id)}
              badge={i === 0 ? 'Best match' : undefined}
            />
          ))}
        </div>

        {outfit.reusedWardrobeItems.length > 0 && (
          <div className="mt-5">
            <div className="mb-2 flex items-center gap-2">
              <Shirt className="h-4 w-4 text-emerald-600" />
              <p className="section-label text-emerald-600">Reused from your wardrobe · owned</p>
            </div>
            <div className="flex flex-wrap gap-2">
              {outfit.reusedWardrobeItems.map((r, i) => (
                <span key={`${r.name}-${i}`} className="chip border-emerald-200 bg-emerald-50 text-emerald-700">
                  <Check className="h-3.5 w-3.5" /> {r.name} · {r.category}
                </span>
              ))}
            </div>
          </div>
        )}

        <ObjectiveBars breakdown={outfit.objectiveBreakdown} />
        {stylistEvaluation && <StylistScores evaluation={stylistEvaluation} />}
        <ScoreBars breakdown={outfit.scoreBreakdown} />
        <PairList pairs={outfit.pairCompatibilities} />
        <RulesList rules={outfit.rules} defaultOpen={defaultOpen} />
      </div>
    </div>
  )
}

function StylistScores({
  evaluation,
}: {
  evaluation: NonNullable<RecommendationResult['stylistSelection']>['evaluations'][number]
}) {
  const scores = [
    { label: 'Solver', value: evaluation.solverScore },
    ...(evaluation.llmScore === null
      ? []
      : [
          { label: 'AI stylist', value: evaluation.llmScore },
          { label: 'Hybrid', value: evaluation.hybridScore },
        ]),
  ]
  return (
    <div className="mt-5 rounded-xl border border-violet-100 bg-violet-50/40 p-4">
      <div className="mb-3 flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-violet-600" />
        <p className="section-label text-violet-700">Final ranking</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        {scores.map((score) => (
          <div key={score.label}>
            <div className="mb-1 flex justify-between text-xs">
              <span className="font-medium text-ink-muted">{score.label}</span>
              <span className="font-mono text-ink">{Math.round(score.value * 100)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-white">
              <div
                className="h-full rounded-full bg-violet-500"
                style={{ width: `${Math.round(score.value * 100)}%` }}
              />
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-xs leading-relaxed text-ink-muted">{evaluation.reason}</p>
    </div>
  )
}

function ObjectiveBars({ breakdown }: { breakdown: ObjectiveBreakdown }) {
  const positives = [
    { label: 'Quality', value: breakdown.qualityScore },
    { label: 'Pair compatibility', value: breakdown.pairCompatibilityScore },
    { label: 'Completeness bonus', value: breakdown.completenessBonus },
  ]
  const negatives = [
    { label: 'Price penalty', value: breakdown.pricePenalty },
    { label: 'Optional-item penalty', value: breakdown.optionalItemPenalty },
    { label: 'Complexity penalty', value: breakdown.complexityPenalty },
    { label: 'Diversity penalty', value: breakdown.diversityPenalty },
  ]
  return (
    <div className="mt-6 grid gap-4 sm:grid-cols-2">
      <div>
        <p className="section-label mb-2 text-emerald-600">Value (quality vs. price)</p>
        <ul className="space-y-1.5 text-sm">
          {positives.map((p) => (
            <li key={p.label} className="flex items-center justify-between">
              <span className="text-ink-muted">{p.label}</span>
              <span className="font-mono text-emerald-700">+{p.value.toLocaleString()}</span>
            </li>
          ))}
        </ul>
      </div>
      <div>
        <p className="section-label mb-2 text-sand-500">Penalties</p>
        <ul className="space-y-1.5 text-sm">
          {negatives.map((p) => (
            <li key={p.label} className="flex items-center justify-between">
              <span className="text-ink-muted">{p.label}</span>
              <span className="font-mono text-ink">−{p.value.toLocaleString()}</span>
            </li>
          ))}
          <li className="flex items-center justify-between border-t border-sand-100 pt-1.5 font-semibold">
            <span className="text-ink">Final objective</span>
            <span className="font-mono text-ink">{breakdown.finalObjectiveScore.toLocaleString()}</span>
          </li>
        </ul>
      </div>
    </div>
  )
}

const SCORE_LABELS: Record<keyof ScoreBreakdown, string> = {
  contextFit: 'Context fit',
  styleFit: 'Style fit',
  colorCompatibility: 'Colour compatibility',
  wardrobeCompatibility: 'Wardrobe compatibility',
  complementarity: 'Complementarity',
  versatility: 'Versatility',
  budgetEfficiency: 'Budget efficiency',
}

function ScoreBars({ breakdown }: { breakdown: ScoreBreakdown }) {
  const dims = Object.keys(SCORE_LABELS) as (keyof ScoreBreakdown)[]
  return (
    <details className="mt-6 rounded-xl border border-sand-100" open={false}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink">
        <span className="inline-flex items-center gap-2">
          <Layers className="h-4 w-4 text-sand-500" /> Score breakdown (real)
        </span>
      </summary>
      <div className="grid gap-2.5 px-4 pb-4 sm:grid-cols-2">
        {dims.map((dim) => {
          const v = Math.max(0, Math.min(1, breakdown[dim]))
          return (
            <div key={dim} className="flex items-center gap-3">
              <span className="w-44 shrink-0 text-xs font-medium text-ink-muted">{SCORE_LABELS[dim]}</span>
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-sand-100">
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-sand-400" style={{ width: `${Math.round(v * 100)}%` }} />
              </div>
              <span className="w-9 text-right font-mono text-xs text-ink">{Math.round(v * 100)}</span>
            </div>
          )
        })}
      </div>
    </details>
  )
}

function PairList({ pairs }: { pairs: PairCompatibility[] }) {
  if (!pairs.length) return null
  const top = [...pairs].sort((a, b) => b.score - a.score).slice(0, 8)
  return (
    <details className="mt-4 rounded-xl border border-sand-100">
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink">
        <span className="inline-flex items-center gap-2">
          <Link2 className="h-4 w-4 text-sand-500" /> Item compatibility · {pairs.length} active pair(s)
        </span>
      </summary>
      <ul className="space-y-1.5 px-4 pb-4">
        {top.map((p) => (
          <li key={`${p.a}-${p.b}`} className="flex items-center justify-between gap-3 text-xs">
            <span className="text-ink-muted">{p.reason}</span>
            <span className="font-mono font-semibold text-ink">{Math.round(p.score * 100)}</span>
          </li>
        ))}
      </ul>
    </details>
  )
}

function RulesList({ rules, defaultOpen }: { rules: RuleResult[]; defaultOpen: boolean }) {
  const hard = rules.filter((r) => r.type === 'hard')
  const soft = rules.filter((r) => r.type === 'soft')
  const hardPassed = hard.filter((r) => r.passed).length
  return (
    <details className="mt-4 rounded-xl border border-sand-100" open={defaultOpen}>
      <summary className="cursor-pointer list-none px-4 py-3 text-sm font-semibold text-ink">
        <span className="inline-flex items-center gap-2">
          <Check className="h-4 w-4 text-emerald-600" />
          Rules engine · {hardPassed}/{hard.length} hard constraints satisfied
        </span>
      </summary>
      <div className="grid gap-2 px-4 pb-4 sm:grid-cols-2">
        {[...hard, ...soft].map((r) => (
          <div key={r.ruleId} className="flex items-start gap-2 rounded-lg bg-sand-50/60 px-3 py-2">
            <span
              className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full ${
                r.passed ? 'bg-emerald-100 text-emerald-600' : 'bg-red-100 text-red-600'
              }`}
            >
              {r.passed ? <Check className="h-3.5 w-3.5" /> : <X className="h-3.5 w-3.5" />}
            </span>
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">
                {r.label}
                <span className="ml-1 text-[10px] uppercase tracking-wide text-sand-500">{r.type}</span>
              </p>
              <p className="text-xs text-ink-muted">{r.reason}</p>
            </div>
          </div>
        ))}
      </div>
    </details>
  )
}
