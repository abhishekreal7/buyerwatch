"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.DASHBOARD_METRIC_PERIODS = void 0;
exports.isDashboardMetricPeriod = isDashboardMetricPeriod;
exports.getDashboardMetricPeriodLabel = getDashboardMetricPeriodLabel;
exports.getDashboardMetricPeriodStart = getDashboardMetricPeriodStart;
exports.DASHBOARD_METRIC_PERIODS = ['7d', '30d', '90d', 'all'];
const PERIOD_DURATIONS_MS = {
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
    '90d': 90 * 24 * 60 * 60 * 1000,
};
const PERIOD_LABELS = {
    '7d': 'Last 7 days',
    '30d': 'Last 30 days',
    '90d': 'Last 90 days',
    all: 'All time',
};
function isDashboardMetricPeriod(value) {
    return exports.DASHBOARD_METRIC_PERIODS.includes(value);
}
function getDashboardMetricPeriodLabel(period) {
    return PERIOD_LABELS[period];
}
/** Returns a rolling UTC window start, or null when the user selected all history. */
function getDashboardMetricPeriodStart(period, now = new Date()) {
    if (period === 'all')
        return null;
    return new Date(now.getTime() - PERIOD_DURATIONS_MS[period]).toISOString();
}
