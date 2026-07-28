import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizePlan, type PlanTier } from './plan-limits'

export type AiPurpose = 'intent' | 'draft'

export type AiUsage = {
  model: string
  inputTokens: number
  outputTokens: number
  estimatedCostMicrousd: number
}

export class AiUsageError extends Error {
  readonly usage: AiUsage

  constructor(message: string, usage: AiUsage, cause?: unknown) {
    super(message, { cause })
    this.name = 'AiUsageError'
    this.usage = usage
  }
}

type AnthropicUsageLike = {
  input_tokens: number
  output_tokens: number
  cache_creation_input_tokens?: number | null
  cache_read_input_tokens?: number | null
}

const EMPTY_AI_USAGE: AiUsage = {
  model: '',
  inputTokens: 0,
  outputTokens: 0,
  estimatedCostMicrousd: 0,
}

const USER_MONTHLY_LIMIT_MICROUSD: Record<PlanTier, number> = {
  free: 1_000_000,
  pro: 10_000_000,
  growth: 40_000_000,
}

const USER_LIMIT_ENV: Record<PlanTier, string> = {
  free: 'ANTHROPIC_FREE_MONTHLY_SPEND_LIMIT_USD',
  pro: 'ANTHROPIC_PRO_MONTHLY_SPEND_LIMIT_USD',
  growth: 'ANTHROPIC_GROWTH_MONTHLY_SPEND_LIMIT_USD',
}

const DEFAULT_RESERVATION_MICROUSD: Record<AiPurpose, number> = {
  intent: 25_000,
  draft: 35_000,
}

function parsePositiveUsd(value: string | undefined, fallbackUsd: number): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0
    ? Math.round(parsed * 1_000_000)
    : fallbackUsd * 1_000_000
}

function ratesForModel(model: string): { input: number; output: number } {
  if (model.includes('fable') || model.includes('mythos')) {
    return { input: 10, output: 50 }
  }
  if (model.includes('opus')) {
    return { input: 5, output: 25 }
  }
  if (model.includes('haiku')) {
    return { input: 1, output: 5 }
  }
  return { input: 3, output: 15 }
}

export function emptyAiUsage(): AiUsage {
  return { ...EMPTY_AI_USAGE }
}

export function calculateAnthropicUsage(
  model: string,
  usage: AnthropicUsageLike,
): AiUsage {
  const inputTokens = usage.input_tokens
    + (usage.cache_creation_input_tokens ?? 0)
    + (usage.cache_read_input_tokens ?? 0)
  const outputTokens = usage.output_tokens
  const rates = ratesForModel(model)

  return {
    model,
    inputTokens,
    outputTokens,
    // USD-per-million-token rates map directly to micro-USD per token.
    estimatedCostMicrousd: Math.round(
      inputTokens * rates.input + outputTokens * rates.output,
    ),
  }
}

export function mergeAiUsage(left: AiUsage, right: AiUsage): AiUsage {
  return {
    model: right.model || left.model,
    inputTokens: left.inputTokens + right.inputTokens,
    outputTokens: left.outputTokens + right.outputTokens,
    estimatedCostMicrousd:
      left.estimatedCostMicrousd + right.estimatedCostMicrousd,
  }
}

export function getAiUsageFromError(error: unknown): AiUsage {
  return error instanceof AiUsageError ? error.usage : emptyAiUsage()
}

export function getAiSpendConfig(
  plan: string | null | undefined,
  purpose: AiPurpose,
): {
  reservationMicrousd: number
  userMonthlyLimitMicrousd: number
  globalMonthlyLimitMicrousd: number
} {
  const normalizedPlan = normalizePlan(plan)
  const reservationEnv = purpose === 'intent'
    ? process.env.ANTHROPIC_INTENT_RESERVATION_USD
    : process.env.ANTHROPIC_DRAFT_RESERVATION_USD

  return {
    reservationMicrousd: parsePositiveUsd(
      reservationEnv,
      DEFAULT_RESERVATION_MICROUSD[purpose] / 1_000_000,
    ),
    userMonthlyLimitMicrousd: parsePositiveUsd(
      process.env[USER_LIMIT_ENV[normalizedPlan]],
      USER_MONTHLY_LIMIT_MICROUSD[normalizedPlan] / 1_000_000,
    ),
    globalMonthlyLimitMicrousd: parsePositiveUsd(
      process.env.ANTHROPIC_GLOBAL_MONTHLY_SPEND_LIMIT_USD,
      200,
    ),
  }
}

export async function reserveAiSpend(
  client: SupabaseClient,
  input: {
    userId: string
    purpose: AiPurpose
    plan: string | null | undefined
  },
): Promise<{ id: string; reservedMicrousd: number } | null> {
  const config = getAiSpendConfig(input.plan, input.purpose)
  const { data, error } = await client.rpc('reserve_ai_spend', {
    p_user_id: input.userId,
    p_purpose: input.purpose,
    p_estimated_microusd: config.reservationMicrousd,
    p_user_monthly_limit_microusd: config.userMonthlyLimitMicrousd,
    p_global_monthly_limit_microusd: config.globalMonthlyLimitMicrousd,
  })
  if (error) {
    throw new Error(`AI spend reservation failed: ${error.message}`)
  }
  return typeof data === 'string'
    ? { id: data, reservedMicrousd: config.reservationMicrousd }
    : null
}

export async function recordAiUsage(
  client: SupabaseClient,
  input: {
    reservationId: string
    usage: AiUsage
  },
): Promise<void> {
  const { error } = await client.rpc('record_ai_usage', {
    p_reservation_id: input.reservationId,
    p_model: input.usage.model,
    p_input_tokens: input.usage.inputTokens,
    p_output_tokens: input.usage.outputTokens,
    p_cost_microusd: input.usage.estimatedCostMicrousd,
  })
  if (error) {
    throw new Error(`AI usage recording failed: ${error.message}`)
  }
}

export async function releaseAiSpend(
  client: SupabaseClient,
  reservationId: string,
): Promise<void> {
  const { error } = await client.rpc('release_ai_spend', {
    p_reservation_id: reservationId,
  })
  if (error) {
    throw new Error(`AI spend release failed: ${error.message}`)
  }
}
