import { afterEach, describe, expect, it, vi } from 'vitest'
import { config } from '../src/config'
import {
  LlmUnavailableError,
  OllamaProvider,
} from '../src/llm/provider'

afterEach(() => vi.unstubAllGlobals())

describe('OllamaProvider', () => {
  it('routes image requests to the configured vision model', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        model: string
        format: string
        think: boolean
        stream: boolean
        messages: Array<{ role: string; content: string; images?: string[] }>
        options: { temperature: number; seed: number; num_ctx: number; num_predict: number }
      }
      expect(body.model).toBe(config.ollama.visionModel)
      expect(body.format).toBe('json')
      expect(body.think).toBe(false)
      expect(body.stream).toBe(false)
      expect(body.options).toEqual({
        temperature: 0,
        seed: 42,
        num_ctx: config.ollama.numCtx,
        num_predict: 2048,
      })
      expect(body.messages[0]).toEqual({ role: 'system', content: 'system rules' })
      expect(body.messages[1].role).toBe('user')
      expect(body.messages[1].content).toBe('extract metadata')
      expect(body.messages[1].images).toEqual([Buffer.from('image-bytes').toString('base64')])
      return new Response(
        JSON.stringify({ message: { content: '{"occasion":"dinner"}' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    const result = await new OllamaProvider().generateJson({
      system: 'system rules',
      prompt: 'extract metadata',
      images: [{ mimeType: 'image/png', data: Buffer.from('image-bytes') }],
    })

    expect(result).toBe('{"occasion":"dinner"}')
    expect(fetchMock).toHaveBeenCalledWith(
      `${config.ollama.url}/api/chat`,
      expect.objectContaining({ method: 'POST' }),
    )
  })

  it('routes text-only requests to the configured text model', async () => {
    const fetchMock = vi.fn(async (_url: string | URL | Request, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as {
        model: string
        messages: Array<{ role: string; content: string }>
      }
      expect(body.model).toBe(config.ollama.textModel)
      expect(body.messages.at(-1)?.content).toBe('extract intent')
      return new Response(
        JSON.stringify({ message: { content: '{"occasion":"dinner"}' } }),
        { status: 200, headers: { 'content-type': 'application/json' } },
      )
    })
    vi.stubGlobal('fetch', fetchMock)

    await new OllamaProvider().generateJson({ prompt: 'extract intent', modelRole: 'text' })

    expect(fetchMock).toHaveBeenCalledOnce()
  })

  it('returns a clear unavailable error when Ollama cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('fetch failed'))))

    await expect(new OllamaProvider().generateJson({ prompt: 'x' })).rejects.toBeInstanceOf(
      LlmUnavailableError,
    )
  })

  it('reports how to pull a missing local model', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('{"error":"model not found"}', { status: 404 })),
    )

    await expect(new OllamaProvider().generateJson({ prompt: 'x' })).rejects.toThrow(
      `ollama pull ${config.ollama.textModel}`,
    )
  })
})
