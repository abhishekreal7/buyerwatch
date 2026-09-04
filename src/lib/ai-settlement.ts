import type { SupabaseClient } from '@supabase/supabase-js'
import type { AiUsage } from './ai-usage'
import { logger } from './logger'
import { publishQStashJson } from './qstash'

export type AiSettlementMessage =
  | {
      id: string
      operation: 'record_usage'
      reservationId: string
      userId: string
      usage: AiUsage
    }
  | {
      id: string
      operation: 'release_spend' | 'release_draft_allowance'
      reservationId: string
      userId: string
    }

export function isAiSettlementMessage(value: unknown): value is AiSettlementMessage {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false
  const message = value as Record<string, unknown>
  if (
    typeof message.id !== 'string'
    || message.id.length < 8
    || message.id.length > 200
    || typeof message.reservationId !== 'string'
    || typeof message.userId !== 'string'
    || !['record_usage', 'release_spend', 'release_draft_allowance'].includes(String(message.operation))
  ) return false
  if (message.operation !== 'record_usage') return true
  if (!message.usage || typeof message.usage !== 'object' || Array.isArray(message.usage)) return false
  const usage = message.usage as Record<string, unknown>
  return typeof usage.model === 'string'
    && usage.model.length <= 200
    && [usage.inputTokens, usage.outputTokens, usage.estimatedCostMicrousd]
      .every(number => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0)
}

export async function applyAiSettlement(
  client: SupabaseClient,
  message: AiSettlementMessage,
): Promise<void> {
  const usage = message.operation === 'record_usage'
    ? message.usage
    : { model: '', inputTokens: 0, outputTokens: 0, estimatedCostMicrousd: 0 }
  const { data, error } = await client.rpc('apply_ai_settlement_v1', {
    p_id: message.id,
    p_operation: message.operation,
    p_reservation_id: message.reservationId,
    p_user_id: message.userId,
    p_model: usage.model,
    p_input_tokens: usage.inputTokens,
    p_output_tokens: usage.outputTokens,
    p_cost_microusd: usage.estimatedCostMicrousd,
  })
  if (error) throw new Error(`AI settlement failed: ${error.message}`)
  if (data !== true) throw new Error('AI settlement was not applied')
}

async function applyOrQueue(
  client: SupabaseClient,
  message: AiSettlementMessage,
): Promise<'applied' | 'queued'> {
  try {
    await applyAiSettlement(client, message)
    return 'applied'
  } catch (directError) {
    try {
      const messageId = await publishQStashJson('/api/jobs/ai-settlement', message, {
        retries: 6,
        timeout: '2m',
      })
      if (!messageId) throw new Error('QStash is not configured')
      logger.warn(
        { directError, settlementId: message.id, messageId, operation: message.operation },
        'AI settlement deferred to durable retry',
      )
      return 'queued'
    } catch (queueError) {
      logger.error(
        { directError, queueError, settlementId: message.id, operation: message.operation },
        'AI settlement could not be applied or queued; reservation remains pending',
      )
      throw queueError
    }
  }
}

export function settleAiUsageDurably(
  client: SupabaseClient,
  input: { reservationId: string; userId: string; usage: AiUsage },
): Promise<'applied' | 'queued'> {
  return applyOrQueue(client, {
    id: `ai-usage:${input.reservationId}`,
    operation: 'record_usage',
    reservationId: input.reservationId,
    userId: input.userId,
    usage: input.usage,
  })
}

export function releaseAiSpendDurably(
  client: SupabaseClient,
  input: { reservationId: string; userId: string },
): Promise<'applied' | 'queued'> {
  return applyOrQueue(client, {
    id: `ai-release:${input.reservationId}`,
    operation: 'release_spend',
    reservationId: input.reservationId,
    userId: input.userId,
  })
}

export function releaseMonthlyDraftDurably(
  client: SupabaseClient,
  input: { reservationId: string; userId: string },
): Promise<'applied' | 'queued'> {
  return applyOrQueue(client, {
    id: `draft-release:${input.reservationId}`,
    operation: 'release_draft_allowance',
    reservationId: input.reservationId,
    userId: input.userId,
  })
}

