import type { SupabaseClient } from '@supabase/supabase-js'
import { buildAttributionDestinationUrl } from './attribution'

export async function ensureAttributionMapping(
  supabase: SupabaseClient,
  input: {
    userId: string
    threadId: string
    token: string
    businessUrl: string
  },
): Promise<void> {
  const destinationUrl = buildAttributionDestinationUrl(input.businessUrl, input.token)
  const { error } = await supabase.from('reply_attribution').upsert({
    user_id: input.userId,
    thread_id: input.threadId,
    attribution_token: input.token,
    shortcode: input.token,
    destination_url: destinationUrl,
  }, { onConflict: 'attribution_token' })

  if (error) {
    throw new Error(`Unable to persist reply attribution: ${error.message}`)
  }
}
