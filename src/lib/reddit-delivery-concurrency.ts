import type { FlowControl } from '@upstash/qstash'

export const REDDIT_DELIVERY_FLOW_CONTROL_KEY = 'reddit-browser-delivery:v1'

export function getHyperbrowserRedditMaxConcurrency(
  raw = process.env.HYPERBROWSER_REDDIT_MAX_CONCURRENCY,
) {
  const parsed = Number(raw)
  return Number.isSafeInteger(parsed) && parsed >= 1 && parsed <= 25 ? parsed : 1
}

export function getRedditDeliveryFlowControl(
  platform: 'reddit' | 'bluesky' | 'x',
): FlowControl | undefined {
  if (platform !== 'reddit') return undefined
  return {
    key: REDDIT_DELIVERY_FLOW_CONTROL_KEY,
    parallelism: getHyperbrowserRedditMaxConcurrency(),
  }
}
