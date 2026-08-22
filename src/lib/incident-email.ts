import { Resend } from 'resend'
import { createClient } from '@supabase/supabase-js'
import { withTimeout } from './http'
import { logger } from './logger'

function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server database configuration is missing')
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

type ClaimedDelivery = {
  delivery_id: string
  incident_id: string
  user_id: string
  attempts: number
}

type Incident = {
  id: string
  title: string
  message: string
  severity: string
  action_path: string | null
}

function appOrigin() {
  const configured = process.env.NEXT_PUBLIC_APP_URL?.trim()
  return configured ? configured.replace(/\/$/, '') : 'https://buyerwatch.co'
}

export async function deliverPendingIncidentEmails(limit = 20): Promise<{
  claimed: number
  delivered: number
  failed: number
}> {
  const apiKey = process.env.RESEND_API_KEY?.trim()
  const from = process.env.RESEND_FROM_EMAIL?.trim()
  if (!apiKey || !from) {
    logger.error('Customer incident email is not configured')
    return { claimed: 0, delivered: 0, failed: 0 }
  }
  const admin = getServiceRoleClient()
  const claim = await admin.rpc('claim_incident_email_deliveries_v1', {
    p_limit: Math.max(1, Math.min(limit, 50)),
  })
  if (claim.error) throw claim.error
  const deliveries = (claim.data ?? []) as ClaimedDelivery[]
  if (deliveries.length === 0) return { claimed: 0, delivered: 0, failed: 0 }

  const { data: incidentRows, error: incidentsError } = await admin
    .from('service_incidents')
    .select('id, title, message, severity, action_path')
    .in('id', deliveries.map(delivery => delivery.incident_id))
  if (incidentsError) throw incidentsError
  const incidents = new Map((incidentRows as Incident[]).map(incident => [incident.id, incident]))
  const resend = new Resend(apiKey)
  let delivered = 0
  let failed = 0

  await Promise.all(deliveries.map(async delivery => {
    const incident = incidents.get(delivery.incident_id)
    let succeeded = false
    let failure = 'incident_unavailable'
    try {
      if (!incident) throw new Error(failure)
      const user = await admin.auth.admin.getUserById(delivery.user_id)
      if (user.error || !user.data.user?.email) throw new Error('recipient_unavailable')
      const actionUrl = `${appOrigin()}${incident.action_path ?? '/status'}`
      const result = await withTimeout(resend.emails.send({
        from,
        to: user.data.user.email,
        subject: `BuyerWatch: ${incident.title}`,
        text: `${incident.title}\n\n${incident.message}\n\nView details: ${actionUrl}\nService status: ${appOrigin()}/status\nSupport: support@buyerwatch.co`,
      }), 10_000, 'Customer incident email')
      if (result.error) throw new Error('email_provider_rejected')
      succeeded = true
      delivered += 1
    } catch (error) {
      failed += 1
      failure = error instanceof Error ? error.message.slice(0, 300) : 'delivery_failed'
      logger.error({ error, incidentId: delivery.incident_id }, 'Customer incident email failed')
    }
    const recorded = await admin.rpc('record_incident_email_delivery_v1', {
      p_delivery_id: delivery.delivery_id,
      p_succeeded: succeeded,
      p_error: succeeded ? null : failure,
    })
    if (recorded.error) logger.error({ error: recorded.error }, 'Unable to record incident email result')
  }))
  return { claimed: deliveries.length, delivered, failed }
}
