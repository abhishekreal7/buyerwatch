import Anthropic from '@anthropic-ai/sdk'
import { getConfiguredSecret } from './env'

export function createAnthropicClient(options: { maxRetries?: number } = {}): Anthropic {
  const apiKey = getConfiguredSecret(process.env.ANTHROPIC_API_KEY)
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY is not configured')
  }

  const baseURL = getConfiguredSecret(process.env.ANTHROPIC_API_BASE_URL)

  return new Anthropic({
    apiKey,
    ...(baseURL ? { baseURL } : {}),
    timeout: 30_000,
    maxRetries: options.maxRetries ?? 2,
  })
}
