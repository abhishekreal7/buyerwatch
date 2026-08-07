import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  getDashboardMetricPeriodLabel,
  getDashboardMetricPeriodStart,
  isDashboardMetricPeriod,
} from '../src/lib/dashboard-metric-period'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')
const now = new Date('2026-08-07T12:00:00.000Z')

describe('dashboard KPI date ranges', () => {
  it('uses rolling 7, 30, and 90-day windows and supports all history', () => {
    expect(getDashboardMetricPeriodStart('7d', now)).toBe('2026-07-31T12:00:00.000Z')
    expect(getDashboardMetricPeriodStart('30d', now)).toBe('2026-07-08T12:00:00.000Z')
    expect(getDashboardMetricPeriodStart('90d', now)).toBe('2026-05-09T12:00:00.000Z')
    expect(getDashboardMetricPeriodStart('all', now)).toBeNull()
  })

  it('keeps valid period values and compact labels explicit', () => {
    expect(isDashboardMetricPeriod('7d')).toBe(true)
    expect(isDashboardMetricPeriod('all')).toBe(true)
    expect(isDashboardMetricPeriod('today')).toBe(false)
    expect(getDashboardMetricPeriodLabel('7d')).toBe('Last 7 days')
    expect(getDashboardMetricPeriodLabel('all')).toBe('All time')
  })

  it('applies the period to discovery, high-intent, and sent-reply metrics only', () => {
    const dashboard = source('src/app/(dashboard)/dashboard/page.tsx')

    expect(dashboard).toContain('aria-label="KPI date range"')
    expect(dashboard).toContain("threadsFoundCountQuery = threadsFoundCountQuery.gte('created_at', periodStart)")
    expect(dashboard).toContain("highIntentCountQuery = highIntentCountQuery.gte('created_at', periodStart)")
    expect(dashboard).toContain("repliesSentCountQuery = repliesSentCountQuery.gte('sent_at', periodStart)")
    expect(dashboard).toContain('Drafts Ready <span className="font-medium text-[#98A2B3]">Live</span>')
  })
})
