import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { hasQStashConfiguration, publishQStashJson } from '@/lib/qstash'
import { boundedString, readJsonBody, RequestInputError } from '@/lib/request'
import { containsConfiguredPhrase } from '@/lib/phrase-match'
import {
  buildExtensionExternalId,
  extensionSourceIdentity,
  isExtensionPlatform,
  normalizeExtensionTimestamps,
} from '@/lib/extension-ingest'
import { isAllowedBuyerWatchExtensionOrigin } from '@/lib/extension-identity'

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  return isAllowedBuyerWatchExtensionOrigin(
    origin,
    process.env.CHROME_EXTENSION_ORIGINS,
  ) ? origin : null
}

function corsHeaders(origin: string | null): HeadersInit {
  const allowed = allowedOrigin(origin)
  return allowed
    ? {
        'Access-Control-Allow-Origin': allowed,
        'Access-Control-Allow-Headers': 'authorization, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
      }
    : {}
}

export async function OPTIONS(request: Request) {
  const origin = request.headers.get('origin')
  if (origin && !allowedOrigin(origin)) return new Response(null, { status: 403 })
  return new Response(null, { status: 204, headers: corsHeaders(origin) })
}

export async function POST(request: Request) {
  const origin = request.headers.get('origin')
  const headers = corsHeaders(origin)
  try {
    if (origin && !allowedOrigin(origin)) {
      return NextResponse.json({ error: 'origin_not_allowed' }, { status: 403, headers })
    }

    const sessionClient = await createClient()
    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    const { data: { user } } = bearer
      ? await getServiceRoleClient().auth.getUser(bearer)
      : await sessionClient.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

    const rate = await actionRateLimit.limit(`extension-ingest:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers })
    }

    const body = await readJsonBody<Record<string, unknown>>(request, 120_000)
    const platform = body.platform
    const submittedSourceEventId = boundedString(body.sourceEventId, 900, { required: true })
    const submittedSourceUrl = boundedString(body.url, 2_000, { required: true })
    const title = boundedString(body.title, 1_000)
    const text = boundedString(body.text, 100_000, { required: true, trim: false })
    const author = boundedString(body.author, 500) ?? ''
    const community = boundedString(body.community, 500) ?? ''
    const { capturedAt, sourceCreatedAt } = normalizeExtensionTimestamps(
      body.capturedAt,
      body.publishedAt,
    )

    if (
      !isExtensionPlatform(platform)
      || !submittedSourceEventId
      || !submittedSourceUrl
      || text === null
      || !text.trim()
    ) {
      return NextResponse.json({ error: 'invalid_capture' }, { status: 400, headers })
    }
    const sourceIdentity = extensionSourceIdentity(platform, submittedSourceUrl)
    if (!sourceIdentity) {
      return NextResponse.json({ error: 'invalid_source_url' }, { status: 400, headers })
    }
    if (submittedSourceEventId.toLowerCase() !== sourceIdentity.sourceEventId) {
      return NextResponse.json({ error: 'source_identity_mismatch' }, { status: 400, headers })
    }
    const { sourceEventId, sourceUrl } = sourceIdentity

    const admin = getServiceRoleClient()
    const { data: keywords, error: keywordError } = await admin
      .from('keywords')
      .select('id, term, target')
      .eq('user_id', user.id)
      .eq('platform', platform)
      .eq('is_active', true)
      .limit(100)
    if (keywordError) throw keywordError
    const searchable = `${title ?? ''}\n${text}`.toLowerCase()
    const keyword = (keywords ?? []).find(({ term }) => containsConfiguredPhrase(searchable, term))
    if (!keyword) {
      return NextResponse.json({ error: 'no_matching_keyword' }, { status: 422, headers })
    }

    const { data: insertedEvent, error: eventError } = await admin
      .from('ingestion_events')
      .upsert({
        user_id: user.id,
        source: 'chrome_extension',
        source_event_id: sourceEventId,
        source_url: sourceUrl,
        title: title || null,
        body: text,
        author: author || null,
        community: community || null,
        captured_at: capturedAt,
      }, {
        onConflict: 'user_id,source,source_event_id',
        ignoreDuplicates: true,
      })
      .select('id, processed_at')
      .maybeSingle()
    if (eventError) throw eventError
    let event = insertedEvent
    if (!event) {
      const { data: existingEvent, error: existingError } = await admin
        .from('ingestion_events')
        .select('id, processed_at')
        .eq('user_id', user.id)
        .eq('source', 'chrome_extension')
        .eq('source_event_id', sourceEventId)
        .single()
      if (existingError) throw existingError
      if (existingEvent.processed_at) {
        return NextResponse.json({ success: true, duplicate: true }, { headers })
      }
      event = existingEvent
    }

    const externalId = buildExtensionExternalId(platform, sourceEventId)
    const { error: pendingError } = await admin
      .from('monitored_threads')
      .upsert({
        user_id: user.id,
        keyword_id: keyword.id,
        platform,
        external_id: externalId,
        author: author || null,
        title: title || null,
        text_content: text,
        url: sourceUrl,
        source_created_at: sourceCreatedAt,
        intent_score: null,
        intent_label: null,
        status: 'pending',
        score_reasoning: 'Awaiting analysis',
        automation_reason: 'analysis_pending',
      }, {
        onConflict: 'user_id,platform,external_id',
        ignoreDuplicates: true,
      })
    if (pendingError) throw pendingError

    const canDispatch = Boolean(
      platform === 'reddit'
      && hasQStashConfiguration()
      && process.env.ANTHROPIC_API_KEY?.trim(),
    )
    if (!canDispatch) {
      return NextResponse.json({
        success: true,
        eventId: event.id,
        queued: false,
        status: 'awaiting_analysis',
      }, { status: 202, headers })
    }

    try {
      const messageId = await publishQStashJson('/api/jobs/score', {
        eventId: event.id,
        userId: user.id,
        keywordId: keyword.id,
        post: {
          platform,
          externalId,
          author,
          title: title || undefined,
          text,
          url: sourceUrl,
          createdAt: sourceCreatedAt,
          sourceTarget: community || keyword.target,
        },
      })
      if (!messageId) throw new Error('QStash is not configured')
    } catch (queueError) {
      console.error('[extension/ingest] Capture saved but dispatch failed', queueError)
      return NextResponse.json({
        success: true,
        eventId: event.id,
        queued: false,
        status: 'awaiting_analysis',
      }, { status: 202, headers })
    }

    return NextResponse.json({
      success: true,
      eventId: event.id,
      queued: true,
      status: 'queued',
    }, { status: 202, headers })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400, headers })
    }
    console.error('[extension/ingest] Capture failed', error)
    return NextResponse.json({ error: 'ingestion_failed' }, { status: 500, headers })
  }
}
