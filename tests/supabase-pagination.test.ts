import { describe, expect, it } from 'vitest'
import { fetchAllByKey } from '../src/lib/supabase-pagination'

describe('keyset pagination', () => {
  it('returns every row exactly once across multiple pages', async () => {
    const source = Array.from({ length: 1_203 }, (_, index) => ({
      id: String(index + 1).padStart(4, '0'),
    }))

    const result = await fetchAllByKey(
      async (afterId, limit) => ({
        data: source.filter(row => !afterId || row.id > afterId).slice(0, limit),
        error: null,
      }),
      row => row.id,
      500,
    )

    expect(result.error).toBeNull()
    expect(result.data).toEqual(source)
    expect(new Set(result.data?.map(row => row.id)).size).toBe(source.length)
  })

  it('propagates query errors without returning partial aggregates', async () => {
    const result = await fetchAllByKey(
      async () => ({ data: null, error: { message: 'query failed', code: '500' } }),
      (row: { id: string }) => row.id,
    )

    expect(result).toEqual({ data: null, error: { message: 'query failed', code: '500' } })
  })

  it('fails closed if a page cannot advance its cursor', async () => {
    const result = await fetchAllByKey(
      async () => ({ data: [{ id: 'same' }, { id: 'same' }], error: null }),
      row => row.id,
      2,
    )

    expect(result.error?.code).toBe('pagination_cursor_stalled')
    expect(result.data).toBeNull()
  })
})
