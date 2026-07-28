import { NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/security/cron-auth'
import { logger } from '@/lib/logger'
import { enqueueWeeklyDigests } from '@/lib/scheduler-jobs'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  if (!isAuthorizedCronRequest(request.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
  try {
    const result = await enqueueWeeklyDigests()
    return NextResponse.json({ success: true, ...result })
  } catch (error) {
    logger.error({ error }, 'Send digest cron failed')
    return NextResponse.json({ error: 'digest_enqueue_failed' }, { status: 500 })
  }
}
