import { afterEach, describe, expect, it, vi } from 'vitest'
import { createAnthropicClient } from '../src/lib/anthropic-client'

describe('Anthropic client configuration', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('routes requests through the configured compatible API endpoint', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-relay-key')
    vi.stubEnv('ANTHROPIC_API_BASE_URL', 'https://relay.example.test/v1')

    const client = createAnthropicClient({ maxRetries: 0 })

    expect(client.baseURL).toBe('https://relay.example.test/v1')
  })

  it('uses the official endpoint when no relay base URL is configured', () => {
    vi.stubEnv('ANTHROPIC_API_KEY', 'test-anthropic-key')
    vi.stubEnv('ANTHROPIC_API_BASE_URL', '')

    const client = createAnthropicClient({ maxRetries: 0 })

    expect(client.baseURL).toBe('https://api.anthropic.com')
  })
})
