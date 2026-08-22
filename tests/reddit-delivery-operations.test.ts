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

  it('serializes every Hyperbrowser session with one distributed lock', () => {
    const provider = source('src/lib/hyperbrowser-reddit.ts')
    expect(provider).toContain("SESSION_LOCK_KEY = 'lock:hyperbrowser-reddit-session:v1'")
    expect(provider).toContain('withRedisLock(redis, SESSION_LOCK_KEY')
    expect(provider).toContain("'hyperbrowser_session_busy'")
    expect(provider.indexOf('withRedisLock(redis, SESSION_LOCK_KEY'))
      .toBeLessThan(provider.indexOf('client.sessions.create'))
  })

  it('runs a low-frequency read-only identity canary and checks credits', () => {
    const canary = source('src/lib/reddit-delivery-canary.ts')
    const route = source('src/app/api/cron/enqueue/route.ts')
    expect(canary).toContain('SUCCESS_INTERVAL_SECONDS = 6 * 60 * 60')
    expect(canary).toContain('fetchHyperbrowserCreditInfo()')
    expect(canary).toContain('fetchHyperbrowserRedditAccountProfile')
    expect(canary).not.toContain('postHyperbrowserRedditReply')
    expect(route).toContain('runRedditDeliveryCanary()')
  })

  it('alerts on every high-signal delivery failure class with deduplication', () => {
    const alerts = source('src/lib/reddit-delivery-alerts.ts')
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
