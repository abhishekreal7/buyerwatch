import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { BUYERWATCH_CONNECTOR_ID } from '../src/lib/browser-connector-client'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const manifest = JSON.parse(read('browser-connector/manifest.json')) as Record<string, unknown>
const background = read('browser-connector/background.js')
const content = read('browser-connector/content.js')
const route = read('src/app/api/settings/reddit/browser/route.ts')
const migration = read('supabase/migrations/20260822153000_browser_relay_reddit_connection.sql')

describe('BuyerWatch Reddit browser connector', () => {
  it('uses the stable reviewed extension identity and narrow origins', () => {
    expect(BUYERWATCH_CONNECTOR_ID).toBe('akfjpaggkndebeidadabipjpkbchlhfe')
    expect(manifest.manifest_version).toBe(3)
    expect(manifest.permissions).toEqual(['tabs'])
    expect(manifest.externally_connectable).toEqual({
      matches: ['https://buyerwatch.co/*', 'https://www.buyerwatch.co/*'],
      accepts_tls_channel_id: false,
    })
    expect(background).toContain("'https://buyerwatch.co'")
    expect(background).not.toContain('chrome.cookies')
    expect(content).not.toMatch(/\.click\(|fetch\(|XMLHttpRequest/)
  })

  it('connects only through an authenticated same-origin API mutation', () => {
    expect(route).toContain('isTrustedSameOriginMutation')
    expect(route).toContain('supabase.auth.getUser()')
    expect(route).toContain('authRateLimit')
    expect(route).toContain('normalizeRedditUsername')
    expect(route).toContain('saveBrowserRelayRedditConnection')
    expect(route).not.toMatch(/password|cookie/i)
  })

  it('stores only an encrypted browser-relay identity', () => {
    expect(migration).toContain("'browser_relay'")
    expect(migration).toContain('session_version in (1, 2, 3)')
    expect(migration).toContain('save_browser_relay_reddit_connection_v1')
    expect(migration).toContain('to service_role')
    expect(migration).not.toMatch(/password\s+text|cookie\s+text/i)
  })

  it('packages a user-installable connector artifact', () => {
    expect(existsSync(join(process.cwd(), 'public', 'buyerwatch-reddit-connector.zip'))).toBe(true)
  })
})
