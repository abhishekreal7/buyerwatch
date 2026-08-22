import 'server-only'

import { createHash, randomBytes } from 'node:crypto'
import { getServiceRoleClient } from './admin'

const TOKEN_PREFIX = 'bwmcp_'
const TOKEN_PATTERN = /^bwmcp_[A-Za-z0-9_-]{43}$/

export type McpPrincipal = {
  tokenId: string
  userId: string
  clientId: string
}

function hashToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex')
}

export function createMcpAccessToken(): { token: string; hash: string; prefix: string } {
  const token = `${TOKEN_PREFIX}${randomBytes(32).toString('base64url')}`
  return {
    token,
    hash: hashToken(token),
    prefix: token.slice(0, 14),
  }
}

export async function authenticateMcpToken(token: string | undefined): Promise<McpPrincipal | null> {
  if (!token || !TOKEN_PATTERN.test(token)) return null

  const admin = getServiceRoleClient()
  const { data, error } = await admin
    .from('mcp_access_tokens')
    .select('id, user_id')
    .eq('token_hash', hashToken(token))
    .is('revoked_at', null)
    .maybeSingle()
  if (error || !data) return null

  await admin
    .from('mcp_access_tokens')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', data.id)
    .is('revoked_at', null)

  return {
    tokenId: data.id,
    userId: data.user_id,
    clientId: `buyerwatch-user-${data.user_id}`,
  }
}

