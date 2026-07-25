import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getSendReplyJobId } from '../src/lib/reply-jobs'
import { isPollingDue } from '../src/lib/plan-limits'

const migration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260725_production_hardening.sql'),
  'utf8',
)
const readinessMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260726_production_readiness.sql'),
  'utf8',
)
const qualityMigration = readFileSync(
  join(process.cwd(), 'supabase/migrations/20260727_product_quality_hardening.sql'),
  'utf8',
)

describe('plan and scheduler contracts', () => {
  it('applies explicit polling intervals to every plan', () => {
    const now = Date.parse('2026-07-24T12:00:00.000Z')
    expect(isPollingDue('growth', '2026-07-24T11:44:59.000Z', now)).toBe(true)
    expect(isPollingDue('growth', '2026-07-24T11:50:00.000Z', now)).toBe(false)
    expect(isPollingDue('pro', '2026-07-24T11:29:59.000Z', now)).toBe(true)
    expect(isPollingDue('free', '2026-07-24T06:00:01.000Z', now)).toBe(false)
  })

  it('keeps reply job identity stable across manual and automatic producers', () => {
    expect(getSendReplyJobId('thread-123')).toBe('send-reply-thread-123')
    expect(getSendReplyJobId('thread-123')).toBe(getSendReplyJobId('thread-123'))
  })

  it('keeps provider-accepted replies non-sendable when persistence needs reconciliation', () => {
    expect(migration).toContain("'send_reconciliation_required'")
    expect(migration).toContain("'reconciliation_required'")
    expect(migration).not.toMatch(/status = 'sending'\s+for update/i)
  })

  it('resolves send reconciliation transactionally and only as service role', () => {
    expect(readinessMigration).toContain('resolve_send_reconciliation')
    expect(readinessMigration).toContain("auth.role() <> 'service_role'")
    expect(readinessMigration).toContain("'resolved_replied'")
    expect(readinessMigration).toContain("'resolved_not_sent'")
    expect(readinessMigration).toContain("status = 'send_reconciliation_required'")
    expect(readinessMigration).toContain('for update')
  })

  it('keeps future browser ingestion service-write-only and idempotent', () => {
    expect(readinessMigration).toContain('create table if not exists ingestion_events')
    expect(readinessMigration).toContain('unique (user_id, source, source_event_id)')
    expect(readinessMigration).toContain(
      'revoke insert, update, delete on ingestion_events from anon, authenticated',
    )
  })

  it('persists explainable intent evidence and one canonical draft per thread', () => {
    expect(qualityMigration).toContain('intent_label text')
    expect(qualityMigration).toContain("matched_signals text[] not null default '{}'")
    expect(qualityMigration).toContain("quality_issues text[] not null default '{}'")
    expect(qualityMigration).toContain('automation_reason text')
    expect(qualityMigration).toContain('reply_analytics_thread_uidx')
    expect(qualityMigration).toContain('on conflict (thread_id) do update')
  })

  it('enforces the user automation threshold as a bounded database value', () => {
    expect(qualityMigration).toContain('auto_send_threshold between 70 and 100')
  })
})

describe('database security and billing migration contracts', () => {
  it('removes direct billing-field updates from authenticated users', () => {
    expect(migration).toContain('revoke update on profiles from authenticated')
    expect(migration).not.toMatch(/grant update \([\s\S]*?\bplan\b[\s\S]*?\) on profiles to authenticated/)
  })

  it('enforces canonical keyword limits inside a serialized transaction', () => {
    expect(migration).toContain('pg_advisory_xact_lock')
    expect(migration).toContain("when 'growth' then 50 when 'pro' then 10 else 1")
    expect(migration).toContain('keyword plan limit reached')
  })

  it('makes billing events idempotent and subscription-order aware', () => {
    expect(migration).toContain('provider_event_id text primary key')
    expect(migration).toContain("return 'duplicate'")
    expect(migration).toContain('v_current_subscription is distinct from p_subscription_id')
    expect(migration).toContain("p_event_type = 'subscription.updated'")
    expect(migration).toContain('p_event_at < v_current_updated_at')
  })

  it('authorizes and fixes the search path of every privileged function', () => {
    const functions = migration.split(/create or replace function /i).slice(1)
    const privileged = functions.filter((definition) => /security definer/i.test(definition))
    expect(privileged.length).toBeGreaterThan(0)
    for (const definition of privileged) {
      expect(definition).toMatch(/set search_path = public, pg_temp/i)
      expect(definition).toMatch(/auth\.(uid|role)\(\)/i)
    }
  })
})
