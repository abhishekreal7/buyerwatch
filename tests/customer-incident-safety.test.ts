import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
  .replace(/\r\n/g, '\n')

describe('customer incident safety', () => {
  it('persists a fail-closed global circuit and cancels queued Reddit delivery', () => {
    const migration = source('supabase/migrations/20260822233000_customer_incident_safety.sql')
    expect(migration).toContain("values ('reddit_delivery', 'closed')")
    expect(migration).toContain('open_reddit_delivery_circuit_v1')
    expect(migration).toContain("payload ->> 'platform' = 'reddit'")
    expect(migration).toContain("status = 'cancelled'")
    expect(migration).toContain('auto_send_enabled = false')
    expect(migration).toContain('requires_manual_reset or p_requires_manual_reset')
  })

  it('blocks every Reddit write while the durable circuit is open', () => {
    const posting = source('src/lib/reddit-post.ts')
    const safety = source('src/lib/reddit-service-safety.ts')
    expect(posting.indexOf('assertRedditDeliveryCircuitClosed()'))
      .toBeLessThan(posting.indexOf('getActiveRedditSession(input.userId)'))
    expect(safety).toContain("state !== 'closed'")
    expect(safety).toContain("code = 'reddit_delivery_paused'")
  })

  it('queues customer email independently of operator alert channels', () => {
    const migration = source('supabase/migrations/20260822233000_customer_incident_safety.sql')
    const email = source('src/lib/incident-email.ts')
    const alerts = source('src/lib/reddit-delivery-alerts.ts')
    expect(migration).toContain('claim_incident_email_deliveries_v1')
    expect(migration).toContain('for update of delivery skip locked')
    expect(email).toContain('admin.auth.admin.getUserById')
    expect(email).toContain('record_incident_email_delivery_v1')
    expect(alerts).toContain('createIncidentForRedditAlert(input)')
    expect(alerts).toContain('deliverPendingIncidentEmails(20)')
    expect(source('src/lib/send-reply.ts')).toContain("code: 'reply_not_sent'")
    expect(source('src/lib/send-reply.ts')).toContain('resolveReplyNotSentIncident(userId)')
  })

  it('exposes real incidents, delivery states, status, and support commitments', () => {
    expect(source('src/components/DashboardLayout.tsx')).toContain("fetch('/api/incidents'")
    const activity = source('src/app/api/replies/activity/route.ts')
    for (const state of ['sent', 'failed', 'uncertain', 'cancelled']) {
      expect(activity).toContain(`'${state}'`)
    }
    expect(activity).toContain('deliveryActivityPresentation')
    expect(source('src/app/status/page.tsx')).toContain('getPublicServiceStatus')
    expect(source('src/app/service-policy/page.tsx')).toContain('prorated credit or refund')
  })

  it('uses GitHub Issues as an independent production escalation path', () => {
    const workflow = source('.github/workflows/synthetic.yml')
    expect(workflow).toContain('issues: write')
    expect(workflow).toContain('github.rest.issues.create')
    expect(workflow).toContain('github.rest.issues.update')
    expect(workflow).toContain('/api/status')
    expect(source('src/lib/public-service-status.ts')).toContain(".gte('attempts', 3)")
    expect(source('src/app/api/status/route.ts')).toContain("status.status === 'operational' ? 200 : 503")
  })
})
