import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { boundedString, isUuid, readJsonBody, RequestInputError } from '@/lib/request'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonBody<Record<string, unknown>>(request)
    const threadId = body.threadId
    const actionType = body.actionType
    const finalDraft = boundedString(body.finalDraft, 10_000, { trim: false })

    if (!isUuid(threadId) || typeof actionType !== 'string') {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!['APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED', 'COPIED'].includes(actionType)) {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 })
    }
    const rate = await actionRateLimit.limit(`feedback:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    // The service RPC re-reads the source draft, platform, target, and keyword
    // from the database. Client-supplied values cannot poison trust metrics.
    const { error } = await getServiceRoleClient().rpc('log_verified_draft_feedback', {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_final_draft: finalDraft || null,
      p_action_type: actionType,
    })

    if (error) {
      console.error('Error logging draft feedback:', error)
      return NextResponse.json({ error: 'Failed to log feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('Error in feedback API:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
