import { describe, expect, it, vi } from 'vitest'

describe('billing checkout API contracts', () => {
  it('identifies unauthorized errors from payment provider', () => {
    const errObj: Record<string, any> = { status: 401, error: 'Unauthorized' }
    const isUnauthorized = errObj?.status === 401 || errObj?.statusCode === 401
    expect(isUnauthorized).toBe(true)
  })
})
