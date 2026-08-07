export const DASHBOARD_METRIC_PERIODS = ['7d', '30d', '90d', 'all'] as const

export type DashboardMetricPeriod = (typeof DASHBOARD_METRIC_PERIODS)[number]

const PERIOD_DURATIONS_MS: Record<Exclude<DashboardMetricPeriod, 'all'>, number> = {
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

const PERIOD_LABELS: Record<DashboardMetricPeriod, string> = {
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
  all: 'All time',
}

export function isDashboardMetricPeriod(value: string): value is DashboardMetricPeriod {
  return DASHBOARD_METRIC_PERIODS.includes(value as DashboardMetricPeriod)
}

export function getDashboardMetricPeriodLabel(period: DashboardMetricPeriod): string {
  return PERIOD_LABELS[period]
}

/** Returns a rolling UTC window start, or null when the user selected all history. */
export function getDashboardMetricPeriodStart(
  period: DashboardMetricPeriod,
  now = new Date(),
): string | null {
  if (period === 'all') return null
  return new Date(now.getTime() - PERIOD_DURATIONS_MS[period]).toISOString()
}
