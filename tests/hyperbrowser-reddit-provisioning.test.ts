import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('Hyperbrowser Reddit connection provisioning', () => {
  it('accepts only Hyperbrowser live-view origins', () => {
    const provisioner = read('src/lib/hyperbrowser-reddit-provisioning.ts')
    const settings = read('src/app/(dashboard)/settings/SettingsPage.tsx')
    expect(provisioner).toContain("url.hostname.endsWith('.hxproxy.io')")
    expect(settings).toContain("liveUrl.hostname.endsWith('.hxproxy.io')")
    expect(provisioner).toContain("url.protocol === 'https:'")
  })

  it('does not leave a workspace without a connection action', () => {
    const settings = read('src/app/(dashboard)/settings/SettingsPage.tsx')

    expect(settings).toContain("fetch('/api/settings/reddit/hyperbrowser/session'")
    expect(settings).toContain('Open secure Reddit sign-in')
    expect(settings).not.toContain('Secure Reddit account access is being prepared for this workspace')
  })

  it('creates a pending profile before it can become active', () => {
    const route = read('src/app/api/settings/reddit/hyperbrowser/session/route.ts')
    const store = read('src/lib/reddit-session.ts')
    const migration = read('supabase/migrations/20260831120000_hyperbrowser_reddit_provisioning.sql')

    expect(route).toContain('createHyperbrowserRedditSignInSession')
    expect(route).toContain('savePendingHyperbrowserRedditConnection')
    expect(store).toContain("status: 'reauth_required'")
    expect(migration).toContain("'reauth_required'")
    expect(migration).toContain('to service_role')
  })

  it('stops the interactive session before verifying the persisted identity', () => {
    const verifyRoute = read('src/app/api/settings/reddit/route.ts')

    expect(verifyRoute).toContain('finishHyperbrowserRedditSignInSession')
    expect(verifyRoute.indexOf('await finishHyperbrowserRedditSignInSession'))
      .toBeLessThan(verifyRoute.indexOf('const profile = await fetchHyperbrowserRedditAccountProfile'))
  })

  it('uses the native fetch transport so Hyperbrowser requests cannot trigger Node url.parse warnings', () => {
    const delivery = read('src/lib/hyperbrowser-reddit.ts')
    const provisioner = read('src/lib/hyperbrowser-reddit-provisioning.ts')

    expect(delivery).not.toContain("from '@hyperbrowser/sdk'")
    expect(provisioner).not.toContain("from '@hyperbrowser/sdk'")
    expect(read('src/lib/hyperbrowser-client.ts')).toContain('fetch(url,')
    expect(read('src/lib/hyperbrowser-client.ts')).not.toContain('node-fetch')
  })

  it('refreshes an initially absent live-view URL before returning the browser handoff', () => {
    const provisioner = read('src/lib/hyperbrowser-reddit-provisioning.ts')

    expect(provisioner).toContain('const session = await client.getSession(createdSession.id, {')
    expect(provisioner).toContain('liveViewTtlSeconds: LIVE_VIEW_TTL_SECONDS')
  })

  it('correctly parses raw session cookie and multi-cookie strings', async () => {
    const { parseRedditCookies } = await import('../src/lib/hyperbrowser-reddit-provisioning')

    // Raw value
    const raw = parseRedditCookies('1234567890abcdef')
    expect(raw).toHaveLength(1)
    expect(raw[0].name).toBe('reddit_session')
    expect(raw[0].value).toBe('1234567890abcdef')
    expect(raw[0].domain).toBe('.reddit.com')

    // Key=value format
    const kv = parseRedditCookies('reddit_session=my_session_token; token_v2=token_val')
    expect(kv).toHaveLength(2)
    expect(kv.find(c => c.name === 'reddit_session')?.value).toBe('my_session_token')
    expect(kv.find(c => c.name === 'token_v2')?.value).toBe('token_val')

    // Empty
    expect(parseRedditCookies('')).toEqual([])
  })
})
