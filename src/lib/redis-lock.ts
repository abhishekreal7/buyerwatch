import { randomUUID } from 'node:crypto'

export async function withRedisLock<T>(
  redis: {
    set(
      key: string,
      value: string,
      mode: 'PX',
      duration: number,
      condition: 'NX',
    ): Promise<'OK' | null>
    eval(script: string, keys: number, ...args: Array<string | number>): Promise<unknown>
  },
  key: string,
  ttlMs: number,
  operation: () => Promise<T>,
): Promise<T | null> {
  const token = randomUUID()
  const acquired = await redis.set(key, token, 'PX', ttlMs, 'NX')
  if (acquired !== 'OK') return null
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
