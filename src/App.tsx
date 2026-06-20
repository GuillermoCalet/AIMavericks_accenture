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
            imageCount={state.imageCount}
            onImageCountChange={copilot.setImageCount}
            analyzing={state.analyzingWardrobe}
            result={state.wardrobe}
            onAnalyze={copilot.analyzeWardrobe}
          />
        </Section>

        <Section id="intent" ref={copilot.registerSection('intent')}>
          <BuyerIntentChat
            text={state.intentText}
            onTextChange={copilot.setIntentText}
            curating={state.curating}
            canRecommend={state.canRecommend}
            hasResult={!!state.recommendation}
            onSend={copilot.submitIntent}
            onGoToWardrobe={() => copilot.scrollTo('wardrobe')}
          />
        </Section>

        <Section id="results" ref={copilot.registerSection('results')} tone="tint">
          <RecommendationResults
            recommendation={state.recommendation}
            onReset={copilot.reset}
          />
        </Section>
      </main>

      <Footer />
    </div>
  )
}
