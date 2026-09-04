import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(
  join(process.cwd(), 'src/components/DashboardLayout.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('sidebar billing actions', () => {
  it('uses one permanent route to plan, usage, and billing controls', () => {
    expect(layout).not.toContain('CreditPackPicker')
    expect(layout).toContain('href="/settings?section=plan"')
    expect(layout).toContain('Plan &amp; usage')
    expect(layout).not.toContain('handleUpgradePlan')
  })

  it('keeps the current plan visible without embedding another purchase prompt', () => {
    expect(layout).toContain('{plan} Plan')
    expect(layout).not.toContain("openingCheckout === 'upgrade'")
  })
})
