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
})
