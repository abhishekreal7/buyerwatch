import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { queuedAutoSendBlockReason } from '../src/lib/auto-send-policy'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const deliveryMigration = read('supabase/migrations/20260806100000_automation_delivery_reliability.sql')
const starterAutomationMigration = read('supabase/migrations/20260825050000_starter_guarded_auto_send.sql')
const instantAutopilotMigration = read('supabase/migrations/20260827130000_instant_autopilot_trial.sql')
const instantAutopilotExpiryMigration = read('supabase/migrations/20260827131000_expire_instant_autopilot_with_trial.sql')
const allPlansInstantAutopilotMigration = read('supabase/migrations/20260827132000_instant_autopilot_all_paid_plans.sql')
const sendProcessor = read('src/lib/send-reply.ts')
const billingWebhook = read('src/app/api/billing/webhook/route.ts')
const autoSendSettings = read('src/app/api/settings/autosend/route.ts')
const settingsPage = read('src/app/(dashboard)/settings/SettingsPage.tsx')
const maintenance = read('src/lib/backend-maintenance.ts')
const serverlessMonitor = read('src/lib/serverless-monitor.ts')
const workerRuntime = read('worker/runtime.ts')
const workerScorer = read('worker/handlers/score-post.ts')

const activeAutoSendProfile = {
  plan: 'pro',
  billing_status: 'active',
  billing_subscription_id: 'sub_test',
  auto_send_enabled: true,
  auto_send_daily_limit: 3,
  auto_send_platforms: ['bluesky'],
  auto_send_communities: [],
}

describe('automation delivery reliability', () => {
  it('re-checks the customer’s current auto-send policy immediately before posting', () => {
    expect(queuedAutoSendBlockReason(
      { ...activeAutoSendProfile, billing_status: 'free' },
      'bluesky',
      'founders',
      { redditDirectPostingEnabled: false },
    )).toBe('auto_send_plan_ineligible')
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
    )).toBeNull()
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

  it('keeps Starter eligible while turning off queued auto-send on a downgrade to Free', () => {
    expect(starterAutomationMigration).toContain("in ('starter', 'pro', 'growth')")
    expect(starterAutomationMigration).toContain("not in ('starter', 'pro', 'growth')")
    expect(deliveryMigration).toContain('create trigger a00_profiles_automation_plan_entitlement')
    expect(deliveryMigration).toContain('create trigger profiles_cancel_auto_send_outbox')
  })

  it('makes the Starter trial bypass one-time, atomic, and fail-closed', () => {
    expect(instantAutopilotMigration).toContain('grant_instant_autopilot_trial')
    expect(instantAutopilotMigration).toContain('claim_instant_autopilot_send')
    expect(instantAutopilotMigration).toContain('consume_instant_autopilot_send')
    expect(instantAutopilotMigration).toContain("instant_autopilot_used_at is null")
    expect(instantAutopilotMigration).toContain('auto_send_threshold >= 90')
    expect(instantAutopilotMigration).toContain('auto_send_daily_limit = 1')
    expect(instantAutopilotExpiryMigration).toContain('instant_autopilot_expires_at > now()')
    expect(instantAutopilotExpiryMigration).toContain("billing_period_ends_at <= coalesce(billing_updated_at, now()) + interval '8 days'")
    expect(sendProcessor).toContain("instantClaim === 'unavailable'")
    expect(sendProcessor).toContain('consumeInstantAutopilotAllowance')
    expect(sendProcessor).toContain("source: triggerType === 'auto'")
    expect(billingWebhook).toContain("['starter', 'pro', 'growth'].includes(plan)")
    expect(billingWebhook).toContain('data.trial_period_days ?? metadata.trial_days')
    expect(billingWebhook).toContain('grant_instant_autopilot_trial')
    expect(autoSendSettings).toContain('instant_autopilot_expires_at')
    expect(autoSendSettings).toContain('dailyLimit = 1')
    expect(settingsPage).toContain('Trial auto-send')
    expect(settingsPage).toContain('One safeguarded automatic reply is included with your 7-day Starter trial.')
    expect(settingsPage).toContain("? 'Ready'")
    expect(settingsPage).toContain("? 'Completed'")
    expect(allPlansInstantAutopilotMigration).toContain("plan in ('starter', 'pro', 'growth')")
    expect(allPlansInstantAutopilotMigration).toContain("instant_autopilot_used_at is null")
  })

  it('coordinates redundant schedulers and score workers through shared Redis leases', () => {
    expect(serverlessMonitor).toContain('MONITORING_RUN_LOCK_KEY')
    expect(workerRuntime).toContain('MONITORING_RUN_LOCK_KEY')
    expect(serverlessMonitor).toContain('await recoverStaleSends(now)')
    expect(workerScorer).toContain('withScoreLock(')
  })
})
