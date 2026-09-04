import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
  .replace(/\r\n/g, '\n')

describe('delayed Reddit send confirmation', () => {
  it('schedules independent read-only checks without retrying the write', () => {
    const sender = source('src/lib/send-reply.ts')
    const verifier = source('src/lib/reddit-send-reconciliation.ts')
    expect(sender).toContain('scheduleRedditReplyReconciliation')
    expect(verifier).toContain('findHyperbrowserRedditReply')
    expect(verifier).toContain("attempt: 1 | 2 | 3")
    expect(verifier).not.toContain('postHyperbrowserRedditReply')
  })

  it('uses a service-role-only, posted-only automatic resolution RPC', () => {
    const migration = source('supabase/migrations/20260829100000_automatic_reddit_send_reconciliation.sql')
    expect(migration).toContain("auth.role() <> 'service_role'")
    expect(migration).toContain("status = 'resolved_replied'")
    expect(migration).not.toContain("'resolved_not_sent'")
    expect(migration).toContain('to service_role')
  })
})
