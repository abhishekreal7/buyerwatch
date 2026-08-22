import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const migration = read('supabase/migrations/20260808210000_redditapis_direct_delivery.sql')
const connectionRoute = read('src/app/api/settings/reddit/route.ts')
const providerClient = read('src/lib/redditapis-client.ts')
const redditPost = read('src/lib/reddit-post.ts')
const redditSession = read('src/lib/reddit-session.ts')
const sessionStore = read('src/lib/reddit-session.ts')
const sender = read('src/lib/send-reply.ts')
const settings = read('src/app/(dashboard)/settings/page.tsx')
const sendRoute = read('src/app/api/replies/send/route.ts')
const autoSendRoute = read('src/app/api/settings/autosend/route.ts')
const connectionsRoute = read('src/app/api/settings/connections/route.ts')

describe('RedditAPIs direct-delivery architecture', () => {
  it('keeps worker-shared Reddit delivery modules free of Next-only runtime markers', () => {
    expect(redditPost).not.toContain("import 'server-only'")
    expect(redditSession).not.toContain("import 'server-only'")
    expect(redditSession).not.toContain("from './admin'")
  })

  it('stores encrypted session cookies in a service-role-only table', () => {
    expect(migration).toContain('create table if not exists public.reddit_connection_secrets')
    expect(migration).toContain('session_ciphertext text not null')
    expect(migration).toContain('alter table public.reddit_connection_secrets enable row level security')
    expect(migration).toContain('revoke all on table public.reddit_connection_secrets')
    expect(migration).toContain('to service_role')
    expect(migration).not.toMatch(/password\s+text/i)
    expect(migration).not.toMatch(/totp(?:_secret)?\s+text/i)
    expect(sessionStore).toContain('encrypt(JSON.stringify(stored))')
  })

  it('uses credentials only for a one-time provider login', () => {
    expect(connectionRoute).toContain('loginRedditAccount')
    expect(connectionRoute).toContain('saveRedditApisConnection')
    expect(providerClient).toContain("'/api/reddit/login'")
    expect(providerClient).toContain("method: 'http'")
    expect(settings).toContain('BuyerWatch never stores your password or 2FA secret')
    expect(sessionStore).not.toContain('password')
    expect(sessionStore).not.toContain('totpSecret')
    expect(connectionRoute).toContain('isTrustedSameOriginMutation')
    expect(connectionRoute).toContain("error: 'untrusted_request_origin'")
  })

  it('protects every cookie-authenticated delivery control from cross-site mutation', () => {
    for (const route of [connectionRoute, sendRoute, autoSendRoute, connectionsRoute]) {
      expect(route).toContain('isTrustedSameOriginMutation')
      expect(route).toContain("error: 'untrusted_request_origin'")
    }
  })

  it('preflights every Reddit target before using the v2 comment endpoint', () => {
    expect(redditPost.indexOf('fetchRedditPostSnapshot'))
      .toBeLessThan(redditPost.indexOf('postRedditApisComment'))
    expect(redditPost).toContain('reddit_post_locked')
    expect(redditPost).toContain('reddit_self_reply_blocked')
    expect(redditPost).toContain('reddit_nsfw_post_requires_review')
    expect(redditPost).toContain('reddit_post_age_unverified')
    expect(redditPost).toContain('reddit_post_outside_reply_window')
    expect(providerClient).toContain("'/api/reddit/v2/comment'")
    expect(providerClient).toContain('post_url: target.canonicalUrl')
    expect(providerClient).toContain('pageNumber < 5')
  })

  it('never retries an ambiguous write outcome', () => {
    expect(providerClient).toContain("'reddit_delivery_outcome_unknown'")
    expect(providerClient).toContain('deliveryUncertain')
    expect(sender).toContain('const deliveryUncertain')
    expect(sender).toContain("rpc('mark_send_reconciliation'")
    expect(sender).toContain('if (deliveryUncertain) context.discard?.()')
  })

  it('has removed the browser extension runtime and packaged artifact', () => {
    expect(existsSync(join(process.cwd(), 'browser-extension', 'manifest.json'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'public', 'buyerwatch-extension.zip'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src', 'app', 'api', 'extension', 'ingest', 'route.ts'))).toBe(false)
    expect(existsSync(join(process.cwd(), 'src', 'components', 'ExtensionInstall.tsx'))).toBe(false)
  })
})
