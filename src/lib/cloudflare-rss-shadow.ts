import { timingSafeEqual } from 'node:crypto'
import { isUuid } from './request'

const TARGET_PATTERN = /^[a-z0-9_]{2,50}$/
const FINGERPRINT_PATTERN = /^[a-f0-9]{64}$/i
const ERROR_CODE_PATTERN = /^[a-z0-9_:-]{1,80}$/
const RESULT_STATUSES = new Set([
  'success',
  'http_error',
  'network_error',
  'invalid_feed',
])

export type RssShadowResultStatus =
  | 'success'
  | 'http_error'
  | 'network_error'
  | 'invalid_feed'

export type RssShadowResult = {
  target: string
  status: RssShadowResultStatus
  httpStatus: number | null
  postCount: number
  feedFingerprint: string | null
  errorCode: string | null
}

export type RssShadowRunPayload = {
  runId: string
  startedAt: string
  completedAt: string
  workerVersion: string
  results: RssShadowResult[]
}

function safeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

function validTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > 40) return false
  const timestamp = Date.parse(value)
  if (!Number.isFinite(timestamp)) return false

  // A shadow run is telemetry, never a source of truth. Reject implausible
  // timestamps so a malformed remote client cannot poison operations views.
  return Math.abs(Date.now() - timestamp) <= 48 * 60 * 60 * 1_000
}

export function hasCloudflareRssShadowConfiguration(): boolean {
  return (process.env.CLOUDFLARE_RSS_SHADOW_SECRET?.trim().length ?? 0) >= 32
}

export function isAuthorizedCloudflareRssShadowRequest(
  authorization: string | null,
): boolean {
  const secret = process.env.CLOUDFLARE_RSS_SHADOW_SECRET?.trim()
  const token = authorization?.replace(/^Bearer\s+/i, '').trim()
  return Boolean(secret && secret.length >= 32 && token && safeEqual(token, secret))
}

export function normalizeRssShadowTarget(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const normalized = value.trim().replace(/^r\//i, '').toLowerCase()
  return TARGET_PATTERN.test(normalized) ? normalized : null
}

function parseRssShadowResult(value: unknown): RssShadowResult | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  const target = normalizeRssShadowTarget(candidate.target)
  const status = candidate.status
  const httpStatus = candidate.httpStatus
  const postCount = candidate.postCount
  const feedFingerprint = candidate.feedFingerprint
  const errorCode = candidate.errorCode

  if (!target || typeof status !== 'string' || !RESULT_STATUSES.has(status)) return null
  if (
    httpStatus !== null
    && (
      typeof httpStatus !== 'number'
      || !Number.isInteger(httpStatus)
      || httpStatus < 100
      || httpStatus > 599
    )
  ) {
    return null
  }
  if (
    typeof postCount !== 'number'
    || !Number.isInteger(postCount)
    || postCount < 0
    || postCount > 100
  ) return null
  if (feedFingerprint !== null && (typeof feedFingerprint !== 'string' || !FINGERPRINT_PATTERN.test(feedFingerprint))) {
    return null
  }
  if (errorCode !== null && (typeof errorCode !== 'string' || !ERROR_CODE_PATTERN.test(errorCode))) {
    return null
  }

  if (status === 'success' && (!feedFingerprint || httpStatus !== 200 || errorCode !== null)) return null
  if (status !== 'success' && postCount !== 0) return null

  return {
    target,
    status: status as RssShadowResultStatus,
    httpStatus: httpStatus as number | null,
    postCount,
    feedFingerprint: feedFingerprint as string | null,
    errorCode: errorCode as string | null,
  }
}

/**
 * Accept only compact, non-user-content telemetry from the Cloudflare worker.
 * Shadow data must never be able to create leads, drafts, charges, or posts.
 */
export function parseRssShadowRunPayload(value: unknown): RssShadowRunPayload | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null
  const candidate = value as Record<string, unknown>
  if (
    !isUuid(candidate.runId)
    || !validTimestamp(candidate.startedAt)
    || !validTimestamp(candidate.completedAt)
    || typeof candidate.workerVersion !== 'string'
    || !/^[a-z0-9._-]{1,80}$/i.test(candidate.workerVersion)
    || !Array.isArray(candidate.results)
    || candidate.results.length === 0
    || candidate.results.length > 100
  ) {
    return null
  }

  const startedAtMs = Date.parse(candidate.startedAt)
  const completedAtMs = Date.parse(candidate.completedAt)
  if (completedAtMs < startedAtMs || completedAtMs - startedAtMs > 20 * 60 * 1_000) return null

  const results: RssShadowResult[] = []
  for (const result of candidate.results) {
    const parsed = parseRssShadowResult(result)
    if (!parsed) return null
    results.push(parsed)
  }
  const targets = new Set(results.map(result => result.target))
  if (targets.size !== results.length) return null

  return {
    runId: candidate.runId,
    startedAt: candidate.startedAt,
    completedAt: candidate.completedAt,
    workerVersion: candidate.workerVersion,
    results,
  }
}
