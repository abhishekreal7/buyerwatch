import { afterEach, describe, expect, it } from 'vitest'
import {
  AiUsageError,
  calculateAnthropicUsage,
  getAiSpendConfig,
  getAiUsageFromError,
  mergeAiUsage,
} from '../src/lib/ai-usage'

const ORIGINAL_ENV = { ...process.env }

afterEach(() => {
  process.env = { ...ORIGINAL_ENV }
})

describe('Anthropic usage accounting', () => {
  it('estimates Sonnet cost in micro-USD and includes cache tokens', () => {
    expect(calculateAnthropicUsage('claude-sonnet-5', {
      input_tokens: 1_000,
      output_tokens: 200,
      cache_creation_input_tokens: 100,
      cache_read_input_tokens: 50,
    })).toEqual({
      model: 'claude-sonnet-5',
      inputTokens: 1_150,
      outputTokens: 200,
      estimatedCostMicrousd: 6_450,
    })
  })

  it('merges retry usage and preserves it on provider errors', () => {
    const usage = mergeAiUsage(
      calculateAnthropicUsage('claude-sonnet-5', {
        input_tokens: 100,
        output_tokens: 20,
      }),
      calculateAnthropicUsage('claude-sonnet-5', {
        input_tokens: 120,
        output_tokens: 30,
      }),
    )
    const error = new AiUsageError('failed after retries', usage)

    expect(getAiUsageFromError(error)).toEqual({
      model: 'claude-sonnet-5',
      inputTokens: 220,
      outputTokens: 50,
      estimatedCostMicrousd: 1_410,
    })
  })

  it('uses conservative plan defaults and allows operational overrides', () => {
    expect(getAiSpendConfig('pro', 'draft')).toMatchObject({
      reservationMicrousd: 35_000,
      userMonthlyLimitMicrousd: 10_000_000,
      globalMonthlyLimitMicrousd: 200_000_000,
    })

    process.env.ANTHROPIC_PRO_MONTHLY_SPEND_LIMIT_USD = '12.50'
    process.env.ANTHROPIC_GLOBAL_MONTHLY_SPEND_LIMIT_USD = '250'

    expect(getAiSpendConfig('pro', 'intent')).toMatchObject({
      reservationMicrousd: 25_000,
      userMonthlyLimitMicrousd: 12_500_000,
      globalMonthlyLimitMicrousd: 250_000_000,
    })
  })
})
