import { createHash } from 'node:crypto'
import { withRedisLock } from './backend-maintenance'
import { redis } from './redis'

function scoreLockKey(userId: string, externalId: string): string {
  const digest = createHash('sha256')
    .update(`${userId}\0${externalId}`)
    .digest('hex')
  return `locks:score:${digest}`
}

export function withScoreLock<T>(
  userId: string,
  externalId: string,
  operation: () => Promise<T>,
): Promise<T | null> {
  return withRedisLock(
    redis,
    scoreLockKey(userId, externalId),
    210_000,
    operation,
  )
}
