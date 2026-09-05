import { afterEach, describe, expect, it, vi } from 'vitest'
import { HyperbrowserClient, HyperbrowserClientError } from '../src/lib/hyperbrowser-client'

describe('Hyperbrowser native client', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('uses platform fetch with the provider API key and never relies on a legacy request parser', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({
      id: '123e4567-e89b-42d3-a456-426614174000',
      wsEndpoint: 'wss://example.test/cdp',
      liveUrl: 'https://app.hyperbrowser.ai/live',
    }), { headers: { 'content-type': 'application/json' } }))
    vi.stubGlobal('fetch', request)

    await expect(new HyperbrowserClient('test-key').createSession({ timeoutMinutes: 5 }))
      .resolves.toMatchObject({ id: '123e4567-e89b-42d3-a456-426614174000' })

    expect(request).toHaveBeenCalledWith(
      new URL('https://api.hyperbrowser.ai/api/session'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ timeoutMinutes: 5 }),
        headers: expect.objectContaining({ 'x-api-key': 'test-key' }),
      }),
    )
  })

  it('keeps provider HTTP status and retry semantics intact', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ message: 'Rate limited' }), {
      status: 429,
      headers: { 'content-type': 'application/json', 'x-request-id': 'req_123' },
    })))

    await expect(new HyperbrowserClient('test-key').getCreditInfo()).rejects.toEqual(
      expect.objectContaining<Partial<HyperbrowserClientError>>({
        name: 'HyperbrowserClientError',
        statusCode: 429,
        retryable: true,
        requestId: 'req_123',
      }),
    )
  })

  it('requests a fresh time-bound live view when reading a session', async () => {
    const request = vi.fn(async () => new Response(JSON.stringify({ id: 'session-1' }), {
      headers: { 'content-type': 'application/json' },
    }))
    vi.stubGlobal('fetch', request)

    await new HyperbrowserClient('test-key').getSession('session-1', { liveViewTtlSeconds: 900 })

    expect(request).toHaveBeenCalledWith(
      new URL('https://api.hyperbrowser.ai/api/session/session-1?liveViewTtlSeconds=900'),
      expect.objectContaining({ headers: expect.objectContaining({ 'x-api-key': 'test-key' }) }),
    )
  })
})
