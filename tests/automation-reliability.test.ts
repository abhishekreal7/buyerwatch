import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { queuedAutoSendBlockReason } from '../src/lib/auto-send-policy'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const deliveryMigration = read('supabase/migrations/20260806100000_automation_delivery_reliability.sql')
const sendProcessor = read('src/lib/send-reply.ts')
const maintenance = read('src/lib/backend-maintenance.ts')
const serverlessMonitor = read('src/lib/serverless-monitor.ts')
const workerRuntime = read('worker/runtime.ts')
const workerScorer = read('worker/handlers/score-post.ts')

const activeAutoSendProfile = {
  plan: 'pro',
  auto_send_enabled: true,
  auto_send_daily_limit: 3,
  auto_send_platforms: ['bluesky'],
  auto_send_communities: [],
}

describe('automation delivery reliability', () => {
  it('re-checks the customer’s current auto-send policy immediately before posting', () => {
    expect(queuedAutoSendBlockReason(
      { ...activeAutoSendProfile, auto_send_enabled: false },
      'bluesky',
      'founders',
      { redditDirectPostingEnabled: false },
    )).toBe('auto_send_disabled')
    expect(queuedAutoSendBlockReason(
      { ...activeAutoSendProfile, plan: 'starter' },
      'bluesky',
      'founders',
      { redditDirectPostingEnabled: false },
    )).toBe('auto_send_plan_ineligible')
    expect(queuedAutoSendBlockReason(
      { ...activeAutoSendProfile, auto_send_platforms: ['reddit'] },
      'bluesky',
      'founders',
      { redditDirectPostingEnabled: false },
    )).toBe('auto_send_platform_disabled')
    expect(queuedAutoSendBlockReason(
      { ...activeAutoSendProfile, auto_send_communities: ['founders'] },
      'bluesky',
      'other-community',
      { redditDirectPostingEnabled: false },
    )).toBe('auto_send_target_out_of_scope')
  })

  it('cancels queued automation rather than sending after policy or connection changes', () => {
    expect(sendProcessor).toContain('queuedAutoSendBlockReason(')
    expect(sendProcessor).toContain("status: 'cancelled'")
    expect(sendProcessor).toContain("reason = 'platform_connection_removed'")
  })

  it('requeues stale automatic handoffs a bounded number of times and surfaces exhaustion', () => {
    expect(deliveryMigration).toContain("check (status in ('pending', 'dispatched', 'cancelled', 'failed'))")
    expect(deliveryMigration).toContain('create or replace function public.requeue_stale_auto_send_outbox')
    expect(deliveryMigration).toContain("outbox.attempts < p_max_dispatch_attempts")
    expect(deliveryMigration).toContain("status = 'failed'")
    expect(deliveryMigration).toContain("'failed_retryable'")
    expect(maintenance).toContain("'requeue_stale_auto_send_outbox'")
    expect(maintenance).toContain('p_max_dispatch_attempts: 3')
  })

  it('turns off queued auto-send on a plan downgrade at the database boundary', () => {
    expect(deliveryMigration).toContain("not in ('pro', 'growth')")
    expect(deliveryMigration).toContain('create trigger a00_profiles_automation_plan_entitlement')
    expect(deliveryMigration).toContain('create trigger profiles_cancel_auto_send_outbox')
  })

  it('coordinates redundant schedulers and score workers through shared Redis leases', () => {
    expect(serverlessMonitor).toContain('MONITORING_RUN_LOCK_KEY')
    expect(workerRuntime).toContain('MONITORING_RUN_LOCK_KEY')
    expect(serverlessMonitor).toContain('await recoverStaleSends(now)')
    expect(workerScorer).toContain('withScoreLock(')
  })
})
