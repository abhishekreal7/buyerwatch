export const HIGH_INTENT_THRESHOLD_MIN = 60
export const HIGH_INTENT_THRESHOLD_MAX = 95
export const DEFAULT_HIGH_INTENT_THRESHOLD = 80

export function normalizeHighIntentThreshold(value: unknown): number {
  const parsed = typeof value === 'number'
    ? value
    : typeof value === 'string' && value.trim() !== ''
      ? Number(value)
      : Number.NaN

  if (!Number.isFinite(parsed)) return DEFAULT_HIGH_INTENT_THRESHOLD
  return Math.min(
    HIGH_INTENT_THRESHOLD_MAX,
    Math.max(HIGH_INTENT_THRESHOLD_MIN, Math.round(parsed)),
  )
}
