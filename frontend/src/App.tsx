import { AlertCircle, X } from 'lucide-react'
import { Footer } from './components/Footer'
import { Hero } from './components/Hero'
import { Navbar } from './components/Navbar'
import { Section } from './components/Section'
import { WardrobeInput } from './components/WardrobeInput'
import { BuyerIntentChat } from './components/BuyerIntentChat'
import { RecommendationResults } from './components/RecommendationResults'
import { useCopilot } from './hooks/useCopilot'

export default function App() {
  const copilot = useCopilot()
  const { state } = copilot

  return (
    <div className="min-h-screen">
      <Navbar
        active={state.activeSection}
        runningDemo={state.runningDemo}
        onNavigate={copilot.scrollTo}
        onRunDemo={copilot.runFullDemo}
        onReset={copilot.reset}
      />

      {state.error && (
        <div className="sticky top-16 z-40 mx-auto max-w-7xl px-5 pt-3 sm:px-8">
          <div className="flex items-start gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-card">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <p className="flex-1">{state.error}</p>
            <button onClick={copilot.clearError} aria-label="Dismiss error">
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}

      <main>
        <Section id="hero" ref={copilot.registerSection('hero')}>
          <Hero
            onStart={() => copilot.scrollTo('wardrobe')}
            onRunDemo={copilot.runFullDemo}
            runningDemo={state.runningDemo}
          />
        </Section>

        <Section id="wardrobe" ref={copilot.registerSection('wardrobe')} tone="tint">
          <WardrobeInput
            text={state.wardrobeText}
            onTextChange={copilot.setWardrobeText}
            images={state.images}
            onAddImages={copilot.addImages}
            onRemoveImage={copilot.removeImage}
            analyzing={state.analyzingWardrobe}
            result={state.wardrobe}
            onAnalyze={copilot.analyzeWardrobe}
          />
        </Section>

        <Section id="intent" ref={copilot.registerSection('intent')}>
          <BuyerIntentChat
            text={state.intentText}
            onTextChange={copilot.setIntentText}
            recommending={state.recommending}
            canRecommend={state.canRecommend}
            intent={state.intent}
            policy={state.policy}
            availablePolicies={state.availablePolicies}
            onPolicyChange={copilot.setPolicy}
            onSend={copilot.runRecommendation}
            onCancel={copilot.cancel}
            onGoToWardrobe={() => copilot.scrollTo('wardrobe')}
          />
        </Section>

        <Section id="results" ref={copilot.registerSection('results')} tone="tint">
          <RecommendationResults recommendation={state.recommendation} onReset={copilot.reset} />
        </Section>
      </main>

      <Footer />
    </div>
  )
}
