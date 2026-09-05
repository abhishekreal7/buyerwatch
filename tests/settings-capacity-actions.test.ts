import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const settings = readFileSync(
  join(process.cwd(), 'src/app/(dashboard)/settings/SettingsPage.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('settings plan and capacity actions', () => {
  it('offers capacity only when an active allowance is low or exhausted', () => {
    expect(settings).toContain('CreditPackPicker')
    expect(settings).toContain('triggerLabel="Add capacity"')
    expect(settings).toContain('const usageCapacityAtLimit')
    expect(settings).toContain('const usageCapacityNotice')
    expect(settings).toContain("'Capacity running low'")
    expect(settings).toContain("'Monthly capacity reached'")
  })

  it('does not display or calculate zero-denominator usage', () => {
    expect(settings).toContain('usageItems.filter(item => item.max > 0)')
    expect(settings).toContain('const displayedUsed = Math.min(item.used, item.max)')
    expect(settings).toContain('Monthly capacity becomes available when your trial or subscription starts.')
    expect(settings).not.toContain('ten-draft monthly limit')
  })

  it('does not present monthly usage before billing activation', () => {
    expect(settings).toContain("planState.billingState !== 'active'")
    expect(settings).toContain('Monitoring has not started')
    expect(settings).toContain('Start your Starter trial to activate monitoring and begin monthly usage tracking.')
    expect(settings).toContain('Usage is paused')
  })

  it('uses monthly quota counters instead of raw discovered-row totals', () => {
    expect(settings).toContain("p.signal_month === usageMonth ? Math.max(p.signal_count ?? 0, 0) : 0")
    expect(settings).toContain("p.draft_month === usageMonth ? Math.max(p.draft_count ?? 0, 0) : 0")
  })
})
