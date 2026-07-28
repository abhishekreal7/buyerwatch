import { NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth'
import { fetchWithTimeout } from '@/lib/http'
import { logger } from '@/lib/logger'
import { enqueueDueMonitoring } from '@/lib/scheduler-jobs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const result = await enqueueDueMonitoring()

    if (process.env.HEALTHCHECK_PING_URL) {
      try {
        await fetchWithTimeout(process.env.HEALTHCHECK_PING_URL, {}, 5_000)
      } catch (error) {
        logger.warn({ error }, 'Monitor healthcheck ping failed')
      }
    }

    return NextResponse.json({
      enqueued: true,
      ...result,
    })
  } catch (error) {
    logger.error({ error }, 'Monitor cron failed')
    return NextResponse.json({ error: 'monitor_enqueue_failed' }, { status: 500 })
  }
}
