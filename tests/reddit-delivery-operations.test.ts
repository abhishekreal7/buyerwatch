import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { parseHyperbrowserHealthSnapshot } from '../src/lib/reddit-delivery-health'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
  .replace(/\r\n/g, '\n')

describe('Reddit delivery production operations', () => {
  it('accepts only bounded, timestamped Hyperbrowser health snapshots', () => {
    const checkedAt = '2026-08-22T12:00:00.000Z'
    expect(parseHyperbrowserHealthSnapshot(JSON.stringify({
      status: 'ok',
      checkedAt,
      creditsRemaining: 42,
      creditsLimit: 100,
    }))).toEqual({
      status: 'ok',
      checkedAt,
      creditsRemaining: 42,
      creditsLimit: 100,
    })
    expect(parseHyperbrowserHealthSnapshot('{"status":"ok"}')).toBeNull()
    expect(parseHyperbrowserHealthSnapshot('not-json')).toBeNull()
  })

  it('isolates each Reddit profile while enforcing bounded global Hyperbrowser concurrency', () => {
    const provider = source('src/lib/hyperbrowser-reddit.ts')
    const capacity = source('src/lib/reddit-delivery-concurrency.ts')
    expect(provider).not.toContain("SESSION_LOCK_KEY = 'lock:hyperbrowser-reddit-session:v1'")
    expect(provider).toContain('getHyperbrowserRedditProfileLockKey(profileId)')
    expect(provider).toContain("SESSION_SEMAPHORE_KEY = 'semaphore:hyperbrowser-reddit-session:v1'")
    expect(provider).toContain('withRedisSemaphore(')
    expect(provider).toContain('getHyperbrowserRedditMaxConcurrency()')
    expect(capacity).toContain('HYPERBROWSER_REDDIT_MAX_CONCURRENCY')
    expect(provider).toContain('minRetryDelayMs: 250, maxRetryDelayMs: 900')
    expect(provider).toContain("'hyperbrowser_session_busy'")
    expect(provider.indexOf('getHyperbrowserRedditProfileLockKey(profileId)'))
      .toBeLessThan(provider.indexOf('client.createSession'))
  })

  it('checks stale accounts in bounded batches and checks credits separately', () => {
    const canary = source('src/lib/reddit-delivery-canary.ts')
    const route = source('src/app/api/cron/enqueue/route.ts')
    expect(canary).toContain('ACCOUNT_RECHECK_INTERVAL_MS = 6 * 60 * 60_000')
    expect(canary).toContain('CREDIT_INTERVAL_SECONDS = 15 * 60')
    expect(canary).toContain('getRedditCanaryBatchSize')
    expect(canary).toContain(".order('last_verified_at'")
    expect(canary).toContain('fetchHyperbrowserCreditInfo()')
    expect(canary).toContain('fetchHyperbrowserRedditAccountProfile')
    expect(canary).not.toContain('postHyperbrowserRedditReply')
    expect(route).toContain('runRedditDeliveryCanary()')
    expect(route).toMatch(
      /executeMonitor\(\s*forceUserId,\s*forcePlatform,\s*forceTarget,\s*isCloudflareScheduler,\s*\)/,
    )
  })

  it('checks the free RedditAPIs balance endpoint on the scheduler and alerts only on threshold transitions', () => {
    const route = source('src/app/api/cron/enqueue/route.ts')
    const monitor = source('src/lib/redditapis-balance-monitor.ts')
    expect(route).toContain('runRedditApisBalanceMonitor()')
    expect(monitor).toContain('fetchRedditApisAccountStatus()')
    expect(monitor).toContain("kind: 'credits_low'")
    expect(monitor).toContain('CHECK_INTERVAL_SECONDS = 15 * 60')
    expect(monitor).toContain('REDDITAPIS_LOW_BALANCE_USD')
    const capacity = source('src/lib/reddit-discovery-capacity.ts')
    expect(capacity).toContain("balanceState === 'depleted'")
    expect(capacity).toContain("reason: 'provider_balance_depleted'")
    expect(capacity).toContain("mode: 'rss_only'")
  })

  it('alerts on every high-signal delivery failure class with deduplication', () => {
    const alerts = source('src/lib/reddit-delivery-alerts.ts')
    const safety = source('src/lib/reddit-service-safety.ts')
    for (const kind of [
      'reconnect_required',
      'selector_changed',
      'delivery_uncertain',
      'repeated_failures',
      'credits_low',
      'canary_failed',
    ]) expect(alerts).toContain(`'${kind}'`)
    expect(alerts).toContain("'NX'")
    expect(alerts).toContain('new Resend(apiKey).emails.send')
    expect(alerts).toContain('isAllowedSlackWebhookUrl')
    expect(alerts).toContain("input.kind === 'credits_low'")
    expect(safety).toContain("if (input.kind === 'credits_low' && !providerIsExhausted) return null")
    expect(source('supabase/migrations/20260823140000_keep_provider_credit_alerts_admin_only.sql'))
      .toContain("kind = 'credits_low'")
  })

  it('records QStash identity and closes successful outbox deliveries', () => {
    const dispatcher = source('src/lib/backend-maintenance.ts')
    const migration = source('supabase/migrations/20260822230000_reddit_delivery_operations.sql')
    expect(dispatcher).toContain('qstash_message_id: messageId')
    expect(migration).toContain("status = 'completed'")
    expect(migration).toContain('completed_at = now()')
    expect(migration).toContain('permalink = p_permalink')
    expect(migration).toContain('increment_reddit_connection_failure_v1')
  })

  it('probes production externally every fifteen minutes', () => {
    expect(source('.github/workflows/synthetic.yml')).toContain("cron: '*/15 * * * *'")
  })
})
