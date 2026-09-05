import { BskyAgent } from '@atproto/api'
import { createClient } from '@supabase/supabase-js'
import { decrypt } from './encryption'
import { PlatformPostError } from './reddit-post'
import { createTimeoutFetch } from './http'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder'
  )
}

async function getDecryptedBlueskyConnection(userId: string) {
  const { data, error } = await getSupabase()
    .from('platform_connections')
    .select('access_token, external_username')
    .eq('user_id', userId)
    .eq('platform', 'bluesky')
    .single()

  if (error || !data || !data.access_token || !data.external_username) {
    throw new Error('Bluesky connection not found for user')
  }

  return {
    password: decrypt(data.access_token),
    identifier: data.external_username
  }
}

export async function postBlueskyReply(userId: string, threadExternalId: string, text: string) {
  const { password, identifier } = await getDecryptedBlueskyConnection(userId)
  
  const agent = new BskyAgent({
    service: 'https://bsky.social',
    fetch: createTimeoutFetch(15_000),
  })
  
  try {
    await agent.login({ identifier, password })
  } catch (e: any) {
    throw new PlatformPostError('bluesky', `Failed to login: ${e.message}`, false)
  }

  try {
    const threadResponse = await agent.getPostThread({ uri: threadExternalId, depth: 0 })
    const parentPost = (threadResponse.data.thread as any).post

    if (!parentPost) {
       throw new Error('Parent post not found')
    }

    const rootUri = parentPost.record?.reply?.root?.uri || parentPost.uri
    const rootCid = parentPost.record?.reply?.root?.cid || parentPost.cid

    const result = await agent.post({
      text,
      reply: {
        root: { uri: rootUri, cid: rootCid },
        parent: { uri: parentPost.uri, cid: parentPost.cid }
      }
    })

    const rkey = result.uri.split('/').pop()
    const did = result.uri.split('/')[3]
    return { permalink: `https://bsky.app/profile/${did}/post/${rkey}` }
  } catch (e: any) {
    const isRetryable = e.message.includes('Rate Limit') || e.message.includes('timeout')
    throw new PlatformPostError('bluesky', e.message, isRetryable)
  }
}
