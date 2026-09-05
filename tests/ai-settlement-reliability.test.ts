import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('durable AI settlement', () => {
  const migration = source('supabase/migrations/20260824121000_durable_ai_settlement.sql')
  const settlement = source('src/lib/ai-settlement.ts')
  const route = source('src/app/api/jobs/ai-settlement/route.ts')
  const generator = source('src/app/api/replies/generate/route.ts')
  const worker = source('worker/handlers/score-post.ts')

  it('keeps every pending reservation inside the monthly caps', () => {
    expect(migration).toContain("and status = 'pending'\n    and created_at >= v_month")
    expect(migration).not.toContain("created_at >= now() - interval '10 minutes'")
  })

  it('applies retries idempotently at the database boundary', () => {
    expect(migration).toContain('create table if not exists public.ai_settlement_events')
    expect(migration).toContain('on conflict (id) do nothing')
    expect(migration).toContain('apply_ai_settlement_v1')
  })

  it('uses signed bounded QStash retry delivery', () => {
    expect(settlement).toContain("publishQStashJson('/api/jobs/ai-settlement'")
    expect(route).toContain('readTextBody(request, 16_384)')
    expect(route).toContain('verifyQStashRequest(request, rawBody)')
  })

  it('routes API and worker usage through the durable helper', () => {
    expect(generator).toContain('settleAiUsageDurably(admin')
    expect(generator).toContain('releaseMonthlyDraftDurably(admin')
    expect(worker).toContain('settleAiUsageDurably(supabase')
    expect(worker).toContain('releaseMonthlyDraftDurably(supabase')
  })
})
