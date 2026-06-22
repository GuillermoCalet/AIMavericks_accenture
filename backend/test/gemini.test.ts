import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config'
import {
  GeminiProvider,
  LlmRateLimitError,
  LlmUnavailableError,
} from '../src/llm/provider'

afterEach(() => vi.unstubAllGlobals())

describe('GeminiProvider', () => {
  it('sends text, system instructions and inline images to generateContent', async () => {
    const originalKey = config.gemini.apiKey
    Object.assign(config.gemini, { apiKey: 'test-key' })
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const headers = init?.headers as Record<string, string>
      const body = JSON.parse(String(init?.body)) as {
        systemInstruction: { parts: Array<{ text: string }> }
        contents: Array<{
          parts: Array<{ text?: string; inlineData?: { mimeType: string; data: string } }>
        }>
        generationConfig: { responseMimeType: string; temperature: number; maxOutputTokens: number }
      }
      expect(headers['x-goog-api-key']).toBe('test-key')
      expect(body.systemInstruction.parts[0].text).toBe('system rules')
      expect(body.contents[0].parts[0].text).toBe('extract metadata')
      expect(body.contents[0].parts[1].inlineData).toEqual({
        mimeType: 'image/png',
        data: Buffer.from('image-bytes').toString('base64'),
      })
      expect(body.generationConfig.responseMimeType).toBe('application/json')
      expect(body.generationConfig.temperature).toBe(0)
      expect(body.generationConfig.maxOutputTokens).toBe(2048)
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: '{"occasion":"dinner"}' }] } }],
        }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    try {
      const result = await new GeminiProvider().generateJson({
        system: 'system rules',
        prompt: 'extract metadata',
        images: [{ mimeType: 'image/png', data: Buffer.from('image-bytes') }],
      })
      expect(result).toBe('{"occasion":"dinner"}')
      expect(fetchMock).toHaveBeenCalledOnce()
    } finally {
      Object.assign(config.gemini, { apiKey: originalKey })
    }
  })

  it('reports a missing key clearly', async () => {
    const originalKey = config.gemini.apiKey
    Object.assign(config.gemini, { apiKey: '' })
    try {
      await expect(new GeminiProvider().generateJson({ prompt: 'x' })).rejects.toBeInstanceOf(
        LlmUnavailableError,
      )
    } finally {
      Object.assign(config.gemini, { apiKey: originalKey })
    }
  })

  it('maps quota errors to the shared rate-limit error', async () => {
    const originalKey = config.gemini.apiKey
    Object.assign(config.gemini, { apiKey: 'test-key' })
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('RESOURCE_EXHAUSTED', { status: 429 })),
    )
    try {
      await expect(new GeminiProvider().generateJson({ prompt: 'x' })).rejects.toBeInstanceOf(
        LlmRateLimitError,
      )
    } finally {
      Object.assign(config.gemini, { apiKey: originalKey })
    }
  })
})
