import 'server-only'

import { getRedditDeliveryControl } from './reddit-service-safety'
import { readHyperbrowserHealth, HYPERBROWSER_HEALTH_MAX_AGE_MS } from './reddit-delivery-health'

export type PublicServiceStatus = {
  status: 'operational' | 'degraded' | 'outage'
  message: string
  checkedAt: string
  redditDelivery: 'operational' | 'paused' | 'degraded'
}

export async function getPublicServiceStatus(): Promise<PublicServiceStatus> {
  const checkedAt = new Date().toISOString()
  try {
    const [control, health] = await Promise.all([
      getRedditDeliveryControl(),
      readHyperbrowserHealth().catch(() => null),
    ])
    if (control.state === 'open') {
      return {
        status: 'outage',
        message: 'Reddit delivery is paused safely while we verify the service.',
        checkedAt,
        redditDelivery: 'paused',
      }
    }
    const healthFresh = health
      && Date.now() - Date.parse(health.checkedAt) <= HYPERBROWSER_HEALTH_MAX_AGE_MS
    if (!healthFresh || health?.status === 'error') {
      return {
        status: 'degraded',
        message: 'Reddit delivery is available, but a recent verification is delayed.',
        checkedAt,
        redditDelivery: 'degraded',
      }
    }
    return {
      status: 'operational',
      message: 'All monitored delivery systems are operating normally.',
      checkedAt,
      redditDelivery: 'operational',
    }
  } catch {
    return {
      status: 'outage',
      message: 'Service status cannot be verified. Delivery is treated as paused for safety.',
      checkedAt,
      redditDelivery: 'paused',
    }
  }
}
