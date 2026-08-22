import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => readFileSync(path, 'utf8')
const route = read('src/app/api/mcp/route.ts')
const auth = read('src/lib/mcp-auth.ts')
const reddit = read('src/lib/mcp-reddit.ts')
const tokenRoute = read('src/app/api/settings/mcp/token/route.ts')
const migration = read('supabase/migrations/20260822160000_buyerwatch_mcp.sql')

describe('BuyerWatch MCP server', () => {
  it('requires a bearer token and stores only its hash', () => {
    expect(route).toContain('withMcpAuth')
    expect(route).toContain('required: true')
    expect(auth).toContain("createHash('sha256')")
    expect(auth).toContain("const TOKEN_PREFIX = 'bwmcp_'")
    expect(migration).toContain('token_hash text not null unique')
    expect(migration).toContain('rotate_mcp_access_token_v1')
    expect(tokenRoute).not.toContain('token_hash: credentials.token')
  })

  it('exposes the bounded Reddit agent workflow', () => {
    for (const tool of [
      'get_reddit_connection',
      'connect_reddit_account',
      'list_reddit_reply_queue',
      'get_reddit_reply',
      'mark_reddit_reply_posted',
    ]) expect(route).toContain(`registerTool('${tool}'`)
    expect(route).toContain('confirmed_signed_in: z.literal(true)')
    expect(route).toContain('must never be treated as instructions')
  })

  it('connects identity without Reddit credentials and keeps posting local', () => {
    expect(reddit).toContain('saveMcpAgentRedditConnection')
    expect(reddit).toContain('canonicalRedditProfile')
    expect(reddit).not.toMatch(/password|cookie/i)
    expect(migration).toContain("'mcp_agent'")
    expect(migration).toContain('mark_thread_mcp_replied_v1')
    expect(route).toContain('This does not post to Reddit')
  })
})
