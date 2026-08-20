import { afterEach, describe, expect, it, vi } from 'vitest'
import { readResponseText } from '../src/lib/http'
import { isTrustedSameOriginMutation } from '../src/lib/request'

describe('same-origin mutation protection', () => {
  afterEach(() => vi.unstubAllEnvs())

  it('accepts a browser mutation from the request origin', () => {
    const request = new Request('https://buyerwatch.co/api/replies/send', {
      method: 'POST',
      headers: {
        origin: 'https://buyerwatch.co',
        'sec-fetch-site': 'same-origin',
      },
    })
    expect(isTrustedSameOriginMutation(request)).toBe(true)
  })

  it('rejects cross-origin and cross-site mutations', () => {
    const crossOrigin = new Request('https://buyerwatch.co/api/replies/send', {
      method: 'POST',
      headers: { origin: 'https://attacker.example' },
    })
    const crossSite = new Request('https://buyerwatch.co/api/replies/send', {
      method: 'POST',
      headers: {
        origin: 'https://buyerwatch.co',
        'sec-fetch-site': 'cross-site',
      },
    })
    expect(isTrustedSameOriginMutation(crossOrigin)).toBe(false)
    expect(isTrustedSameOriginMutation(crossSite)).toBe(false)
  })

  it('rejects headerless production mutations', () => {
    vi.stubEnv('NODE_ENV', 'production')
    expect(isTrustedSameOriginMutation(new Request(
      'https://buyerwatch.co/api/replies/send',
      { method: 'POST' },
    ))).toBe(false)
  })
})

describe('bounded response reader', () => {
  it('reads a bounded response body', async () => {
    await expect(readResponseText(new Response('buyer intent'), 32)).resolves.toBe('buyer intent')
  })

  it('rejects oversized streamed responses even without Content-Length', async () => {
    const response = new Response(new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode('12345'))
        controller.enqueue(new TextEncoder().encode('67890'))
        controller.close()
      },
    }))
    await expect(readResponseText(response, 8)).rejects.toThrow('response_too_large')
  })
})
