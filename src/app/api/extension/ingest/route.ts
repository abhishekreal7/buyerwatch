import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { scorePostQueue } from '@/lib/queues'
import { boundedString, readJsonBody, RequestInputError } from '@/lib/request'

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  const configured = (process.env.CHROME_EXTENSION_ORIGINS ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
  return configured.includes(origin) ? origin : null
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
    const sourceEventId = boundedString(body.sourceEventId, 900, { required: true })
    const sourceUrl = boundedString(body.url, 2_000, { required: true })
    const title = boundedString(body.title, 1_000)
    const text = boundedString(body.text, 100_000, { required: true, trim: false })
    const author = boundedString(body.author, 500) ?? ''
    const community = boundedString(body.community, 500) ?? ''
    const capturedTime = typeof body.capturedAt === 'string'
      ? new Date(body.capturedAt).getTime()
      : Number.NaN
    const now = Date.now()
    const capturedAt = Number.isFinite(capturedTime)
      && capturedTime <= now + 5 * 60_000
      && capturedTime >= now - 10 * 365 * 24 * 60 * 60_000
      ? new Date(capturedTime).toISOString()
      : new Date(now).toISOString()

    if (
      (platform !== 'reddit' && platform !== 'bluesky')
      || !sourceEventId
      || !sourceUrl
      || text === null
      || !text.trim()
    ) {
      return NextResponse.json({ error: 'invalid_capture' }, { status: 400, headers })
    }
    let parsedUrl: URL
    try {
      parsedUrl = new URL(sourceUrl)
    } catch {
      return NextResponse.json({ error: 'invalid_source_url' }, { status: 400, headers })
    }
    const expectedHost = platform === 'reddit'
      ? /(^|\.)reddit\.com$/i
      : /(^|\.)bsky\.app$/i
    if (parsedUrl.protocol !== 'https:' || !expectedHost.test(parsedUrl.hostname)) {
      return NextResponse.json({ error: 'invalid_source_url' }, { status: 400, headers })
    }

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
    const keyword = (keywords ?? []).find(({ term }) => searchable.includes(term.toLowerCase()))
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

    const externalId = `${platform}:extension:${sourceEventId}`
    const safeId = createHash('sha256').update(externalId).digest('hex').slice(0, 32)
    await scorePostQueue.add('score', {
      userId: user.id,
      keywordId: keyword.id,
      post: {
        platform,
        externalId,
        author,
        title: title || undefined,
        text,
        url: sourceUrl,
        createdAt: capturedAt,
        sourceTarget: community || keyword.target,
      },
    }, {
      jobId: `score-${user.id}-${safeId}`,
    })
    await admin
      .from('ingestion_events')
      .update({ processed_at: new Date().toISOString() })
      .eq('id', event.id)

    return NextResponse.json({ success: true, eventId: event.id }, { status: 202, headers })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400, headers })
    }
    console.error('[extension/ingest] Capture failed', error)
    return NextResponse.json({ error: 'ingestion_failed' }, { status: 500, headers })
  }
}
