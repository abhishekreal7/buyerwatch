import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import { getServiceRoleClient } from '@/lib/admin'
import { recordEngagementEvent } from '@/lib/automation-audit'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { boundedString, isUuid, readJsonBody, RequestInputError } from '@/lib/request'

const PACKAGED_EXTENSION_ORIGIN = 'chrome-extension://akfjpaggkndebeidadabipjpkbchlhfe'

function allowedOrigin(origin: string | null): string | null {
  if (!origin) return null
  if (process.env.NODE_ENV !== 'production' && origin.startsWith('chrome-extension://')) {
    return origin
  }
  const configured = (process.env.CHROME_EXTENSION_ORIGINS ?? '')
    .split(',')
    .map(value => value.trim())
    .filter(Boolean)
  return configured.includes(origin) || origin === PACKAGED_EXTENSION_ORIGIN ? origin : null
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

function safeRedditPermalink(value: string | null): string | null {
  if (!value) return null
  try {
    const url = new URL(value)
    const hostname = url.hostname.toLowerCase()
    if (
      url.protocol !== 'https:'
      || !(hostname === 'reddit.com' || hostname.endsWith('.reddit.com'))
      || !/\/comments\/[^/]+\/[^/]+\/[^/]+/i.test(url.pathname)
    ) {
      return null
    }
    url.search = ''
    url.hash = ''
    return url.toString()
  } catch {
    return null
  }
}

function readOriginalDraft(value: unknown): string {
  if (Array.isArray(value)) return String(value[0]?.draft_text ?? '')
  if (value && typeof value === 'object' && 'draft_text' in value) {
    return String((value as { draft_text?: unknown }).draft_text ?? '')
  }
  return ''
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

    const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim()
    if (!bearer) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

    const admin = getServiceRoleClient()
    const { data: { user } } = await admin.auth.getUser(bearer)
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401, headers })

    const rate = await actionRateLimit.limit(`extension-reply:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429, headers })

    const body = await readJsonBody<Record<string, unknown>>(request, 16_384)
    const action = body.action
    const threadId = body.threadId
    const text = boundedString(body.text, 10_000, { required: true, trim: false })
    const permalink = safeRedditPermalink(boundedString(body.permalink, 2_000))
    if (
      (action !== 'prefilled' && action !== 'confirmed')
      || !isUuid(threadId)
      || text === null
      || (action === 'confirmed' && !permalink)
    ) {
      return NextResponse.json({ error: 'invalid_reply_status' }, { status: 400, headers })
    }

    const { data: thread } = await admin
      .from('monitored_threads')
      .select('id, platform, status, reply_analytics(draft_text)')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single()
    if (!thread || thread.platform !== 'reddit') {
      return NextResponse.json({ error: 'thread_not_found' }, { status: 404, headers })
    }

    if (action === 'prefilled') {
      await recordEngagementEvent(admin, {
        userId: user.id,
        threadId,
        eventType: 'reply_prefilled',
        platform: 'reddit',
        actorType: 'extension',
        source: 'chrome_extension',
        metadata: { textLength: text.length },
        idempotencyKey: `${threadId}:reply-prefilled`,
      })
      return NextResponse.json({ success: true, status: 'prefilled' }, { headers })
    }

    if (thread.status === 'replied') {
      return NextResponse.json({ success: true, status: 'already_confirmed' }, { headers })
    }

    const userClient = createSupabaseClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        auth: { persistSession: false, autoRefreshToken: false },
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      },
    )
    const { data: marked, error: markError } = await userClient.rpc('mark_thread_manually_replied_v2', {
      p_thread_id: threadId,
      p_final_text: text,
      p_permalink: permalink,
    })
    if (markError || marked !== true) {
      return NextResponse.json({ error: 'reply_confirmation_failed' }, { status: 409, headers })
    }

    const originalDraft = readOriginalDraft(thread.reply_analytics)
    const actionType = originalDraft === text ? 'APPROVED' : 'EDITED_APPROVED'
    const { error: feedbackError } = await admin.rpc('log_verified_draft_feedback', {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_final_draft: text,
      p_action_type: actionType,
    })
    if (feedbackError) {
      console.error('[extension/reply-status] Reply confirmed but feedback failed', feedbackError)
    }

    await recordEngagementEvent(admin, {
      userId: user.id,
      threadId,
      eventType: 'reply_confirmed',
      platform: 'reddit',
      actorType: 'extension',
      source: 'chrome_extension',
      metadata: { permalink, actionType },
      idempotencyKey: `${threadId}:reply-confirmed`,
    })

    return NextResponse.json({ success: true, status: 'confirmed', permalink }, { headers })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400, headers })
    }
    console.error('[extension/reply-status] Failed', error)
    return NextResponse.json({ error: 'reply_status_failed' }, { status: 500, headers })
  }
}
