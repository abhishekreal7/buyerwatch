import { createClient } from '@supabase/supabase-js'
import { decrypt, encrypt } from './encryption'
import { parseRedditLoginResponse, type RedditLoginResult, type RedditSessionCookies } from './redditapis-contract'

type StoredRedditApisSession = {
  version: 1
  provider: 'redditapis'
  username: string
  cookies: RedditSessionCookies
}

type StoredSprinklrSession = {
  version: 2
  provider: 'sprinklr'
  username: string
  accountId: number
  channelId: string
}

type StoredRedditSession = StoredRedditApisSession | StoredSprinklrSession

export type ActiveRedditSession = StoredRedditSession & {
  accountCreatedAt: string | null
  linkKarma: number | null
  commentKarma: number | null
}

export type RedditConnectionStatus = 'active' | 'reauth_required' | 'error' | 'missing'

export type RedditConnectionSummary = {
  username: string | null
  status: RedditConnectionStatus
  lastVerifiedAt: string | null
  lastUsedAt: string | null
  accountCreatedAt: string | null
  linkKarma: number | null
  commentKarma: number | null
  lastErrorCode: string | null
}

export class RedditConnectionStateError extends Error {
  constructor(public readonly code: string) {
    super(code)
    this.name = 'RedditConnectionStateError'
  }
}

// This module is shared by the Next.js request runtime and the standalone
// worker, so it cannot import Next's `server-only` marker or the web-only admin
// helper. It still creates a service-role client exclusively from server-side
// environment variables and is never exposed through a client entry point.
function getServiceRoleClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  )
}

function validateStoredSession(value: unknown, expectedProvider: unknown): StoredRedditSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new RedditConnectionStateError('reddit_session_invalid')
  }
  const candidate = value as Record<string, unknown>
  if (candidate.version === 2) {
    const username = typeof candidate.username === 'string'
      ? candidate.username.trim().replace(/^u\//i, '')
      : ''
    const accountId = Number(candidate.accountId)
    const channelId = typeof candidate.channelId === 'string' ? candidate.channelId.trim() : ''
    if (
      expectedProvider !== 'sprinklr'
      || candidate.provider !== 'sprinklr'
      || !/^[A-Za-z0-9_-]{3,32}$/.test(username)
      || !Number.isSafeInteger(accountId)
      || accountId <= 0
      || !channelId
      || channelId.length > 200
    ) throw new RedditConnectionStateError('reddit_session_invalid')
    return { version: 2, provider: 'sprinklr', username, accountId, channelId }
  }
  if (candidate.version !== 1 || expectedProvider !== 'redditapis') {
    throw new RedditConnectionStateError('reddit_session_version_unsupported')
  }
  try {
    const parsed = parseRedditLoginResponse({
      success: true,
      username: candidate.username,
      cookies: candidate.cookies,
    })
    return { version: 1, provider: 'redditapis', username: parsed.username, cookies: parsed.cookies }
  } catch {
    throw new RedditConnectionStateError('reddit_session_invalid')
  }
}

export async function saveRedditApisConnection(input: {
  userId: string
  login: RedditLoginResult
  accountCreatedAt?: string | null
  linkKarma?: number | null
  commentKarma?: number | null
}): Promise<void> {
  const stored: StoredRedditApisSession = {
    version: 1,
    provider: 'redditapis',
    username: input.login.username,
    cookies: input.login.cookies,
  }
  const sessionCiphertext = encrypt(JSON.stringify(stored))
  const { data, error } = await getServiceRoleClient().rpc('save_redditapis_connection_v1', {
    p_user_id: input.userId,
    p_username: input.login.username,
    p_session_ciphertext: sessionCiphertext,
    p_account_created_at: input.accountCreatedAt ?? null,
    p_link_karma: input.linkKarma ?? input.login.linkKarma,
    p_comment_karma: input.commentKarma ?? input.login.commentKarma,
  })
  if (error || !data) {
    throw new RedditConnectionStateError('reddit_connection_save_failed')
  }
}

export async function saveSprinklrRedditConnection(input: {
  userId: string
  username: string
  accountId: number
  channelId: string
  accountCreatedAt?: string | null
  linkKarma?: number | null
  commentKarma?: number | null
}): Promise<void> {
  const stored: StoredSprinklrSession = {
    version: 2,
    provider: 'sprinklr',
    username: input.username,
    accountId: input.accountId,
    channelId: input.channelId,
  }
  const sessionCiphertext = encrypt(JSON.stringify(stored))
  const { data, error } = await getServiceRoleClient().rpc('save_sprinklr_reddit_connection_v1', {
    p_user_id: input.userId,
    p_username: input.username,
    p_session_ciphertext: sessionCiphertext,
    p_account_created_at: input.accountCreatedAt ?? null,
    p_link_karma: input.linkKarma ?? null,
    p_comment_karma: input.commentKarma ?? null,
  })
  if (error || !data) {
    throw new RedditConnectionStateError('reddit_connection_save_failed')
  }
}

export async function getActiveRedditSession(userId: string): Promise<ActiveRedditSession> {
  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('reddit_connection_secrets')
    .select('provider, session_ciphertext, status, account_created_at, link_karma, comment_karma')
    .eq('user_id', userId)
    .maybeSingle()

  if (error || !data) {
    throw new RedditConnectionStateError('reddit_connection_required')
  }
  if (data.status === 'reauth_required') {
    throw new RedditConnectionStateError('reddit_reconnect_required')
  }
  if (data.status !== 'active') {
    throw new RedditConnectionStateError('reddit_connection_unavailable')
  }

  try {
    return {
      ...validateStoredSession(JSON.parse(decrypt(data.session_ciphertext)) as unknown, data.provider),
      accountCreatedAt: data.account_created_at ?? null,
      linkKarma: Number.isSafeInteger(data.link_karma) ? data.link_karma : null,
      commentKarma: Number.isSafeInteger(data.comment_karma) ? data.comment_karma : null,
    }
  } catch (error) {
    await admin
      .from('reddit_connection_secrets')
      .update({
        status: 'error',
        last_error_code: 'reddit_session_decryption_failed',
        updated_at: new Date().toISOString(),
      })
      .eq('user_id', userId)
    if (error instanceof RedditConnectionStateError) throw error
    throw new RedditConnectionStateError('reddit_session_decryption_failed')
  }
}

export async function hasActiveRedditConnection(userId: string): Promise<boolean> {
  const { data, error } = await getServiceRoleClient()
    .from('reddit_connection_secrets')
    .select('connection_id')
    .eq('user_id', userId)
    .eq('status', 'active')
    .maybeSingle()
  return !error && Boolean(data)
}

export async function updateRedditConnectionAccountProfile(
  userId: string,
  profile: {
    accountCreatedAt: string | null
    linkKarma: number | null
    commentKarma: number | null
  },
): Promise<void> {
  const { data, error } = await getServiceRoleClient()
    .from('reddit_connection_secrets')
    .update({
      account_created_at: profile.accountCreatedAt,
      link_karma: profile.linkKarma,
      comment_karma: profile.commentKarma,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
    .eq('status', 'active')
    .select('connection_id')
    .maybeSingle()
  if (error || !data) {
    throw new RedditConnectionStateError('reddit_account_profile_save_failed')
  }
}

export async function getRedditConnectionSummary(userId: string): Promise<RedditConnectionSummary> {
  const admin = getServiceRoleClient()
  const [{ data: connection }, { data: secret, error: secretError }] = await Promise.all([
    admin
      .from('platform_connections')
      .select('external_username')
      .eq('user_id', userId)
      .eq('platform', 'reddit')
      .maybeSingle(),
    admin
      .from('reddit_connection_secrets')
      .select('status, last_verified_at, last_used_at, account_created_at, link_karma, comment_karma, last_error_code')
      .eq('user_id', userId)
      .maybeSingle(),
  ])

  if (!connection) {
    return {
      username: null,
      status: 'missing',
      lastVerifiedAt: null,
      lastUsedAt: null,
      accountCreatedAt: null,
      linkKarma: null,
      commentKarma: null,
      lastErrorCode: null,
    }
  }

  const status: RedditConnectionStatus = secretError || !secret
    ? 'reauth_required'
    : secret.status === 'active' || secret.status === 'reauth_required' || secret.status === 'error'
      ? secret.status
      : 'error'

  return {
    username: connection.external_username,
    status,
    lastVerifiedAt: secret?.last_verified_at ?? null,
    lastUsedAt: secret?.last_used_at ?? null,
    accountCreatedAt: secret?.account_created_at ?? null,
    linkKarma: secret?.link_karma ?? null,
    commentKarma: secret?.comment_karma ?? null,
    lastErrorCode: secret?.last_error_code ?? null,
  }
}

export async function markRedditConnectionHealthy(userId: string): Promise<void> {
  const now = new Date().toISOString()
  await getServiceRoleClient()
    .from('reddit_connection_secrets')
    .update({
      status: 'active',
      last_verified_at: now,
      last_used_at: now,
      consecutive_failures: 0,
      last_error_code: null,
      updated_at: now,
    })
    .eq('user_id', userId)
}

export async function markRedditConnectionReauthRequired(
  userId: string,
  errorCode = 'reddit_reconnect_required',
): Promise<void> {
  const admin = getServiceRoleClient()
  const now = new Date().toISOString()
  await Promise.all([
    admin
      .from('reddit_connection_secrets')
      .update({
        status: 'reauth_required',
        last_error_code: errorCode,
        updated_at: now,
      })
      .eq('user_id', userId),
    admin
      .from('job_outbox')
      .update({
        status: 'cancelled',
        dispatched_at: now,
        last_error: 'Automatic delivery cancelled: Reddit reconnect required',
      })
      .eq('user_id', userId)
      .eq('kind', 'auto_send')
      .in('status', ['pending', 'dispatched'])
      .contains('payload', { platform: 'reddit' }),
  ])
}

export async function recordRedditConnectionFailure(
  userId: string,
  errorCode: string,
): Promise<void> {
  const admin = getServiceRoleClient()
  const { data } = await admin
    .from('reddit_connection_secrets')
    .select('consecutive_failures')
    .eq('user_id', userId)
    .maybeSingle()
  await admin
    .from('reddit_connection_secrets')
    .update({
      consecutive_failures: Math.min(100, (Number(data?.consecutive_failures) || 0) + 1),
      last_error_code: errorCode,
      updated_at: new Date().toISOString(),
    })
    .eq('user_id', userId)
}
