import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const layout = readFileSync(
  join(process.cwd(), 'src/components/DashboardLayout.tsx'),
  'utf8',
).replace(/\r\n/g, '\n')

describe('sidebar billing actions', () => {
  it('keeps current-plan credit packs separate from subscription upgrades', () => {
    expect(layout).toContain("handleBuyAddon('drafts')")
    expect(layout).toContain("openCheckout({ addon: type }")
    expect(layout).toContain("openCheckout({ plan: plan === 'free'")
    expect(layout).toContain("'Add credits'")
    expect(layout).toContain("'Upgrade'")
    expect(layout).not.toContain('draftAddonAvailable')
  })

  it('shows independent checkout progress for each action', () => {
    expect(layout).toContain("openingCheckout === 'addon:drafts'")
    expect(layout).toContain("openingCheckout === 'upgrade'")
  })
})
