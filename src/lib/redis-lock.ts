import { randomUUID } from 'node:crypto'

type RedisLeaseClient = {
  set(
    key: string,
    value: string,
    mode: 'PX',
    duration: number,
    condition: 'NX',
  ): Promise<'OK' | null>
  eval(script: string, keys: number, ...args: Array<string | number>): Promise<unknown>
}

type RedisLeaseWaitOptions = {
  waitMs?: number
  minRetryDelayMs?: number
  maxRetryDelayMs?: number
}

const ACQUIRE_SEMAPHORE_SCRIPT = `
local now = tonumber(ARGV[1])
local expires_at = tonumber(ARGV[2])
local capacity = tonumber(ARGV[3])
local token = ARGV[4]
local key_ttl = tonumber(ARGV[5])
redis.call('ZREMRANGEBYSCORE', KEYS[1], '-inf', now)
if redis.call('ZCARD', KEYS[1]) >= capacity then return 0 end
redis.call('ZADD', KEYS[1], expires_at, token)
redis.call('PEXPIRE', KEYS[1], key_ttl)
return 1
`

const RELEASE_SEMAPHORE_SCRIPT = `
return redis.call('ZREM', KEYS[1], ARGV[1])
`

function normalizedWaitOptions(options: RedisLeaseWaitOptions) {
  const waitMs = Math.max(0, Math.min(60_000, options.waitMs ?? 0))
  const minRetryDelayMs = Math.max(25, Math.min(5_000, options.minRetryDelayMs ?? 200))
  const maxRetryDelayMs = Math.max(
    minRetryDelayMs,
    Math.min(10_000, options.maxRetryDelayMs ?? 750),
  )
  return { waitMs, minRetryDelayMs, maxRetryDelayMs }
}

function sleepWithJitter(minMs: number, maxMs: number) {
  const duration = minMs + Math.floor(Math.random() * (maxMs - minMs + 1))
  return new Promise(resolve => setTimeout(resolve, duration))
}

async function acquireWithWait(
  acquire: () => Promise<boolean>,
  options: RedisLeaseWaitOptions,
): Promise<boolean> {
  const { waitMs, minRetryDelayMs, maxRetryDelayMs } = normalizedWaitOptions(options)
  const deadline = Date.now() + waitMs
  do {
    if (await acquire()) return true
    if (Date.now() >= deadline) return false
    await sleepWithJitter(minRetryDelayMs, maxRetryDelayMs)
  } while (Date.now() < deadline)
  return false
}

export async function withRedisLock<T>(
  redis: RedisLeaseClient,
  key: string,
  ttlMs: number,
  operation: () => Promise<T>,
  waitOptions: RedisLeaseWaitOptions = {},
): Promise<T | null> {
  const token = randomUUID()
  const acquired = await acquireWithWait(
    async () => await redis.set(key, token, 'PX', ttlMs, 'NX') === 'OK',
    waitOptions,
  )
  if (!acquired) return null
  try {
    return await operation()
  } finally {
    await redis.eval(
      `if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) end return 0`,
      1,
      key,
      token,
    ).catch(() => undefined)
  }
}

/**
 * Runs an operation while holding one slot in a distributed, expiring
 * semaphore. Expired holders are removed atomically before capacity is
 * checked, so a crashed worker cannot permanently consume a slot.
 */
export async function withRedisSemaphore<T>(
  redis: RedisLeaseClient,
  key: string,
  capacity: number,
  leaseMs: number,
  operation: () => Promise<T>,
  waitOptions: RedisLeaseWaitOptions = {},
): Promise<T | null> {
  const normalizedCapacity = Math.max(1, Math.min(100, Math.floor(capacity)))
  const normalizedLeaseMs = Math.max(1_000, Math.min(60 * 60_000, leaseMs))
  const token = randomUUID()
  const acquired = await acquireWithWait(async () => {
    const now = Date.now()
    const result = await redis.eval(
      ACQUIRE_SEMAPHORE_SCRIPT,
      1,
      key,
      now,
      now + normalizedLeaseMs,
      normalizedCapacity,
      token,
      normalizedLeaseMs * 2,
    )
    return Number(result) === 1
  }, waitOptions)
  if (!acquired) return null
  try {
    return await operation()
  } finally {
    await redis.eval(RELEASE_SEMAPHORE_SCRIPT, 1, key, token).catch(() => undefined)
  }
}
