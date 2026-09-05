const DAY_MS = 24 * 60 * 60 * 1000

export type TrendDirection = 'higher' | 'lower' | 'unchanged' | 'new'

export type TrendComparison = {
  current: number
  preceding: number
  direction: TrendDirection
  percentage: number | null
  label: string
}

export type TrendEvent = {
  createdAt: string | Date
  qualified: boolean
}

export type RollingTrendBucket = {
  end: Date
  discovered: number
  qualified: number
}

function normalizeCount(value: number) {
  if (!Number.isFinite(value) || value <= 0) return 0
  return Math.round(value)
}

function formatPercentage(value: number) {
  return new Intl.NumberFormat('en-US', {
    maximumFractionDigits: 1,
    minimumFractionDigits: Number.isInteger(value) ? 0 : 1,
  }).format(value)
}

const MAX_USEFUL_PERCENTAGE = 999.9

export function compareTrendCounts(currentValue: number, precedingValue: number, days: number): TrendComparison {
  const current = normalizeCount(currentValue)
  const preceding = normalizeCount(precedingValue)
  const periodDays = Math.max(1, Math.round(days))
  const counts = `${current.toLocaleString('en-US')} vs ${preceding.toLocaleString('en-US')}`

  if (current === preceding) {
    return {
      current,
      preceding,
      direction: 'unchanged',
      percentage: 0,
      label: `No change from preceding ${periodDays} days · ${counts}`,
    }
  }

  if (preceding === 0) {
    return {
      current,
      preceding,
      direction: 'new',
      percentage: null,
      label: `New activity vs preceding ${periodDays} days · ${counts}`,
    }
  }

  const percentage = Math.round((Math.abs(current - preceding) / preceding) * 1000) / 10
  const direction: TrendDirection = current > preceding ? 'higher' : 'lower'
  const absoluteDifference = Math.abs(current - preceding)
  const label = percentage > MAX_USEFUL_PERCENTAGE
    ? `${absoluteDifference.toLocaleString('en-US')} ${current > preceding ? 'more' : 'fewer'} than preceding ${periodDays} days · ${counts}`
    : `${formatPercentage(percentage)}% ${direction} than preceding ${periodDays} days · ${counts}`

  return {
    current,
    preceding,
    direction,
    percentage,
    label,
  }
}

export function buildRollingTrendBuckets(
  events: TrendEvent[],
  now: Date,
  bucketCount = 60,
): RollingTrendBucket[] {
  const count = Math.max(1, Math.round(bucketCount))
  const endTime = now.getTime()
  const startTime = endTime - count * DAY_MS
  const buckets = Array.from({ length: count }, (_, index) => ({
    end: new Date(startTime + (index + 1) * DAY_MS),
    discovered: 0,
    qualified: 0,
  }))

  for (const event of events) {
    const eventTime = event.createdAt instanceof Date
      ? event.createdAt.getTime()
      : new Date(event.createdAt).getTime()

    if (!Number.isFinite(eventTime) || eventTime < startTime || eventTime > endTime) continue

    const rawIndex = Math.floor((eventTime - startTime) / DAY_MS)
    const bucketIndex = Math.min(rawIndex, count - 1)
    buckets[bucketIndex].discovered += 1
    if (event.qualified) buckets[bucketIndex].qualified += 1
  }

  return buckets
}
