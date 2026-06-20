import { useEffect, useState } from 'react'
import { ArrowUp, Bot, CheckCircle2, Lock, Send, Sparkles, User } from 'lucide-react'

interface Props {
  text: string
  onTextChange: (v: string) => void
  curating: boolean
  canRecommend: boolean
  hasResult: boolean
  onSend: () => void
  onGoToWardrobe: () => void
}

export function BuyerIntentChat({
  text,
  onTextChange,
  curating,
  canRecommend,
  hasResult,
  onSend,
  onGoToWardrobe,
}: Props) {
  const sent = curating || hasResult
  const locked = !canRecommend

  return (
    <div className="mx-auto max-w-7xl px-5 sm:px-8">
      <header className="mb-8 max-w-2xl">
        <p className="section-label">Step 02 · What you’re looking for</p>
        <h2 className="mt-2 font-display text-3xl font-semibold text-ink sm:text-4xl">
          Just say what you need
        </h2>
        <p className="mt-3 text-ink-muted">
          Describe the occasion in your own words — the copilot handles the rest and comes back with a
          complete, coordinated look.
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
              Hi! Tell me about the occasion and anything you’d like to reuse, and I’ll put a look
              together for you.
            </Bubble>

            {sent && (
              <Bubble role="user">
                <span className="animate-fade-in">{text}</span>
              </Bubble>
            )}

            {curating && (
              <Bubble role="assistant">
                <span className="text-ink-muted">On it — styling your look now…</span>
              </Bubble>
            )}

            {hasResult && (
              <Bubble role="assistant">
                Done! I’ve put together a complete look for you — take a look just below. 👗
              </Bubble>
            )}
          </div>

          {/* Composer / lock */}
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
                  We need your wardrobe to give a consistent recommendation — tap to go back.
                </span>
              </span>
              <ArrowUp className="ml-auto h-4 w-4 text-sand-500" />
            </button>
          ) : (
            <div className="flex items-end gap-2 border-t border-sand-100 pt-3">
              <textarea
                value={text}
                onChange={(e) => onTextChange(e.target.value)}
                rows={2}
                disabled={sent}
                placeholder="e.g. casual dinner this Saturday in Barcelona, elegant but comfy, reuse my black jeans…"
                className="flex-1 resize-none rounded-xl border border-sand-200 bg-sand-50/60 px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-accent focus:bg-white focus:ring-4 focus:ring-accent/10 disabled:opacity-70"
              />
              <button
                onClick={onSend}
                disabled={sent || !text.trim()}
                className="btn-accent h-[44px] w-[44px] shrink-0 p-0"
                aria-label="Send message"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          )}
        </div>

        {/* Right column: status / styling loader */}
        <div>
          {locked && <LockedHint onGoToWardrobe={onGoToWardrobe} />}
          {!locked && curating && <StylingLoader />}
          {!locked && !curating && hasResult && <ReadyHint />}
          {!locked && !curating && !hasResult && <PromptHint />}
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
          isUser
            ? 'rounded-tr-sm bg-accent text-white'
            : 'rounded-tl-sm border border-sand-100 bg-sand-50 text-ink'
        }`}
      >
        {children}
      </div>
    </div>
  )
}

/** Friendly, non-technical progress copy — never exposes how it works. */
const STYLING_STEPS = [
  'Understanding your request',
  'Looking through your wardrobe',
  'Coordinating colours & pieces',
  'Adding the finishing touches',
]

function StylingLoader() {
  const [step, setStep] = useState(0)
  useEffect(() => {
    const t = setInterval(() => setStep((s) => Math.min(s + 1, STYLING_STEPS.length - 1)), 1200)
    return () => clearInterval(t)
  }, [])

  return (
    <div className="card flex h-full min-h-[360px] flex-col items-center justify-center gap-6 p-8 text-center">
      <div className="relative grid h-20 w-20 place-items-center">
        <span className="absolute inset-0 rounded-full border-2 border-accent/20" />
        <span className="absolute inset-0 animate-spin rounded-full border-2 border-transparent border-t-accent" />
        <Sparkles className="h-8 w-8 text-accent" />
      </div>
      <div>
        <p className="font-display text-xl font-semibold text-ink">Styling your look…</p>
        <p className="mt-1 text-sm text-ink-muted">This usually takes a few seconds.</p>
      </div>
      <ul className="w-full max-w-xs space-y-2 text-left">
        {STYLING_STEPS.map((label, i) => (
          <li
            key={label}
            className={`flex items-center gap-2.5 text-sm transition-all duration-300 ${
              i <= step ? 'text-ink' : 'text-sand-400'
            }`}
          >
            <span
              className={`grid h-5 w-5 shrink-0 place-items-center rounded-full transition-colors ${
                i < step
                  ? 'bg-emerald-100 text-emerald-600'
                  : i === step
                    ? 'bg-accent text-white'
                    : 'bg-sand-100 text-sand-400'
              }`}
            >
              {i < step ? (
                <CheckCircle2 className="h-3.5 w-3.5" />
              ) : (
                <span className="h-1.5 w-1.5 rounded-full bg-current" />
              )}
            </span>
            {label}
          </li>
        ))}
      </ul>
    </div>
  )
}

function PromptHint() {
  return (
    <div className="card flex h-full min-h-[360px] flex-col items-center justify-center gap-3 border-dashed p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-accent-soft text-accent">
        <Sparkles className="h-6 w-6" />
      </span>
      <p className="font-display text-lg text-ink">Ready when you are</p>
      <p className="max-w-xs text-sm text-ink-muted">
        Send your message and the copilot will style a complete, coordinated look around your
        wardrobe.
      </p>
    </div>
  )
}

function ReadyHint() {
  return (
    <div className="card flex h-full min-h-[360px] flex-col items-center justify-center gap-3 p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-emerald-100 text-emerald-600">
        <CheckCircle2 className="h-6 w-6" />
      </span>
      <p className="font-display text-lg text-ink">Your look is ready</p>
      <p className="max-w-xs text-sm text-ink-muted">Scroll down to see your recommended outfit.</p>
    </div>
  )
}

function LockedHint({ onGoToWardrobe }: { onGoToWardrobe: () => void }) {
  return (
    <div className="card flex h-full min-h-[360px] flex-col items-center justify-center gap-3 border-dashed p-8 text-center">
      <span className="grid h-12 w-12 place-items-center rounded-full bg-sand-100 text-sand-500">
        <Lock className="h-6 w-6" />
      </span>
      <p className="font-display text-lg text-ink">Wardrobe needed first</p>
      <p className="max-w-xs text-sm text-ink-muted">
        Recommendations are built around what you own. Add and analyze your wardrobe to unlock the
        chat.
      </p>
      <button onClick={onGoToWardrobe} className="btn-ghost mt-1">
        Go to wardrobe
      </button>
    </div>
  )
}
