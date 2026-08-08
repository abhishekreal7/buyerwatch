import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('intent quality recovery', () => {
  it('renders an absent score as awaiting analysis rather than zero relevance', () => {
    const badge = source('src/components/IntentBadge.tsx')

    expect(badge).toContain("score === null ? null")
    expect(badge).toContain("? 'Awaiting analysis'")
    expect(badge).toContain('normalizedScore !== null')
  })

  it('preserves null intent scores in the dashboard mapper and excludes raw candidates', () => {
    const dashboard = source('src/app/(dashboard)/dashboard/page.tsx')
    const searchRoute = source('src/app/api/conversations/search/route.ts')

    expect(dashboard).toContain('thread.intent_score === null')
    expect(dashboard).toContain(".not('intent_score', 'is', null)")
    expect(searchRoute).toContain(".not('intent_score', 'is', null)")
  })

  it('rejects before reserving a signal and terminally dismisses exhausted-limit candidates', () => {
    const handler = source('worker/handlers/score-post.ts')
    const rejection = handler.indexOf('if (!preflight.isQualifiedCandidate)')
    const reservation = handler.indexOf('const canProcessSignal = await reserveMonthlySignal')

    expect(rejection).toBeGreaterThan(-1)
    expect(reservation).toBeGreaterThan(rejection)
    expect(handler).toContain("automationReason: 'signal_limit_reached'")
    expect(handler).toContain("automationReason: 'preflight_rejected'")
    expect(handler).toContain('scoreResult.score < ACTIONABLE_INTENT_THRESHOLD')
  })

  it('clears only unscored pending discovery rows during the one-time recovery', () => {
    const migration = source('supabase/migrations/20260806210000_intent_quality_recovery.sql')

    expect(migration).toContain("status = 'pending'")
    expect(migration).toContain('intent_score is null')
    expect(migration).toContain("automation_reason = 'analysis_pending'")
    expect(migration).toContain("status = 'dismissed'")
  })
})
