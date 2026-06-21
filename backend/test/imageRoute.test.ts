import fs from 'node:fs'
import http from 'node:http'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { config } from '../src/config'
import { app } from '../src/server'

// Verifies that the recommendation image endpoint serves the CORRECT local
// product image (Flipkart/<id>.png), with 404/400 handling. Skipped when the
// local image folder is not present.
const sampleImage = path.join(config.images.dir, '11.png')
const hasImages = fs.existsSync(sampleImage)
const d = hasImages ? describe : describe.skip

d('GET /api/catalog/image/:id', () => {
  let server: http.Server
  let base = ''

  beforeAll(async () => {
    server = http.createServer(app)
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
    base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  })
  afterAll(() => new Promise<void>((r) => server.close(() => r())))

  it('serves the local product image as a real PNG (id "cat-11" → 11.png)', async () => {
    const res = await fetch(`${base}/api/catalog/image/cat-11`)
    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toContain('image/png')
    const buf = Buffer.from(await res.arrayBuffer())
    // PNG magic number
    expect(buf.subarray(0, 4).toString('hex')).toBe('89504e47')
    // matches the on-disk file exactly
    expect(buf.length).toBe(fs.statSync(sampleImage).size)
  })

  it('accepts a bare numeric id too', async () => {
    expect((await fetch(`${base}/api/catalog/image/11`)).status).toBe(200)
  })

  it('returns 404 for a missing id', async () => {
    expect((await fetch(`${base}/api/catalog/image/cat-99999999`)).status).toBe(404)
  })

  it('returns 400 for an invalid id', async () => {
    expect((await fetch(`${base}/api/catalog/image/not-a-number`)).status).toBe(400)
  })
})
