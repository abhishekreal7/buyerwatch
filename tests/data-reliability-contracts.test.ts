import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const source = (path: string) => readFileSync(join(process.cwd(), path), 'utf8')

const dashboard = source('src/app/(dashboard)/dashboard/page.tsx')
const opportunities = source('src/app/(dashboard)/opportunities/page.tsx')
const drafts = source('src/app/(dashboard)/drafts/page.tsx')
const analytics = source('src/app/(dashboard)/analytics/page.tsx')
const keywords = source('src/app/(dashboard)/keywords/page.tsx')
const settings = source('src/app/(dashboard)/settings/page.tsx')
const posted = source('src/app/(dashboard)/posted/page.tsx')
const generateDraftRoute = source('src/app/api/replies/generate/route.ts')
const drafting = source('src/lib/draft-reply.ts')
const scoreWorker = source('worker/handlers/score-post.ts')
const dashboardLayout = source('src/components/DashboardLayout.tsx')
const slackSettingsRoute = source('src/app/api/settings/slack/route.ts')
const slackTestRoute = source('src/app/api/settings/test-slack/route.ts')

describe('dashboard data reliability contracts', () => {
  it.each([
    ['dashboard', dashboard],
    ['opportunities', opportunities],
    ['drafts', drafts],
    ['analytics', analytics],
    ['keywords', keywords],
    ['settings', settings],
    ['posted', posted],
  ])('%s distinguishes load failures from valid empty data', (_name, page) => {
    expect(page).toContain('DataLoadError')
    expect(page).toContain('loadFailed')
    expect(page).toMatch(/onRetry=/)
  })

  it('uses scored conversations consistently in analytics and per-rule metrics', () => {
    expect(analytics).toMatch(/from\('monitored_threads'\)[\s\S]{0,260}not\('intent_score', 'is', null\)/)
    expect(keywords).toMatch(/from\('monitored_threads'\)[\s\S]{0,220}not\('intent_score', 'is', null\)/)
  })

  it('blocks settings writes until saved values load successfully', () => {
    expect(settings).toContain("throw new Error('Settings profile was not found')")
    expect(settings).toContain('settingsLoading || loadFailed')
    expect(settings).toContain('Load your settings successfully before saving changes.')
    expect(settings).toContain('editing is disabled to protect them')
  })

  it('keeps unscored and non-actionable candidates out of every Opportunities page query', () => {
    expect(opportunities.match(/\.not\('intent_score', 'is', null\)/g)).toHaveLength(3)
    expect(opportunities.match(/\.gte\('intent_score', ACTIONABLE_INTENT_THRESHOLD\)/g)).toHaveLength(3)
    expect(opportunities).not.toContain("'Pain signals'")
  })

  it('restores an Opportunities selection after a zero-result filter', () => {
    expect(opportunities).toContain('current !== null && filtered.some')
    expect(opportunities).toContain('return filtered[0]?.id ?? null')
  })

  it('uses the same scored opportunity and ready-draft definitions in the sidebar', () => {
    expect(dashboardLayout).toContain(".not('intent_score', 'is', null)")
    expect(dashboardLayout).toContain(".gte('intent_score', ACTIONABLE_INTENT_THRESHOLD)")
    expect(dashboardLayout).toContain(".in('status', ['drafted', 'needs_manual_reply'])")
    expect(dashboardLayout).toContain("item.name === 'Drafts Ready' && draftReadyCount !== null")
    expect(dashboardLayout).toContain('void loadSidebarData()')
    expect(dashboardLayout).not.toContain('badgeCount = credits.used')
  })

  it('settles network-backed busy states and rolls back optimistic mutations', () => {
    expect(dashboardLayout).toContain("catch (error) {\n        console.error('[dashboard-layout] Unable to refresh sidebar metrics'")
    expect(dashboardLayout).toContain('setTogglingAutoSend(false)')
    expect(settings).toContain('setSaving(false)')
    expect(settings).toContain('setBskyConnecting(false)')
    expect(opportunities).toContain('setLoadingMore(false)')
    expect(drafts).toContain('Nothing was removed.')
    expect(drafts).toContain("setDraftContent(nextSelected?.draft ?? '')")
    expect(posted).toContain('if (!cancelled) setLoading(false)')
  })

  it('keeps encrypted Slack configuration usable after a page reload', () => {
    expect(slackSettingsRoute).toContain('export async function GET()')
    expect(slackSettingsRoute).toContain('configured: Boolean(data?.slack_webhook_ciphertext || data?.slack_webhook_url)')
    expect(slackSettingsRoute).toContain("Object.prototype.hasOwnProperty.call(body, 'webhookUrl')")
    expect(slackTestRoute).toContain('decrypt(profile.slack_webhook_ciphertext)')
    expect(settings).toContain('The saved webhook is encrypted and never displayed here.')
    expect(settings).toContain('Disconnect Slack')
  })
})

describe('manual and AI drafting resilience', () => {
  it('keeps the reply editor writable when no generated draft exists', () => {
    expect(drafts).toContain('aria-label="Reply draft"')
    expect(drafts).toContain('Write a reply here, or use Generate reply when AI drafting is available.')
    expect(drafts).not.toContain('{draftContent ? (\n                    <textarea')
  })

  it('fails before reserving usage when the AI provider is unavailable', () => {
    const providerCheck = generateDraftRoute.indexOf("error: 'ai_provider_unavailable'")
    const spendReservation = generateDraftRoute.indexOf('const aiSpend = await reserveAiSpend')
    const monthlyReservation = generateDraftRoute.indexOf("'reserve_monthly_draft'")

    expect(providerCheck).toBeGreaterThan(0)
    expect(providerCheck).toBeLessThan(spendReservation)
    expect(providerCheck).toBeLessThan(monthlyReservation)
    expect(generateDraftRoute).toContain('You can write and send this reply manually.')
    expect(generateDraftRoute).toContain("error: 'draft_generation_failed'")
  })

  it('makes author role an independent drafting decision', () => {
    expect(drafting).toContain('Independently determine the author\'s role')
    expect(drafting).toContain("Author: ${post.author || '(unknown)'}")
    expect(drafting).toContain("Community or monitored target: ${post.sourceTarget || '(unknown)'}")
    expect(drafting).toContain("Published at: ${post.createdAt || '(unknown)'}")
    expect(drafting).toContain('Treat that score as fallible context')
  })

  it('preserves deterministic intent when paid AI scoring cannot run', () => {
    expect(scoreWorker).toContain("intentManualReviewReason = 'intent_spend_limit_reached'")
    expect(scoreWorker).toContain("intentManualReviewReason = 'intent_plan_limit_reached'")
    expect(scoreWorker).toContain("intentManualReviewReason = 'intent_provider_failed'")
    expect(scoreWorker).toContain('AI intent scoring failed; preserving deterministic result for manual review')
    expect(scoreWorker).toContain('automationReason: intentManualReviewReason')
  })

  it('routes draft-provider failures to the writable manual queue', () => {
    const draftFailure = scoreWorker.indexOf('AI drafting failed; routing scored conversation to manual reply')
    const manualStatus = scoreWorker.indexOf("status: 'needs_manual_reply'", draftFailure)
    const manualReason = scoreWorker.indexOf("automationReason: 'draft_provider_failed'", draftFailure)

    expect(draftFailure).toBeGreaterThan(0)
    expect(manualStatus).toBeGreaterThan(draftFailure)
    expect(manualReason).toBeGreaterThan(manualStatus)
    expect(drafts).toContain('MANUAL_DRAFT_REASON_LABELS[selected.automationReason]')
  })
})
