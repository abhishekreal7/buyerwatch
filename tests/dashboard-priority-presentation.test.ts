import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  isLowRelevanceScore,
  LOW_RELEVANCE_THRESHOLD,
} from '../src/lib/intent'

const dashboard = readFileSync(
  join(process.cwd(), 'src/app/(dashboard)/dashboard/page.tsx'),
  'utf8',
)

describe('dashboard intent hierarchy', () => {
  it('uses the same 0–39 band as the intent model for low relevance', () => {
    expect(LOW_RELEVANCE_THRESHOLD).toBe(40)
    expect(isLowRelevanceScore(0)).toBe(true)
    expect(isLowRelevanceScore(39)).toBe(true)
    expect(isLowRelevanceScore(40)).toBe(false)
    expect(isLowRelevanceScore(80)).toBe(false)
    expect(isLowRelevanceScore(null)).toBe(false)
  })

  it('opens the dashboard on high intent and keeps low relevance collapsible', () => {
    expect(dashboard).toContain("useState<FilterTab>('high-intent')")
    expect(dashboard).toContain('data-testid="low-relevance-toggle"')
    expect(dashboard).toContain('setShowLowRelevance(current => !current)')
    expect(dashboard).toContain('lowRelevanceExpanded = showLowRelevance || Boolean(normalizedSearch)')
  })

  it('keeps the override action available without using the primary treatment', () => {
    expect(dashboard).toContain('data-testid={isLowRelevance ? \'low-relevance-reply\' : undefined}')
    expect(dashboard).toContain('Generate reply anyway')
    expect(dashboard).toContain('border border-[#CBD5E1] bg-white')
  })

  it('keeps dismissed low-relevance cards muted too', () => {
    expect(dashboard).toContain('isLowRelevance: isLowRelevanceScore(thread.score)')
  })

  it('uses the image-2 headline typography for every intent card', () => {
    expect(dashboard).toContain('mb-2 text-[15px] font-bold leading-snug')
    expect(dashboard).not.toContain('mb-2 text-[13px] font-semibold leading-snug')
  })

  it('shows one contextual capacity action without duplicate limit cards', () => {
    expect(dashboard).toContain('Monthly capacity reached')
    expect(dashboard).toContain('triggerLabel="Add capacity"')
    expect(dashboard).not.toContain('Choose signal pack')
    expect(dashboard).not.toContain('Choose draft pack')
    expect(dashboard).not.toContain('Starter signal limit reached')
    expect(dashboard).not.toContain('Dummy blurred content behind')
  })

  it('does not report unpaid monitoring as failing or treat a zero allowance as an overage', () => {
    expect(dashboard).toContain("billingDisplayState === 'active'")
    expect(dashboard).toContain('signalUsage.limit > 0 && signalUsage.used >= signalUsage.limit')
    expect(dashboard).toContain('draftUsage.limit > 0 && draftUsage.used >= draftUsage.limit')
    expect(dashboard).toContain('Your trial has not started')
  })

  it('keeps high-intent proof inside the single activation banner', () => {
    expect(dashboard).toContain('high-intent conversation${stats.highIntent === 1')
    expect(dashboard).toContain('Start your 7-day trial to activate your ${keywordsCount} saved monitoring rule')
  })

  it('keeps the trial action compact inside the activation banner', () => {
    expect(dashboard).toContain('min-h-10 shrink-0 items-center justify-center rounded-lg bg-[#101828] px-3.5 text-[12px]')
  })

  it('keeps reply utilities quiet and the delivery action compact', () => {
    expect(dashboard).toContain('flex h-8 w-8 items-center justify-center rounded-md text-[#98A2B3]')
    expect(dashboard).toContain('h-8 rounded-md px-2 text-[11.5px] font-medium text-[#475467]')
    expect(dashboard).toContain('ml-0.5 flex h-8 items-center gap-1.5 rounded-md bg-[#101828] px-2.5')
  })
})
