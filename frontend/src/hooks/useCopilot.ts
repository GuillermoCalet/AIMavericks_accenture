import { useCallback, useEffect, useRef, useState } from 'react'
import type { IntentMetadata, RecommendationResult, WardrobeContext } from '@copilot/shared'
import { api, ApiRequestError } from '../services/api'

export type Section = 'hero' | 'wardrobe' | 'intent' | 'results'

export interface UploadedImage {
  file: File
  previewUrl: string
}

const DEMO_WARDROBE_TEXT =
  'Black jeans, white cotton shirts, a beige trench coat, navy knitwear, a couple of plain ' +
  'tees, white sneakers and black ankle boots. Mostly minimal, neutral colours.'

const DEMO_INTENT_TEXT =
  'I need an outfit for a casual dinner this Saturday in Barcelona. I want something elegant but ' +
  'comfortable, and I’d like to reuse my black jeans, spending under €250.'

function toMessage(err: unknown): string {
  if (err instanceof ApiRequestError) {
    if (err.code === 'LLM_UNAVAILABLE') {
      return 'Could not reach local Ollama. Start Ollama and check that qwen3-vl:8b-instruct is installed.'
    }
    if (err.code === 'LLM_RATE_LIMITED') {
      return 'The local AI service is busy. Wait a moment and retry.'
    }
    return err.message
  }
  if (err instanceof DOMException && err.name === 'AbortError') return 'Cancelled.'
  if (err instanceof TypeError) {
    return 'Could not reach the backend API. Is it running on the configured port?'
  }
  return err instanceof Error ? err.message : 'Unexpected error.'
}

export function useCopilot() {
  const [wardrobeText, setWardrobeText] = useState('')
  const [intentText, setIntentText] = useState('')
  const [images, setImages] = useState<UploadedImage[]>([])
  const [policy, setPolicy] = useState('balanced')
  const [availablePolicies, setAvailablePolicies] = useState<string[]>(['balanced'])

  // Discover available optimization policies from the backend (no secrets).
  useEffect(() => {
    api
      .health()
      .then((h) => {
        if (h.policies?.length) setAvailablePolicies(h.policies)
        if (h.defaultPolicy) setPolicy(h.defaultPolicy)
      })
      .catch(() => {})
  }, [])

  const [wardrobe, setWardrobe] = useState<WardrobeContext | null>(null)
  const [intent, setIntent] = useState<IntentMetadata | null>(null)
  const [recommendation, setRecommendation] = useState<RecommendationResult | null>(null)

  const [analyzingWardrobe, setAnalyzingWardrobe] = useState(false)
  const [recommending, setRecommending] = useState(false)
  const [runningDemo, setRunningDemo] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [activeSection, setActiveSection] = useState<Section>('hero')

  const abortRef = useRef<AbortController | null>(null)
  const sectionRefs = useRef<Record<Section, HTMLElement | null>>({
    hero: null,
    wardrobe: null,
    intent: null,
    results: null,
  })

  const registerSection = useCallback(
    (id: Section) => (el: HTMLElement | null) => {
      sectionRefs.current[id] = el
    },
    [],
  )

  const scrollTo = useCallback((id: Section) => {
    setActiveSection(id)
    sectionRefs.current[id]?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [])

  // --- images ----------------------------------------------------------
  const addImages = useCallback((files: FileList | File[]) => {
    const next = Array.from(files)
      .filter((f) => f.type.startsWith('image/'))
      .map((file) => ({ file, previewUrl: URL.createObjectURL(file) }))
    setImages((prev) => [...prev, ...next].slice(0, 6))
  }, [])

  const removeImage = useCallback((index: number) => {
    setImages((prev) => {
      const target = prev[index]
      if (target) URL.revokeObjectURL(target.previewUrl)
      return prev.filter((_, i) => i !== index)
    })
  }, [])

  // --- wardrobe analysis ----------------------------------------------
  const analyzeWardrobe = useCallback(async (): Promise<WardrobeContext | null> => {
    setError(null)
    setAnalyzingWardrobe(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const ctx = await api.analyzeWardrobe(
        wardrobeText,
        images.map((i) => i.file),
        controller.signal,
      )
      setWardrobe(ctx)
      return ctx
    } catch (err) {
      setError(toMessage(err))
      return null
    } finally {
      setAnalyzingWardrobe(false)
    }
  }, [wardrobeText, images])

  // --- recommendation (end-to-end) -------------------------------------
  const runRecommendation = useCallback(async (): Promise<void> => {
    setError(null)
    setRecommending(true)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await api.recommend(
        {
          intentText,
          wardrobe,
          wardrobeText: !wardrobe ? wardrobeText : undefined,
          optimizationPolicy: policy,
          maxResults: 3,
        },
        controller.signal,
      )
      setIntent(result.intent)
      if (result.wardrobe) setWardrobe(result.wardrobe)
      setRecommendation(result)
      scrollTo('results')
    } catch (err) {
      setError(toMessage(err))
    } finally {
      setRecommending(false)
    }
  }, [intentText, wardrobe, wardrobeText, policy, scrollTo])

  const cancel = useCallback(() => {
    abortRef.current?.abort()
    setAnalyzingWardrobe(false)
    setRecommending(false)
    setRunningDemo(false)
  }, [])

  const reset = useCallback(() => {
    cancel()
    images.forEach((i) => URL.revokeObjectURL(i.previewUrl))
    setImages([])
    setWardrobe(null)
    setIntent(null)
    setRecommendation(null)
    setError(null)
    setWardrobeText('')
    setIntentText('')
    scrollTo('hero')
  }, [cancel, images, scrollTo])

  // --- one-click demo (fills example inputs, runs the REAL pipeline) ----
  const runFullDemo = useCallback(async () => {
    if (runningDemo) return
    setRunningDemo(true)
    setError(null)
    setRecommendation(null)
    setWardrobe(null)
    setIntent(null)
    setWardrobeText(DEMO_WARDROBE_TEXT)
    setIntentText(DEMO_INTENT_TEXT)

    const controller = new AbortController()
    abortRef.current = controller
    try {
      scrollTo('wardrobe')
      setAnalyzingWardrobe(true)
      const ctx = await api.analyzeWardrobe(DEMO_WARDROBE_TEXT, [], controller.signal)
      setWardrobe(ctx)
      setAnalyzingWardrobe(false)

      scrollTo('intent')
      setRecommending(true)
      const result = await api.recommend(
        { intentText: DEMO_INTENT_TEXT, wardrobe: ctx, optimizationPolicy: policy, maxResults: 3 },
        controller.signal,
      )
      setIntent(result.intent)
      setRecommendation(result)
      setRecommending(false)
      scrollTo('results')
    } catch (err) {
      setError(toMessage(err))
      setAnalyzingWardrobe(false)
      setRecommending(false)
    } finally {
      setRunningDemo(false)
    }
  }, [runningDemo, policy, scrollTo])

  return {
    state: {
      wardrobeText,
      intentText,
      images,
      wardrobe,
      intent,
      recommendation,
      analyzingWardrobe,
      recommending,
      runningDemo,
      error,
      activeSection,
      policy,
      availablePolicies,
      canRecommend: !!wardrobe,
    },
    setWardrobeText,
    setIntentText,
    setPolicy,
    addImages,
    removeImage,
    registerSection,
    scrollTo,
    analyzeWardrobe,
    runRecommendation,
    runFullDemo,
    cancel,
    reset,
    clearError: () => setError(null),
  }
}
