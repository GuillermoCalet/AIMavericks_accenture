import { Play, RotateCcw, Sparkles } from 'lucide-react'
import type { Section } from '../hooks/useCopilot'

const NAV: { id: Section; label: string }[] = [
  { id: 'wardrobe', label: 'Wardrobe' },
  { id: 'intent', label: 'Intent' },
  { id: 'results', label: 'Result' },
]

interface Props {
  active: Section
  runningDemo: boolean
  onNavigate: (s: Section) => void
  onRunDemo: () => void
  onReset: () => void
}

export function Navbar({ active, runningDemo, onNavigate, onRunDemo, onReset }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-sand-100/80 glass">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-5 sm:px-8">
        <button
          onClick={() => onNavigate('hero')}
          className="flex items-center gap-2.5"
          aria-label="AI Fashion Copilot — home"
        >
          <span className="grid h-9 w-9 place-items-center rounded-xl bg-ink text-sand-400">
            <Sparkles className="h-5 w-5" />
          </span>
          <span className="text-left leading-tight">
            <span className="block font-display text-[15px] font-semibold text-ink">
              AI Fashion Copilot
            </span>
            <span className="block text-[10px] font-semibold uppercase tracking-[0.18em] text-sand-500">
              GenAI Mavericks
            </span>
          </span>
        </button>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV.map((item) => (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                active === item.id
                  ? 'bg-ink text-white'
                  : 'text-ink-muted hover:bg-sand-100 hover:text-ink'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <button onClick={onReset} className="btn-ghost hidden px-3 py-2 sm:inline-flex" title="Reset demo">
            <RotateCcw className="h-4 w-4" />
          </button>
          <button onClick={onRunDemo} disabled={runningDemo} className="btn-accent px-4 py-2">
            <Play className="h-4 w-4" />
            {runningDemo ? 'Running…' : 'Run full demo'}
          </button>
        </div>
      </div>
    </header>
  )
}
