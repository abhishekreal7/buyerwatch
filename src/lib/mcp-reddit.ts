import 'server-only'

import { getServiceRoleClient } from './admin'
import { recordEngagementEvent } from './automation-audit'
import { normalizeRedditUsername } from './redditapis-contract'
import { getRedditConnectionSummary, saveMcpAgentRedditConnection } from './reddit-session'

type ReplyAnalyticsRow = {
  draft_text?: string | null
  edited_text?: string | null
}

function analyticsRow(value: unknown): ReplyAnalyticsRow | null {
  if (Array.isArray(value)) return (value[0] as ReplyAnalyticsRow | undefined) ?? null
  if (value && typeof value === 'object') return value as ReplyAnalyticsRow
  return null
}

function finalDraft(value: unknown): string {
  const analytics = analyticsRow(value)
  return String(analytics?.edited_text || analytics?.draft_text || '').trim()
}

function canonicalRedditProfile(profileUrl: string, username: string): string | null {
  try {
    const url = new URL(profileUrl)
    const hostname = url.hostname.toLowerCase()
    const match = url.pathname.match(/^\/user\/([^/]+)\/?$/i)
    if (
      url.protocol !== 'https:'
      || !(hostname === 'reddit.com' || hostname === 'www.reddit.com')
      || !match
      || match[1].toLowerCase() !== username.toLowerCase()
    ) return null
    return `https://www.reddit.com/user/${username}/`
  } catch {
    return null
  }
}

export async function connectRedditThroughMcp(input: {
  userId: string
  clientId: string
  username: string
  profileUrl: string
}) {
  const username = normalizeRedditUsername(input.username)
  const profileUrl = username ? canonicalRedditProfile(input.profileUrl, username) : null
  if (!username || !profileUrl) throw new Error('reddit_identity_invalid')

  await saveMcpAgentRedditConnection({
    userId: input.userId,
    username,
    clientId: input.clientId,
  })
  return { username, profileUrl, provider: 'mcp_agent' as const, status: 'active' as const }
}

export async function getMcpRedditConnection(userId: string) {
  return getRedditConnectionSummary(userId)
}

export async function listMcpRedditReplies(userId: string, limit: number) {
  const { data, error } = await getServiceRoleClient()
    .from('monitored_threads')
    .select('id, title, text_content, url, author, intent_score, intent_label, status, created_at, reply_analytics(draft_text, edited_text)')
    .eq('user_id', userId)
    .eq('platform', 'reddit')
    .in('status', ['drafted', 'needs_manual_reply'])
    .order('created_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error('reddit_reply_queue_unavailable')

  return (data ?? [])
    .map((thread) => ({
      threadId: thread.id,
      title: thread.title || null,
      postUrl: thread.url || null,
      author: thread.author || null,
      intentScore: thread.intent_score === null ? null : Number(thread.intent_score),
      intentLabel: thread.intent_label || null,
      status: thread.status,
      createdAt: thread.created_at,
      draft: finalDraft(thread.reply_analytics),
    }))
    .filter((thread) => thread.postUrl && thread.draft)
}

export async function getMcpRedditReply(userId: string, threadId: string) {
  const { data, error } = await getServiceRoleClient()
    .from('monitored_threads')
    .select('id, title, text_content, url, author, intent_score, intent_label, status, created_at, reply_analytics(draft_text, edited_text)')
    .eq('id', threadId)
    .eq('user_id', userId)
    .eq('platform', 'reddit')
    .maybeSingle()
  if (error) throw new Error('reddit_reply_unavailable')
  if (!data) return null

  return {
    threadId: data.id,
    title: data.title || null,
    postText: data.text_content || null,
    postUrl: data.url || null,
    author: data.author || null,
    intentScore: data.intent_score === null ? null : Number(data.intent_score),
    intentLabel: data.intent_label || null,
    status: data.status,
    createdAt: data.created_at,
    draft: finalDraft(data.reply_analytics),
  }
}

export async function markMcpRedditReplyPosted(input: {
  userId: string
  threadId: string
  text: string
  permalink?: string | null
}) {
  const admin = getServiceRoleClient()
  const existing = await getMcpRedditReply(input.userId, input.threadId)
  if (!existing) throw new Error('reddit_reply_not_found')
  if (!['drafted', 'needs_manual_reply'].includes(existing.status)) {
    throw new Error('reddit_reply_not_sendable')
  }

  const { data, error } = await admin.rpc('mark_thread_mcp_replied_v1', {
    p_user_id: input.userId,
    p_thread_id: input.threadId,
    p_final_text: input.text,
    p_permalink: input.permalink || null,
  })
  if (error) throw new Error('reddit_reply_confirmation_failed')
  if (data !== true) throw new Error('reddit_reply_not_sendable')

  await recordEngagementEvent(admin, {
    userId: input.userId,
    threadId: input.threadId,
    eventType: 'reply_confirmed',
    platform: 'reddit',
    actorType: 'user',
    source: 'mcp_agent',
    metadata: { permalink: input.permalink || null },
    idempotencyKey: `${input.threadId}:reply-confirmed`,
  }).catch(() => undefined)

  return { success: true as const, threadId: input.threadId, status: 'replied' as const }
}

