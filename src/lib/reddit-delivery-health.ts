import { redis } from './redis'

export const HYPERBROWSER_HEALTH_KEY = 'health:reddit-delivery:hyperbrowser:v1'
export const HYPERBROWSER_HEALTH_MAX_AGE_MS = 7 * 60 * 60_000

export type HyperbrowserHealthSnapshot = {
  status: 'ok' | 'error'
  checkedAt: string
  code?: string
  creditsRemaining?: number
  creditsLimit?: number
}

export function parseHyperbrowserHealthSnapshot(
  value: string | null,
): HyperbrowserHealthSnapshot | null {
  if (!value) return null
  try {
    const parsed = JSON.parse(value) as Partial<HyperbrowserHealthSnapshot>
    if (
      (parsed.status !== 'ok' && parsed.status !== 'error')
      || typeof parsed.checkedAt !== 'string'
      || !Number.isFinite(Date.parse(parsed.checkedAt))
      || (parsed.code !== undefined && typeof parsed.code !== 'string')
      || (parsed.creditsRemaining !== undefined && !Number.isFinite(parsed.creditsRemaining))
      || (parsed.creditsLimit !== undefined && !Number.isFinite(parsed.creditsLimit))
    ) return null
    return {
      status: parsed.status,
      checkedAt: parsed.checkedAt,
      ...(parsed.code ? { code: parsed.code.slice(0, 160) } : {}),
      ...(parsed.creditsRemaining !== undefined
        ? { creditsRemaining: parsed.creditsRemaining }
        : {}),
      ...(parsed.creditsLimit !== undefined ? { creditsLimit: parsed.creditsLimit } : {}),
    }
  } catch {
    return null
  }
}

export async function readHyperbrowserHealth(): Promise<HyperbrowserHealthSnapshot | null> {
  return parseHyperbrowserHealthSnapshot(await redis.get(HYPERBROWSER_HEALTH_KEY))
}

export async function recordHyperbrowserHealth(
  snapshot: Omit<HyperbrowserHealthSnapshot, 'checkedAt'> & { checkedAt?: string },
): Promise<void> {
  const value: HyperbrowserHealthSnapshot = {
    ...snapshot,
    checkedAt: snapshot.checkedAt ?? new Date().toISOString(),
  }
  await redis.set(
    HYPERBROWSER_HEALTH_KEY,
    JSON.stringify(value),
    'EX',
    value.status === 'ok' ? 8 * 60 * 60 : 30 * 60,
  )
}
