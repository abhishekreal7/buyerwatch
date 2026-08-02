export type ReplySendResult =
  | { mode: 'manual'; threadId: string; postUrl: string; text: string }
  | { mode: 'queued'; threadId: string; messageId: string }

type DeliveryStatus = {
  status: string
  delivery: string | null
  error: string | null
  permalink: string | null
}

const sleep = (milliseconds: number) => new Promise(resolve => setTimeout(resolve, milliseconds))

export async function waitForReplyDelivery(
  threadId: string,
  timeoutMs = 60_000,
): Promise<DeliveryStatus> {
  const deadline = Date.now() + timeoutMs
  while (Date.now() < deadline) {
    const response = await fetch(
      `/api/replies/status?threadId=${encodeURIComponent(threadId)}&at=${Date.now()}`,
    )
    if (!response.ok) throw new Error('Unable to confirm reply delivery')
    const result = await response.json() as DeliveryStatus
    if (result.status === 'replied') return result
    if (result.status === 'send_reconciliation_required') {
      throw new Error('The platform accepted this reply, but its record needs reconciliation. It will not be sent twice.')
    }
    if (
      (result.delivery === 'failed_permanent' || result.delivery === 'failed_retryable')
      && (result.status === 'drafted' || result.status === 'needs_manual_reply')
    ) {
      throw new Error(result.error || 'The platform did not accept this reply. Your draft is still available.')
    }
    await sleep(1_250)
  }
  throw new Error('Posting is still in progress. Keep this draft open or refresh shortly to confirm delivery.')
}
