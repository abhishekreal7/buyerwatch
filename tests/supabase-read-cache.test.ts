import { describe, expect, it, vi } from 'vitest'
import { createSupabaseReadCache } from '../src/utils/supabase/read-cache'

const endpoint = 'https://example.supabase.co/rest/v1/monitored_threads?select=id'

describe('Supabase read cache', () => {
  it('deduplicates concurrent reads and serves fresh cached responses', async () => {
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({ calls }), { status: 200 })
    }) as typeof fetch
    const cache = createSupabaseReadCache({ fetchImpl })

    const [first, second] = await Promise.all([
      cache.fetch(endpoint),
      cache.fetch(endpoint),
    ])
    const third = await cache.fetch(endpoint)

    expect(await first.json()).toEqual({ calls: 1 })
    expect(await second.json()).toEqual({ calls: 1 })
    expect(await third.json()).toEqual({ calls: 1 })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it('returns stale data immediately while refreshing it in the background', async () => {
    let clock = 0
    let calls = 0
    const fetchImpl = vi.fn(async () => {
      calls += 1
      return new Response(JSON.stringify({ calls }), { status: 200 })
    }) as typeof fetch
    const cache = createSupabaseReadCache({
      fetchImpl,
      freshForMs: 10,
      staleForMs: 100,
      now: () => clock,
    })

    await cache.fetch(endpoint)
    clock = 20
    const stale = await cache.fetch(endpoint)
    await vi.waitFor(() => expect(fetchImpl).toHaveBeenCalledTimes(2))
    const refreshed = await cache.fetch(endpoint)

    expect(await stale.json()).toEqual({ calls: 1 })
    expect(await refreshed.json()).toEqual({ calls: 2 })
  })

  it('clears cached reads after a successful Supabase mutation', async () => {
    let reads = 0
    const fetchImpl = vi.fn(async (request: RequestInfo | URL) => {
      const method = request instanceof Request ? request.method : 'GET'
      if (method === 'GET') reads += 1
      return new Response(JSON.stringify({ reads }), { status: 200 })
    }) as typeof fetch
    const cache = createSupabaseReadCache({ fetchImpl })

    await cache.fetch(endpoint)
    await cache.fetch(endpoint, { method: 'POST', body: '{}' })
    await cache.fetch(endpoint)

    expect(reads).toBe(2)
  })
})
