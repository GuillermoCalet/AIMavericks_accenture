import { Sparkles } from 'lucide-react'

export function Footer() {
  return (
    <footer className="border-t border-sand-100 bg-white/50">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-5 py-8 text-sm text-ink-muted sm:flex-row sm:px-8">
        <div className="flex items-center gap-2">
          <span className="grid h-7 w-7 place-items-center rounded-lg bg-ink text-sand-400">
            <Sparkles className="h-4 w-4" />
          </span>
          <span className="font-display font-semibold text-ink">AI Fashion Copilot</span>
          <span className="text-sand-400">·</span>
          <span>GenAI Mavericks · Accenture challenge</span>
        </div>
        <p className="text-xs">
          Prototype · all services mocked · provider-agnostic architecture
        </p>
      </div>
    </footer>
  )
}
