import { describe, expect, it } from 'vitest'
import { buildRollingTrendBuckets, compareTrendCounts } from '../src/lib/analytics-trends'

describe('analytics trend comparisons', () => {
  it('reports an increase with precise wording and exact counts', () => {
    expect(compareTrendCounts(9, 8, 14)).toEqual({
      current: 9,
      preceding: 8,
      direction: 'higher',
      percentage: 12.5,
      label: '12.5% higher than preceding 14 days · 9 vs 8',
    })
  })

  it('reports a decrease without losing the exact counts', () => {
    expect(compareTrendCounts(1, 20, 14)).toEqual({
      current: 1,
      preceding: 20,
      direction: 'lower',
      percentage: 95,
      label: '95% lower than preceding 14 days · 1 vs 20',
    })
  })

  it('uses the absolute change when a tiny baseline would create a sensational percentage', () => {
    expect(compareTrendCounts(513, 7, 30)).toEqual({
      current: 513,
      preceding: 7,
      direction: 'higher',
      percentage: 7228.6,
      label: '506 more than preceding 30 days · 513 vs 7',
    })
  })

  it('uses the absolute decrease for an extreme downward comparison', () => {
    expect(compareTrendCounts(1, 20, 30)).toEqual({
      current: 1,
      preceding: 20,
      direction: 'lower',
      percentage: 95,
      label: '95% lower than preceding 30 days · 1 vs 20',
    })
  })

  it('handles a zero baseline without producing Infinity', () => {
    expect(compareTrendCounts(4, 0, 7)).toEqual({
      current: 4,
      preceding: 0,
      direction: 'new',
      percentage: null,
      label: 'New activity vs preceding 7 days · 4 vs 0',
    })
  })

  it('reports unchanged periods explicitly', () => {
    expect(compareTrendCounts(0, 0, 30)).toEqual({
      current: 0,
      preceding: 0,
      direction: 'unchanged',
      percentage: 0,
      label: 'No change from preceding 30 days · 0 vs 0',
    })
  })
})

describe('rolling analytics buckets', () => {
  it('uses equal 24-hour windows and keeps qualified counts separate', () => {
    const now = new Date('2026-08-26T12:00:00.000Z')
    const buckets = buildRollingTrendBuckets([
      { createdAt: '2026-08-25T12:00:00.000Z', qualified: true },
      { createdAt: '2026-08-24T12:00:00.000Z', qualified: false },
      { createdAt: '2026-08-23T12:00:00.000Z', qualified: true },
      { createdAt: '2026-08-23T11:59:59.999Z', qualified: true },
      { createdAt: 'not-a-date', qualified: true },
    ], now, 3)

    expect(buckets.map(bucket => ({
      discovered: bucket.discovered,
      qualified: bucket.qualified,
    }))).toEqual([
      { discovered: 1, qualified: 1 },
      { discovered: 1, qualified: 0 },
      { discovered: 1, qualified: 1 },
    ])
  })

  it('places exact period-boundary events in the newer period', () => {
    const now = new Date('2026-08-26T12:00:00.000Z')
    const buckets = buildRollingTrendBuckets([
      { createdAt: '2026-08-24T12:00:00.000Z', qualified: false },
      { createdAt: '2026-08-22T12:00:00.000Z', qualified: false },
    ], now, 4)

    const current = buckets.slice(-2).reduce((total, bucket) => total + bucket.discovered, 0)
    const preceding = buckets.slice(-4, -2).reduce((total, bucket) => total + bucket.discovered, 0)

    expect({ current, preceding }).toEqual({ current: 1, preceding: 1 })
  })
})
