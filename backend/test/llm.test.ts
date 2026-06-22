import { describe, it, expect } from 'vitest'
import {
  IntentLlmSchema,
  WardrobeLlmSchema,
  ExplanationLlmSchema,
  StylistSelectionLlmSchema,
} from '../src/llm/schemas'
import { generateStructured, LlmInvalidOutputError } from '../src/llm/structured'
import { extractIntent } from '../src/llm/intent'
import {
  classifyProviderError,
  LlmRateLimitError,
  LlmTransportError,
  LlmUnavailableError,
  type GenerateArgs,
  type LlmProvider,
} from '../src/llm/provider'

/** A scripted provider that returns queued responses (or throws). */
class FakeProvider implements LlmProvider {
  name = 'fake'
  available = true
  private queue: (string | Error)[]
  calls = 0
  constructor(queue: (string | Error)[]) {
    this.queue = queue
  }
  async generateJson(_args: GenerateArgs): Promise<string> {
    this.calls++
    const next = this.queue.shift()
    if (next instanceof Error) throw next
    return next ?? '{}'
  }
}

describe('Zod schemas', () => {
  it('accepts a valid wardrobe payload', () => {
    const parsed = WardrobeLlmSchema.parse({
      detectedStyle: 'Minimal',
      styleConfidence: 0.8,
      frequentColors: ['black'],
      keyPieces: ['jeans'],
      missingPieces: ['blazer'],
      predominantFormality: 'smart-casual',
      items: [{ name: 'Jeans', category: 'bottom', color: 'black', formality: 'smart-casual', warmth: 'medium' }],
    })
    expect(parsed.items).toHaveLength(1)
  })
  it('rejects a wardrobe payload with no items', () => {
    expect(() =>
      WardrobeLlmSchema.parse({
        detectedStyle: 'X',
        predominantFormality: 'casual',
        items: [],
      }),
    ).toThrow()
  })
  it('fills intent defaults and keeps null weather', () => {
    const parsed = IntentLlmSchema.parse({ occasion: 'dinner' })
    expect(parsed.weatherContext).toBeNull()
    expect(parsed.budgetLevel).toBe('unknown')
    expect(parsed.anchorItems).toEqual([])
  })
  it('normalizes nullable optional intent strings from smaller local models', () => {
    const parsed = IntentLlmSchema.parse({
      occasion: 'dinner',
      desiredStyle: null,
      recommendationGoal: null,
    })
    expect(parsed.desiredStyle).toBe('versatile')
    expect(parsed.recommendationGoal).toBe('complete outfit')
  })
  it('validates explanation shape', () => {
    expect(() => ExplanationLlmSchema.parse({ perItem: [] })).toThrow() // missing summary
  })
  it('validates stylist selection shape', () => {
    const parsed = StylistSelectionLlmSchema.parse({
      evaluations: [{
        outfitId: 'solver-outfit-2',
        colorHarmony: 0.9,
        styleCoherence: 0.8,
        occasionFit: 0.9,
        wardrobeFit: 0.85,
        reason: 'Best wardrobe match',
        summary: 'This look complements the existing wardrobe.',
        perItem: [{ productId: 'cat-1', reason: 'Fills a wardrobe gap.' }],
      }],
    })
    expect(parsed.evaluations[0].outfitId).toBe('solver-outfit-2')
  })
})

describe('generateStructured (repair + failure)', () => {
  it('repairs after one invalid response', async () => {
    const provider = new FakeProvider([
      '{"oops": true}', // invalid (missing occasion)
      '{"occasion":"dinner"}', // valid after repair
    ])
    const result = await generateStructured(provider, IntentLlmSchema, { prompt: 'x' })
    expect(result.occasion).toBe('dinner')
    expect(provider.calls).toBe(2)
  })

  it('throws LlmInvalidOutputError after two invalid responses', async () => {
    const provider = new FakeProvider(['{"bad":1}', '{"still":"bad"}'])
    await expect(generateStructured(provider, IntentLlmSchema, { prompt: 'x' })).rejects.toBeInstanceOf(
      LlmInvalidOutputError,
    )
  })

  it('propagates transport errors from the provider', async () => {
    const provider = new FakeProvider([new Error('network down'), new Error('network down')])
    await expect(extractIntent(provider, 'I need a dinner outfit')).rejects.toThrow()
  })

  it('surfaces an unavailable provider without retrying (clear 503 path)', async () => {
    const provider = new FakeProvider([
      new LlmUnavailableError('no key'),
      new LlmUnavailableError('no key'),
    ])
    await expect(generateStructured(provider, IntentLlmSchema, { prompt: 'x' })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    )
    expect(provider.calls).toBe(1) // did not attempt a repair
  })

  it('surfaces a rate-limit error without burning a repair call', async () => {
    const provider = new FakeProvider([new LlmRateLimitError('429'), '{"occasion":"x"}'])
    await expect(generateStructured(provider, IntentLlmSchema, { prompt: 'x' })).rejects.toBeInstanceOf(
      LlmRateLimitError,
    )
    expect(provider.calls).toBe(1) // a 429 is not a validation error → no second call
  })
})

describe('extractIntent semantic normalization', () => {
  it('corrects an upper budget bound and ignores hallucinated required categories', async () => {
    const provider = new FakeProvider([
      JSON.stringify({
        occasion: 'casual dinner',
        desiredStyle: 'elegant comfortable',
        budgetLevel: 'low',
        minBudget: 250,
        maxBudget: null,
        anchorItems: ['black jeans'],
        requiredCategories: [
          'top',
          'bottom',
          'dress',
          'outerwear',
          'footwear',
          'bag',
          'jewellery',
          'accessory',
          'ethnic',
          'innerwear',
        ],
        recommendationGoal: null,
      }),
    ])

    const result = await extractIntent(
      provider,
      'I need a complete outfit under €250 and want to reuse my black jeans.',
    )

    expect(result.minBudget).toBeNull()
    expect(result.maxBudget).toBe(250)
    expect(result.requiredCategories).toEqual(['bottom'])
    expect(result.recommendationGoal).toBe('complete outfit')
  })
})

describe('classifyProviderError', () => {
  it('maps provider 429 / RESOURCE_EXHAUSTED to a rate-limit error', () => {
    const e = classifyProviderError({
      status: 429,
      message: 'You exceeded your current quota ... RESOURCE_EXHAUSTED ... Please retry in 22.2s',
    })
    expect(e).toBeInstanceOf(LlmRateLimitError)
    expect((e as LlmRateLimitError).retryAfterSeconds).toBe(23)
  })
  it('maps quota wording without a numeric status', () => {
    expect(classifyProviderError(new Error('rate limit exceeded'))).toBeInstanceOf(LlmRateLimitError)
  })
  it('maps other failures to a transport error', () => {
    expect(classifyProviderError(new Error('socket hang up'))).toBeInstanceOf(LlmTransportError)
  })
  it('passes through an unavailable error', () => {
    const u = new LlmUnavailableError('no key')
    expect(classifyProviderError(u)).toBe(u)
  })
})
