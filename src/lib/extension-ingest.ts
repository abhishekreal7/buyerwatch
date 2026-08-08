import { createHash } from 'node:crypto'

export type ExtensionPlatform = 'reddit' | 'bluesky' | 'x'

const FUTURE_CLOCK_SKEW_MS = 5 * 60_000
const MAX_CAPTURE_AGE_MS = 10 * 365 * 24 * 60 * 60_000
const MAX_SOURCE_AGE_MS = 30 * 365 * 24 * 60 * 60_000

const PLATFORM_HOSTS: Record<ExtensionPlatform, RegExp> = {
  reddit: /(^|\.)reddit\.com$/i,
  bluesky: /(^|\.)bsky\.app$/i,
  x: /(^|\.)(x\.com|twitter\.com)$/i,
}

export function isExtensionPlatform(value: unknown): value is ExtensionPlatform {
  return value === 'reddit' || value === 'bluesky' || value === 'x'
}

export function isValidExtensionSourceUrl(
  platform: ExtensionPlatform,
  sourceUrl: string,
): boolean {
  try {
    const parsed = new URL(sourceUrl)
    return parsed.protocol === 'https:' && PLATFORM_HOSTS[platform].test(parsed.hostname)
  } catch {
    return false
  }
}

export function buildExtensionExternalId(
  platform: ExtensionPlatform,
  sourceEventId: string,
): string {
  return `${platform}:extension:${sourceEventId}`
}

export function buildExtensionScoreJobId(userId: string, externalId: string): string {
  const safeId = createHash('sha256').update(externalId).digest('hex').slice(0, 32)
  return `score-${userId}-${safeId}`
}

function parseTimestamp(value: unknown): number {
  if (typeof value !== 'string' || !value.trim()) return Number.NaN
  return new Date(value).getTime()
}

/**
 * Keep source publication time distinct from capture time. Both values come
 * from an untrusted browser page, so invalid, implausibly old, or future dates
 * fall back safely to the server clock/capture time.
 */
export function normalizeExtensionTimestamps(
  capturedValue: unknown,
  publishedValue: unknown,
  now = Date.now(),
): { capturedAt: string; sourceCreatedAt: string } {
  const capturedTime = parseTimestamp(capturedValue)
  const safeCapturedTime = Number.isFinite(capturedTime)
    && capturedTime <= now + FUTURE_CLOCK_SKEW_MS
    && capturedTime >= now - MAX_CAPTURE_AGE_MS
    ? capturedTime
    : now

  const publishedTime = parseTimestamp(publishedValue)
  const safePublishedTime = Number.isFinite(publishedTime)
    && publishedTime <= safeCapturedTime + FUTURE_CLOCK_SKEW_MS
    && publishedTime >= now - MAX_SOURCE_AGE_MS
    ? publishedTime
    : safeCapturedTime

  return {
    capturedAt: new Date(safeCapturedTime).toISOString(),
    sourceCreatedAt: new Date(safePublishedTime).toISOString(),
  }
}
