import { describe, expect, it } from 'vitest'
import { withRedisSemaphore } from '../src/lib/redis-lock'

class FakeRedisLeaseClient {
  private readonly strings = new Map<string, string>()
  private readonly semaphores = new Map<string, Map<string, number>>()

  async set(key: string, value: string): Promise<'OK' | null> {
    if (this.strings.has(key)) return null
    this.strings.set(key, value)
    return 'OK'
  }

  async eval(script: string, _keys: number, ...args: Array<string | number>) {
    const key = String(args[0])
    if (script.includes("redis.call('GET'")) {
      if (this.strings.get(key) !== String(args[1])) return 0
      this.strings.delete(key)
      return 1
    }
    if (script.includes("redis.call('ZREM'")) {
      return this.semaphores.get(key)?.delete(String(args[1])) ? 1 : 0
    }
    if (script.includes("redis.call('ZREMRANGEBYSCORE'")) {
      const now = Number(args[1])
      const expiresAt = Number(args[2])
      const capacity = Number(args[3])
      const token = String(args[4])
      const holders = this.semaphores.get(key) ?? new Map<string, number>()
      for (const [holder, expiry] of holders) {
        if (expiry <= now) holders.delete(holder)
      }
      if (holders.size >= capacity) return 0
      holders.set(token, expiresAt)
      this.semaphores.set(key, holders)
      return 1
    }
    throw new Error('Unexpected Redis script')
  }
}

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>(done => { resolve = done })
  return { promise, resolve }
}

describe('distributed Redis semaphore', () => {
  it('allows operations up to capacity and rejects an excess immediate request', async () => {
    const redis = new FakeRedisLeaseClient()
    const firstRelease = deferred()
    const secondRelease = deferred()
    let entered = 0
    const first = withRedisSemaphore(redis, 'sessions', 2, 60_000, async () => {
      entered += 1
      await firstRelease.promise
      return 'first'
    })
    const second = withRedisSemaphore(redis, 'sessions', 2, 60_000, async () => {
      entered += 1
      await secondRelease.promise
      return 'second'
    })
    while (entered < 2) await Promise.resolve()

    await expect(withRedisSemaphore(redis, 'sessions', 2, 60_000, async () => 'third'))
      .resolves.toBeNull()
    firstRelease.resolve()
    secondRelease.resolve()
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second'])
  })

  it('releases a slot when an operation fails', async () => {
    const redis = new FakeRedisLeaseClient()
    await expect(withRedisSemaphore(redis, 'sessions', 1, 60_000, async () => {
      throw new Error('operation failed')
    })).rejects.toThrow('operation failed')
    await expect(withRedisSemaphore(redis, 'sessions', 1, 60_000, async () => 'recovered'))
      .resolves.toBe('recovered')
  })
})
