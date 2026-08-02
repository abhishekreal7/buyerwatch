import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { getPlatformCapabilities } from '../src/lib/platform-capabilities'
import { calculateAutomationDecision } from '../src/lib/confidence-engine'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('earned automation safety contracts', () => {
  it('keeps Reddit human-submitted unless an approved direct provider exists', () => {
    const assisted = getPlatformCapabilities('reddit')
    expect(assisted.delivery).toBe('assisted')
    expect(assisted.requiresUserSubmit).toBe(true)
    expect(assisted.proof).toBe('extension_confirmation')

    const direct = getPlatformCapabilities('reddit', { redditDirectPosting: true })
    expect(direct.delivery).toBe('direct')
    expect(direct.requiresUserSubmit).toBe(false)
  })

  it('allows direct automation only on a supported direct provider', () => {
    expect(getPlatformCapabilities('bluesky')).toMatchObject({
      delivery: 'direct',
      identity: 'customer_account',
      compliance: 'approved',
    })
    expect(getPlatformCapabilities('x').delivery).toBe('unsupported')
    expect(getPlatformCapabilities('threads').delivery).toBe('unsupported')
  })

  it('never lowers a configured confidence boundary', () => {
    const decision = calculateAutomationDecision({
      userTrust: 100,
      communityTrust: 100,
      learnedThreshold: 82,
      configuredThreshold: 98,
    })
    expect(decision.dynamicThreshold).toBe(98)
    expect(decision.approved).toBe(true)
    expect(decision.configuredThreshold).toBe(98)
  })

  it('enforces the trust gate at both API and database boundaries', () => {
    const route = read('src/app/api/settings/autosend/route.ts')
    const migration = read('supabase/migrations/20260802160000_earned_automation_v1.sql')
    expect(route).toContain('reviewed < 10')
    expect(route).toContain('activation_acknowledged')
    expect(migration).toContain('enforce_earned_automation_gate')
    expect(migration).toContain('earned automation requires ten verified reviews')
  })

  it('stores immutable lifecycle events and automation decisions', () => {
    const migration = read('supabase/migrations/20260802160000_earned_automation_v1.sql')
    expect(migration).toContain('create table if not exists public.engagement_events')
    expect(migration).toContain('create table if not exists public.automation_decisions')
    expect(migration).toContain('unique (user_id, idempotency_key)')
    expect(migration).toContain('revoke insert, update, delete')
  })

  it('never gives the extension authority to submit a Reddit reply', () => {
    const content = read('browser-extension/content.js')
    const manifest = JSON.parse(read('browser-extension/manifest.json')) as {
      permissions: string[]
    }
    expect(content).not.toMatch(/\.click\(\).*submit/i)
    expect(manifest.permissions).not.toContain('scripting')
    expect(manifest.permissions).not.toContain('tabs')
  })
})
