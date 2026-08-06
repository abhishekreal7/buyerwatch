// The serverless QStash monitor and the always-on worker are intentionally
// redundant. They still need one shared lease so they never fetch and score
// the same monitoring window at the same time.
export const MONITORING_RUN_LOCK_KEY = 'locks:monitoring-run'
export const MONITORING_RUN_LOCK_TTL_MS = 300_000
