import 'server-only'

import { getRedditDeliveryControl } from './reddit-service-safety'
import { readHyperbrowserHealth, HYPERBROWSER_HEALTH_MAX_AGE_MS } from './reddit-delivery-health'
import { createClient } from '@supabase/supabase-js'

export type PublicServiceStatus = {
  status: 'operational' | 'degraded' | 'outage'
  message: string
  checkedAt: string
  redditDelivery: 'operational' | 'paused' | 'degraded'
  customerNotifications: 'operational' | 'attention_required'
}

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server database configuration is missing')
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
}

export async function getPublicServiceStatus(): Promise<PublicServiceStatus> {
  const checkedAt = new Date().toISOString()
  try {
    const [control, health, failedNotifications] = await Promise.all([
      getRedditDeliveryControl(),
      readHyperbrowserHealth().catch(() => null),
      getServiceRoleClient()
        .from('incident_deliveries')
        .select('id, service_incidents!inner(status)', { count: 'exact', head: true })
        .eq('status', 'failed')
        .gte('attempts', 3)
        .eq('service_incidents.status', 'open'),
    ])
    if (failedNotifications.error) throw failedNotifications.error
    if ((failedNotifications.count ?? 0) > 0) {
      return {
        status: 'degraded',
        message: 'A customer notification requires operator attention. In-app incident notices remain available.',
        checkedAt,
        redditDelivery: control.state === 'open' ? 'paused' : 'operational',
        customerNotifications: 'attention_required',
      }
    }
    if (control.state === 'open') {
      return {
        status: 'outage',
        message: 'Reddit delivery is paused safely while we verify the service.',
        checkedAt,
        redditDelivery: 'paused',
        customerNotifications: 'operational',
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
        customerNotifications: 'operational',
      }
    }
    return {
      status: 'operational',
      message: 'All monitored delivery systems are operating normally.',
      checkedAt,
      redditDelivery: 'operational',
      customerNotifications: 'operational',
    }
  } catch {
    return {
      status: 'outage',
      message: 'Service status cannot be verified. Delivery is treated as paused for safety.',
      checkedAt,
      redditDelivery: 'paused',
      customerNotifications: 'attention_required',
    }
  }
}
