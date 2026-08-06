import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const generateDraftRoute = read('src/app/api/replies/generate/route.ts')
const conversationSearchRoute = read('src/app/api/conversations/search/route.ts')
const rateLimits = read('src/lib/ratelimit.ts')
const keywordRlsMigration = read('supabase/migrations/20260806050000_align_keyword_rls_with_plan_limits.sql')

describe('production reliability regressions', () => {
  it('releases the monthly draft allowance when persisting a generated draft fails', () => {
    const saveFailureBlock = generateDraftRoute.match(
      /if \(saveError\) \{([\s\S]*?)return NextResponse\.json\(\{ error: 'draft_save_failed' \}/,
    )?.[1] ?? ''

    expect(saveFailureBlock).toContain("admin.rpc('release_monthly_draft'")
    expect(saveFailureBlock).toContain('p_user_id: user.id')
  })

  it('gives authenticated type-ahead search a dedicated rate limit', () => {
    expect(rateLimits).toContain("export const searchRateLimit = createLimiter(60, '1 m'")
    expect(conversationSearchRoute).toContain('searchRateLimit.limit(`conversation-search:${user.id}:${await getIp()}`)')
    expect(conversationSearchRoute).toContain("{ error: 'rate_limited' }, { status: 429 }")
  })

  it('keeps the keyword RLS guard aligned with paid-plan entitlements', () => {
    expect(keywordRlsMigration).toContain("when 'starter' then 5")
    expect(keywordRlsMigration).toContain("when 'pro' then 10")
    expect(keywordRlsMigration).toContain("when 'growth' then 50")
    expect(keywordRlsMigration).toMatch(/else 1\s+end/)
  })
})
