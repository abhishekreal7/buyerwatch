import DodoPayments from 'dodopayments'
import { getServiceRoleClient } from './admin'
import { getDodoEnvironment } from './dodo'
import { logger } from './logger'

type DeletionRequest = {
  user_id: string
  subscription_id: string | null
  status: 'pending' | 'billing_cancelled' | 'completed' | 'failed'
  billing_cancelled_at: string | null
  attempts: number
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object' && 'code' in error) {
    return String((error as { code?: unknown }).code ?? 'unknown').slice(0, 100)
  }
  return error instanceof Error ? error.name : 'unknown'
}

export async function processAccountDeletion(userId: string): Promise<'completed'> {
  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('account_deletion_requests')
    .select('user_id, subscription_id, status, billing_cancelled_at, attempts')
    .eq('user_id', userId)
    .single()
  if (error) throw error
  const request = data as DeletionRequest
  if (request.status === 'completed') return 'completed'

  const { error: attemptError } = await admin
    .from('account_deletion_requests')
    .update({
      attempts: request.attempts + 1,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
  if (attemptError) throw attemptError

  try {
    if (request.subscription_id && !request.billing_cancelled_at) {
      const apiKey = process.env.DODO_PAYMENTS_API_KEY?.trim()
      if (!apiKey) throw new Error('billing_cancellation_not_configured')
      const dodo = new DodoPayments({
        bearerToken: apiKey,
        environment: getDodoEnvironment(),
        timeout: 15_000,
        maxRetries: 2,
      })
      await dodo.subscriptions.update(request.subscription_id, {
        status: 'cancelled',
        cancel_reason: 'cancelled_by_customer',
        cancellation_comment: 'Account deleted by customer',
      })
      const cancelledAt = new Date().toISOString()
      const { error: persistCancellationError } = await admin
        .from('account_deletion_requests')
        .update({
          status: 'billing_cancelled',
          billing_cancelled_at: cancelledAt,
          updated_at: cancelledAt,
        })
        .eq('user_id', userId)
      if (persistCancellationError) throw persistCancellationError
    }

    const { error: deleteError } = await admin.auth.admin.deleteUser(userId)
    if (deleteError && !/not found/i.test(deleteError.message)) throw deleteError

    const completedAt = new Date().toISOString()
    const { error: completeError } = await admin
      .from('account_deletion_requests')
      .update({
        status: 'completed',
        completed_at: completedAt,
        last_error: null,
        updated_at: completedAt,
      })
      .eq('user_id', userId)
    if (completeError) throw completeError
    return 'completed'
  } catch (error) {
    const code = errorCode(error)
    await admin
      .from('account_deletion_requests')
      .update({
        status: 'failed',
        last_error: code,
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    logger.error({ code }, 'Account deletion stage failed and remains retryable')
    throw error
  }
}
