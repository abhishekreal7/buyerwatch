import { describe, expect, it } from 'vitest'
import { classifyRedditApisBalance } from '../src/lib/redditapis-balance-monitor'

describe('RedditAPIs balance threshold', () => {
  it('keeps a provider healthy above the configured balance floor', () => {
    expect(classifyRedditApisBalance(1.01, 1)).toBe('healthy')
  })

  it('alerts before the provider is empty and escalates at the final reserve', () => {
    expect(classifyRedditApisBalance(0.5, 1)).toBe('low')
    expect(classifyRedditApisBalance(0.05, 1)).toBe('depleted')
  })

  it('rejects impossible account-balance values', () => {
    expect(() => classifyRedditApisBalance(-1, 1)).toThrow('redditapis_balance_invalid')
  })
})
