import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const sendRoute = read('src/app/api/replies/send/route.ts')
const sendJobRoute = read('src/app/api/jobs/send/route.ts')
const sendProcessor = read('src/lib/send-reply.ts')
const dashboard = read('src/app/(dashboard)/dashboard/page.tsx')
const drafts = read('src/components/ReplyQueueWorkspace.tsx')
const outbox = read('src/lib/backend-maintenance.ts')
const manualAuditMigration = read('supabase/migrations/20260802120000_manual_reply_audit.sql')

describe('serverless reply delivery contracts', () => {
  it('dispatches manual and automatic sends through signed QStash jobs', () => {
    expect(sendRoute).toContain("publishQStashJson('/api/jobs/send'")
    expect(outbox).toContain("publishQStashJson('/api/jobs/send'")
    expect(sendRoute).toContain('flowControl: getRedditDeliveryFlowControl(message.platform)')
    expect(outbox).toContain('flowControl: getRedditDeliveryFlowControl(payload.platform)')
    expect(sendRoute).not.toContain('sendReplyQueue')
    expect(outbox).not.toContain('sendReplyQueue')
    expect(sendJobRoute).toContain('verifyQStashRequest')
  })

  it('keeps provider delivery idempotent and recoverable', () => {
    expect(sendProcessor).toContain("rpc('claim_thread_for_send_v2'")
    expect(sendProcessor).toContain("'finalize_successful_send'")
    expect(sendProcessor).toContain("rpc('mark_send_reconciliation'")
    expect(sendProcessor).toContain("'release_send_claim'")
  })

  it('uses an explicit manual Reddit handoff when direct posting is unavailable', () => {
    expect(sendRoute).toContain("mode: 'manual'")
    expect(sendRoute).toContain('isRedditDirectPostingConfigured')
    expect(dashboard).toContain('Reply copied. Post it on Reddit')
    expect(drafts).toContain('Reply copied. Post it on Reddit')
  })

  it('waits for confirmed delivery before removing queued replies', () => {
    expect(dashboard).toContain('await waitForReplyDelivery(thread.id)')
    expect(drafts).toContain('await waitForReplyDelivery(threadIdToSend)')
    expect(dashboard.indexOf('await waitForReplyDelivery(thread.id)'))
      .toBeLessThan(dashboard.indexOf('setThreads(prev => prev.filter'))
    expect(drafts.indexOf('await waitForReplyDelivery(threadIdToSend)'))
      .toBeLessThan(drafts.indexOf('setDrafts(prev => prev.filter'))
  })

  it('records manual posting with final text and an audit entry atomically', () => {
    expect(manualAuditMigration).toContain('mark_thread_manually_replied_v2')
    expect(manualAuditMigration).toContain('edited_text = p_final_text')
    expect(manualAuditMigration).toContain('insert into public.send_audit_log')
    expect(manualAuditMigration).toContain("'manual', 'success'")
  })
})
