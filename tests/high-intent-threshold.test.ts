import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  DEFAULT_HIGH_INTENT_THRESHOLD,
  HIGH_INTENT_THRESHOLD_MAX,
  HIGH_INTENT_THRESHOLD_MIN,
  normalizeHighIntentThreshold,
} from '../src/lib/high-intent-threshold'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

describe('high-intent threshold preference', () => {
  it('defaults missing and malformed values to 80', () => {
    expect(normalizeHighIntentThreshold(undefined)).toBe(DEFAULT_HIGH_INTENT_THRESHOLD)
    expect(normalizeHighIntentThreshold(null)).toBe(DEFAULT_HIGH_INTENT_THRESHOLD)
    expect(normalizeHighIntentThreshold('not-a-score')).toBe(DEFAULT_HIGH_INTENT_THRESHOLD)
  })

  it('accepts in-range numeric values and rounds fractions', () => {
    expect(normalizeHighIntentThreshold(60)).toBe(60)
    expect(normalizeHighIntentThreshold('83')).toBe(83)
    expect(normalizeHighIntentThreshold(94.6)).toBe(95)
  })

  it('clamps values to the supported 60–95 range', () => {
    expect(normalizeHighIntentThreshold(40)).toBe(HIGH_INTENT_THRESHOLD_MIN)
    expect(normalizeHighIntentThreshold(100)).toBe(HIGH_INTENT_THRESHOLD_MAX)
  })

  it('keeps dashboard analytics separate from canonical AI classification', () => {
    const dashboard = source('src/app/(dashboard)/dashboard/page.tsx')
    const analytics = source('src/app/(dashboard)/analytics/page.tsx')
    const searchRoute = source('src/app/api/conversations/search/route.ts')
    const scorer = source('src/lib/intent-scorer.ts')

    expect(dashboard).toContain('normalizeHighIntentThreshold')
    expect(analytics).toContain('normalizeHighIntentThreshold')
    expect(searchRoute).toContain('normalizeHighIntentThreshold')
    expect(searchRoute).toContain("threadsQuery.gte('intent_score', threshold)")
    expect(searchRoute).not.toContain('Number.isFinite(threshold)')
    expect(dashboard).not.toMatch(/\.gte\('intent_score',\s*80\)/)
    expect(scorer).toContain("if (score >= 80) return 'buying'")
    expect(scorer).not.toContain('high_intent_threshold')
  })

  it('persists a database-constrained preference independently of Slack', () => {
    const migration = source('supabase/migrations/20260806023000_add_high_intent_threshold.sql')
    const permissionsMigration = source('supabase/migrations/20260806060000_grant_high_intent_threshold_update.sql')
    const settings = source('src/app/(dashboard)/settings/SettingsPage.tsx')

    expect(migration).toContain('check (high_intent_threshold between 60 and 95)')
    expect(migration).toContain('alter column high_intent_threshold set default 80')
    expect(permissionsMigration).toContain('grant update (high_intent_threshold) on public.profiles to authenticated')
    expect(settings).toContain('high_intent_threshold: normalizeHighIntentThreshold(highIntentThreshold)')
    expect(settings).toContain('threshold: slack.threshold')
  })
})
