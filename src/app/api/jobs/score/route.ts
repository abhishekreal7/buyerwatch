import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { logger } from '@/lib/logger'
import { verifyQStashRequest } from '@/lib/qstash'
import { isUuid } from '@/lib/request'
import { withScoreLock } from '@/lib/score-lock'
import type { NormalizedPost } from '@/lib/types'
import { processScorePost } from '../../../../../worker/handlers/score-post'
import { dispatchPendingOutbox } from '@/lib/backend-maintenance'
import { isRedditDirectPostingConfigured } from '@/lib/reddit-post'

export const dynamic = 'force-dynamic'
export const maxDuration = 300

function invalidPayload() {
  return NextResponse.json(
    { error: 'Invalid payload' },
    {
      status: 489,
      headers: { 'Upstash-NonRetryable-Error': 'true' },
    },
  )
}

type ScoreMessage = {
  eventId?: string
  userId: string
  keywordId: string
  post: NormalizedPost
}

function isScoreMessage(value: unknown): value is ScoreMessage {
  if (!value || typeof value !== 'object') return false
  const message = value as Partial<ScoreMessage>
  const post = message.post as Partial<NormalizedPost> | undefined
  return Boolean(
    isUuid(message.userId)
    && isUuid(message.keywordId)
    && (!message.eventId || isUuid(message.eventId))
    && post
    && (post.platform === 'reddit' || post.platform === 'bluesky')
    && typeof post.externalId === 'string'
    && post.externalId.length > 0
    && post.externalId.length <= 1_000
    && typeof post.text === 'string'
    && post.text.length <= 100_000
    && typeof post.url === 'string'
    && post.url.length <= 2_000
    && typeof post.createdAt === 'string'
  )
}

export async function POST(request: Request) {
  const rawBody = await request.text()
  if (!await verifyQStashRequest(request, rawBody)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let message: unknown
  try {
    message = JSON.parse(rawBody)
  } catch {
    return invalidPayload()
  }
  if (!isScoreMessage(message)) {
    return invalidPayload()
  }

  try {
    const allowAutoSend = message.post.platform === 'bluesky'
      || isRedditDirectPostingConfigured()
    const processed = await withScoreLock(
      message.userId,
      message.post.externalId,
      () => processScorePost(message, {
        allowAutoSend,
        enqueueFollowUpJobs: false,
        providerRetries: 0,
      }),
    )
    if (processed === null) {
      return NextResponse.json({ error: 'score_job_busy' }, { status: 503 })
    }

    if (allowAutoSend) await dispatchPendingOutbox(10)

    if (message.eventId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      )
      const { error } = await supabase
        .from('ingestion_events')
        .update({ processed_at: new Date().toISOString() })
        .eq('id', message.eventId)
        .eq('user_id', message.userId)
      if (error) throw error
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    logger.error({ error }, 'QStash score job failed')
    return NextResponse.json({ error: 'score_job_failed' }, { status: 503 })
  }
}
