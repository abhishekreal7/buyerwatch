import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Reddit reply tracking scalability', () => {
  const tracker = source('src/lib/reddit-reply-tracking.ts')
  const outcomes = source('src/app/api/replies/outcomes/route.ts')
  const migration = source('supabase/migrations/20260824120000_scale_reddit_reply_tracking.sql')

  it('durably schedules every successful Reddit send', () => {
    expect(migration).toContain('create table if not exists public.reddit_reply_tracking_state')
    expect(migration).toContain('send_audit_seed_reddit_reply_tracking')
    expect(migration).toContain("audit.status = 'success'")
    expect(migration).toContain("audit.created_at >= now() - interval '14 days'")
  })

  it('atomically claims bounded batches without a global cursor', () => {
    expect(migration).toContain('for update skip locked')
    expect(migration).toContain('claim_due_reddit_reply_tracking_v1')
    expect(tracker).toContain("admin.rpc('claim_due_reddit_reply_tracking_v1'")
    expect(tracker).not.toContain('CURSOR_KEY')
    expect(tracker).not.toContain('RUN_LOCK_KEY')
  })

  it('retries failures and settles successful checks', () => {
    expect(tracker).toContain('settle_reddit_reply_tracking_v1')
    expect(tracker).toContain('retryDelayMinutes')
    expect(tracker).toContain('replyCount: externalReplies.length')
    expect(migration).toContain('last_reply_count')
  })

  it('computes outcomes from the complete tracking ledger', () => {
    expect(migration).toContain('get_reddit_reply_outcomes_v1')
    expect(outcomes).toContain("supabase.rpc('get_reddit_reply_outcomes_v1'")
    expect(outcomes).not.toContain('.limit(500)')
  })
})
