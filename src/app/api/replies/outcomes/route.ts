import { NextResponse } from 'next/server'
import { logger } from '@/lib/logger'
import { createClient } from '@/utils/supabase/server'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { data, error } = await supabase.rpc('get_reddit_reply_outcomes_v1', {
    p_user_id: user.id,
  })
  if (error) {
    logger.error({ error }, 'Unable to load reply outcomes')
    return NextResponse.json({ error: 'reply_outcomes_load_failed' }, { status: 500 })
  }
  const outcome = data && typeof data === 'object' && !Array.isArray(data)
    ? data
    : {}
  return NextResponse.json(outcome, { headers: { 'Cache-Control': 'no-store' } })
}
