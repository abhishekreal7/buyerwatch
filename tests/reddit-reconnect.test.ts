import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('managed Reddit reconnect', () => {
  it('preserves a managed profile when the user disconnects', () => {
    const route = read('src/app/api/settings/connections/route.ts')
    expect(route).toContain("redditSecret?.provider === 'hyperbrowser'")
    expect(route).toContain("status: 'disconnected'")
    expect(route.indexOf("status: 'disconnected'"))
      .toBeLessThan(route.indexOf(".from('platform_connections')\n      .delete()"))
  })

  it('maps the paused durable profile to a disconnected UI state', () => {
    const session = read('src/lib/reddit-session.ts')
    const migration = read('supabase/migrations/20260828134000_reversible_managed_reddit_disconnect.sql')
    expect(session).toContain("secret.status === 'disconnected'")
    expect(session).toContain("? 'missing'")
    expect(migration).toContain("'active', 'disconnected', 'reauth_required', 'error'")
  })
})
