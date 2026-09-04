import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('low-severity security remediation', () => {
  it('keeps logout POST-only and hardens reset sessions', () => {
    const signout = source('src/app/api/auth/signout/route.ts')
    expect(signout).not.toContain('export async function GET')
    expect(signout).toContain('isTrustedSameOriginMutation(request)')
    expect(signout).toContain("status: 403")
    const auth = source('src/app/actions/auth.ts')
    expect(auth).toContain('password.length < 12')
    expect(auth).toContain("signOut({ scope: 'global' })")
    const resetPage = source('src/app/reset-password/page.tsx')
    expect(resetPage).toContain('minLength={12}')
    expect(resetPage).toContain('Min 12 characters')
  })

  it('protects cookie-authenticated mutations from cross-site requests', () => {
    for (const path of [
      'src/app/api/account/route.ts',
      'src/app/api/billing/checkout/route.ts',
      'src/app/api/billing/portal/route.ts',
      'src/app/api/feedback/route.ts',
      'src/app/api/keywords/add/route.ts',
      'src/app/api/keywords/fetch-now/route.ts',
      'src/app/api/onboarding/ai-suggest/route.ts',
      'src/app/api/replies/generate/route.ts',
      'src/app/api/replies/mark-posted/route.ts',
      'src/app/api/settings/bluesky/route.ts',
      'src/app/api/settings/slack/route.ts',
      'src/app/api/settings/test-slack/route.ts',
    ]) {
      expect(source(path), path).toContain('isTrustedSameOriginMutation')
      expect(source(path), path).toContain("status: 403")
    }
  })

  it('sets secure production cookies in every Supabase client factory', () => {
    for (const path of [
      'src/utils/supabase/server.ts',
      'src/utils/supabase/middleware.ts',
      'src/utils/supabase/client.ts',
    ]) {
      expect(source(path)).toContain("cookieOptions: { secure: process.env.NODE_ENV === 'production' }")
    }
  })

  it('restricts branded redirects to safe HTTPS destinations', () => {
    const outbound = source('src/lib/security/outbound-url.ts')
    expect(outbound).toContain('getSafeAttributionRedirectUrl')
    expect(outbound).toContain("url.protocol !== 'https:'")
    expect(outbound).toContain("hostname.endsWith('.localhost')")
    expect(source('src/app/r/[shortcode]/route.ts')).toContain('getSafeAttributionRedirectUrl')
  })

  it('aligns bootstrap usage permissions and ignores Wrangler state', () => {
    const schema = source('supabase/schema.sql')
    expect(schema).toContain('policy "own usage" on usage_logs for select')
    expect(schema).toContain("if auth.role() <> 'service_role' then")
    expect(source('supabase/migrations/20260824125000_harden_usage_rpc_permissions.sql'))
      .toContain("if auth.role() <> 'service_role' then")
    expect(source('.gitignore')).toContain('/cloudflare/.wrangler/')
  })

  it('keeps BullMQ off the legacy url.parse Redis client', () => {
    const packageJson = JSON.parse(source('package.json')) as {
      dependencies?: { bullmq?: string }
    }
    const packageLock = source('package-lock.json')

    expect(packageJson.dependencies?.bullmq).toBe('^5.81.4')
    expect(packageLock).not.toContain('"ioredis": "5.10.1"')
  })
})
