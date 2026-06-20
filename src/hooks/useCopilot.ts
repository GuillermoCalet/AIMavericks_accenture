import { useCallback, useRef, useState } from 'react'
import type { Recommendation, WardrobeContext } from '../data/types'
import {
  mockMetadataExtractor,
  mockRecommendationAPI,
  mockRuleSolver,
  mockWardrobeAnalyzer,
  delay,
} from '../services/mockApi'
import { DEFAULT_INTENT_TEXT, DEFAULT_WARDROBE_TEXT } from '../data/mockData'

export type Section = 'hero' | 'wardrobe' | 'intent' | 'results'

export interface CopilotState {
  // raw inputs
  wardrobeText: string
  intentText: string
  imageCount: number
  // outputs (the only thing the shopper ever sees)
  wardrobe: WardrobeContext | null
  recommendation: Recommendation | null
  // process flags — the reasoning runs invisibly behind a single "styling" loader
  analyzingWardrobe: boolean
  curating: boolean
  runningDemo: boolean
  activeSection: Section
  /** Wardrobe must be analyzed before any recommendation can be produced. */
  canRecommend: boolean
}

export function useCopilot() {
  const [wardrobeText, setWardrobeText] = useState(DEFAULT_WARDROBE_TEXT)
  const [intentText, setIntentText] = useState(DEFAULT_INTENT_TEXT)
  const [imageCount, setImageCount] = useState(0)

  const [wardrobe, setWardrobe] = useState<WardrobeContext | null>(null)
  const [recommendation, setRecommendation] = useState<Recommendation | null>(null)

  const [analyzingWardrobe, setAnalyzingWardrobe] = useState(false)
  const [curating, setCurating] = useState(false)
  const [runningDemo, setRunningDemo] = useState(false)
  const [activeSection, setActiveSection] = useState<Section>('hero')

  const sectionRefs = useRef<Record<Section, HTMLElement | null>>({
    hero: null,
    wardrobe: null,
    intent: null,
    results: null,
  })

  const registerSection = useCallback((id: Section) => (el: HTMLElement | null) => {
    sectionRefs.current[id] = el
  }, [])

  const scrollTo = useCallback((id: Section) => {
    setActiveSection(id)
    const el = sectionRefs.current[id]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // --- wardrobe (gate) ---------------------------------------------------

  const analyzeWardrobe = useCallback(async () => {
    setAnalyzingWardrobe(true)
    const ctx = await mockWardrobeAnalyzer({ text: wardrobeText, imageCount })
    setWardrobe(ctx)
    setAnalyzingWardrobe(false)
    return ctx
  }, [wardrobeText, imageCount])

  // --- invisible reasoning: LLM -> solver -> recommender -----------------
  // Runs entirely behind the scenes; the shopper only sees a styling loader.

  const reason = useCallback(async (ctx: WardrobeContext): Promise<Recommendation> => {
    const meta = await mockMetadataExtractor(intentText)
    await mockRuleSolver(ctx, meta)
    const rec = await mockRecommendationAPI(ctx, meta)
    await delay(400)
    return rec
  }, [intentText])

  /**
   * Buyer submits their intent. Requires an analyzed wardrobe first — otherwise
   * the recommendation would be inconsistent, so we bounce them to that step.
   */
  const submitIntent = useCallback(async () => {
    if (curating) return
    const ctx = wardrobe
    if (!ctx) {
      scrollTo('wardrobe')
      return
    }
    setCurating(true)
    const rec = await reason(ctx)
    setRecommendation(rec)
    setCurating(false)
    scrollTo('results')
  }, [curating, wardrobe, reason, scrollTo])

  const reset = useCallback(() => {
    setWardrobe(null)
    setRecommendation(null)
    setImageCount(0)
    setWardrobeText(DEFAULT_WARDROBE_TEXT)
    setIntentText(DEFAULT_INTENT_TEXT)
    setActiveSection('hero')
    scrollTo('hero')
  }, [scrollTo])

  // --- orchestrated one-click demo --------------------------------------
  // Always analyzes the wardrobe first, honouring the same hard requirement.

  const runFullDemo = useCallback(async () => {
    if (runningDemo) return
    setRunningDemo(true)
    setWardrobe(null)
    setRecommendation(null)

    scrollTo('wardrobe')
    await delay(700)
    const ctx = await analyzeWardrobe()

    await delay(700)
    scrollTo('intent')
    await delay(700)

    setCurating(true)
    const rec = await reason(ctx)
    setRecommendation(rec)
    setCurating(false)

    await delay(500)
    scrollTo('results')
    setRunningDemo(false)
  }, [runningDemo, scrollTo, analyzeWardrobe, reason])

  const state: CopilotState = {
    wardrobeText,
    intentText,
    imageCount,
    wardrobe,
    recommendation,
    analyzingWardrobe,
    curating,
    runningDemo,
    activeSection,
    canRecommend: !!wardrobe,
  }

  return {
    state,
    setWardrobeText,
    setIntentText,
    setImageCount,
    registerSection,
    scrollTo,
    analyzeWardrobe,
    submitIntent,
    runFullDemo,
    reset,
  }
}
