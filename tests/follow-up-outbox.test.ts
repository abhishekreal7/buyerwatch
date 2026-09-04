import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('follow-up delivery outbox', () => {
  const handler = source('worker/handlers/score-post.ts')
  const outbox = source('src/lib/follow-up-outbox.ts')
  const migration = source('supabase/migrations/20260824124000_follow_up_outbox.sql')

  it('persists Slack and rank intents before attempting queue delivery', () => {
    expect(handler).toContain('persistAndDispatchFollowUps({')
    expect(handler).not.toContain('.catch(() => {}) // never block on Slack')
    expect(migration).toContain('unique (thread_id, kind)')
    expect(outbox.indexOf(".from('follow_up_outbox')")).toBeLessThan(
      outbox.indexOf('checkGoogleRankQueue.add('),
    )
  })

  it('leaves failed deliveries pending for scheduled reconciliation', () => {
    expect(outbox).toContain("'Follow-up enqueue failed and remains pending'")
    expect(outbox).toContain(".eq('status', 'pending')")
  })
})
