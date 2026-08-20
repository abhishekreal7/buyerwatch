export const DISCOVERY_MAX_AGE_MS = 48 * 60 * 60 * 1_000
export const AUTO_REPLY_MAX_AGE_MS = 24 * 60 * 60 * 1_000
export const SOURCE_CLOCK_SKEW_MS = 10 * 60 * 1_000

export type ContentFreshness =
  | { fresh: true; createdAtMs: number; ageMs: number }
  | { fresh: false; reason: 'invalid_source_time' | 'source_time_in_future' | 'source_too_old' }

/**
 * Treat the platform's publication timestamp as authoritative. Ingestion time
 * only tells us when BuyerWatch saw a post and must never make old content look
 * fresh enough to score or automatically reply to.
 */
export function evaluateContentFreshness(
  sourceCreatedAt: string | null | undefined,
  options: {
    nowMs?: number
    maxAgeMs?: number
    futureSkewMs?: number
  } = {},
): ContentFreshness {
  const createdAtMs = Date.parse(sourceCreatedAt ?? '')
  if (!Number.isFinite(createdAtMs)) {
    return { fresh: false, reason: 'invalid_source_time' }
  }

  const nowMs = options.nowMs ?? Date.now()
  const maxAgeMs = options.maxAgeMs ?? DISCOVERY_MAX_AGE_MS
  const futureSkewMs = options.futureSkewMs ?? SOURCE_CLOCK_SKEW_MS
  const ageMs = nowMs - createdAtMs

  if (ageMs < -futureSkewMs) {
    return { fresh: false, reason: 'source_time_in_future' }
  }
  if (ageMs > maxAgeMs) {
    return { fresh: false, reason: 'source_too_old' }
  }
  return { fresh: true, createdAtMs, ageMs: Math.max(0, ageMs) }
}
