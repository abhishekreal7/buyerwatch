import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import {
  hasCloudflareRssShadowConfiguration,
  isAuthorizedCloudflareRssShadowRequest,
  parseRssShadowRunPayload,
} from '@/lib/cloudflare-rss-shadow'
import { readJsonBody, RequestInputError } from '@/lib/request'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  if (!hasCloudflareRssShadowConfiguration()) {
    return NextResponse.json({ error: 'shadow_monitor_disabled' }, { status: 503 })
  }
  if (!isAuthorizedCloudflareRssShadowRequest(request.headers.get('authorization'))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const payload = parseRssShadowRunPayload(
      await readJsonBody<unknown>(request, 32_768),
    )
    if (!payload) return NextResponse.json({ error: 'invalid_shadow_payload' }, { status: 400 })

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    )
    const { error } = await supabase
      .from('rss_shadow_monitor_runs')
      .upsert(
        payload.results.map(result => ({
          run_id: payload.runId,
          target: result.target,
          status: result.status,
          http_status: result.httpStatus,
          post_count: result.postCount,
          feed_fingerprint: result.feedFingerprint,
          error_code: result.errorCode,
          started_at: payload.startedAt,
          completed_at: payload.completedAt,
          worker_version: payload.workerVersion,
        })),
        { onConflict: 'run_id,target' },
      )
    if (error) throw error

    return NextResponse.json({ accepted: payload.results.length })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    logger.error({ error }, 'Unable to persist Cloudflare RSS shadow telemetry')
    return NextResponse.json({ error: 'shadow_results_unavailable' }, { status: 503 })
  }
}
