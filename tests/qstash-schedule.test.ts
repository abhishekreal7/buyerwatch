import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const {
  scheduleCreate,
  scheduleGet,
  redisDel,
  redisSet,
} = vi.hoisted(() => ({
  scheduleCreate: vi.fn(),
  scheduleGet: vi.fn(),
  redisDel: vi.fn(),
  redisSet: vi.fn(),
}))

vi.mock('@upstash/qstash', () => ({
  Client: class {
    schedules = {
      create: scheduleCreate,
      get: scheduleGet,
    }
  },
  Receiver: class {},
}))

vi.mock('../src/lib/redis', () => ({
  redis: {
    del: redisDel,
    set: redisSet,
  },
}))

import { ensureMonitoringSchedule } from '../src/lib/qstash'

describe('QStash monitoring schedule self-healing', () => {
  beforeEach(() => {
    vi.stubEnv('QSTASH_TOKEN', 'qstash-token')
    vi.stubEnv('NEXT_PUBLIC_APP_URL', 'https://buyerwatch.co')
    redisSet.mockResolvedValue('OK')
    redisDel.mockResolvedValue(1)
    scheduleCreate.mockResolvedValue({ scheduleId: 'buyerwatch-reddit-monitor' })
    scheduleGet.mockResolvedValue({
      destination: 'https://buyerwatch.co/api/cron/enqueue',
      cron: '*/5 * * * *',
      failureCallback: 'https://buyerwatch.co/api/cron/failure',
      isPaused: false,
    })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.clearAllMocks()
  })

  it('overwrites and verifies the exact production schedule once per day', async () => {
    await expect(ensureMonitoringSchedule()).resolves.toBe('updated')
    expect(scheduleCreate).toHaveBeenCalledWith({
      destination: 'https://buyerwatch.co/api/cron/enqueue',
      scheduleId: 'buyerwatch-reddit-monitor',
      cron: '*/5 * * * *',
      method: 'POST',
      retries: 2,
      timeout: '4m',
      failureCallback: 'https://buyerwatch.co/api/cron/failure',
      label: 'buyerwatch-reddit-monitor',
    })
    expect(redisSet).toHaveBeenLastCalledWith(
      'maintenance:qstash-monitor-schedule:v1',
      'verified',
      'EX',
      24 * 60 * 60,
    )
  })

  it('does not stampede QStash while another invocation owns the check', async () => {
    redisSet.mockResolvedValueOnce(null)
    await expect(ensureMonitoringSchedule()).resolves.toBe('recently_verified')
    expect(scheduleCreate).not.toHaveBeenCalled()
  })

  it('removes the short lease when verification fails so the next run retries', async () => {
    scheduleGet.mockResolvedValue({
      destination: 'https://wrong.example/api/cron/enqueue',
      cron: '*/5 * * * *',
      failureCallback: null,
      isPaused: false,
    })
    await expect(ensureMonitoringSchedule()).rejects.toThrow(
      'QStash monitoring schedule verification failed',
    )
    expect(redisDel).toHaveBeenCalledWith('maintenance:qstash-monitor-schedule:v1')
  })
})
