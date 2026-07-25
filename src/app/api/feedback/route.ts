import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(request: Request) {
  try {
    const supabase = await createClient()
    
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await request.json()
    const { 
      threadId, 
      originalDraft, 
      finalDraft, 
      actionType, 
      platform, 
      targetCommunity, 
      keywordCluster 
    } = body

    if (!threadId || !actionType) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }
    if (!['APPROVED', 'EDITED_APPROVED', 'REJECTED', 'SKIPPED', 'REGENERATE_REQUESTED'].includes(actionType)) {
      return NextResponse.json({ error: 'Invalid action type' }, { status: 400 })
    }

    // Call the Postgres function we created in schema.sql
    const { error } = await supabase.rpc('log_draft_feedback', {
      p_user_id: user.id,
      p_thread_id: threadId,
      p_original_draft: originalDraft || null,
      p_final_draft: finalDraft || null,
      p_action_type: actionType,
      p_platform: platform || null,
      p_target_community: targetCommunity || null,
      p_keyword_cluster: keywordCluster || null
    })

    if (error) {
      console.error('Error logging draft feedback:', error)
      return NextResponse.json({ error: 'Failed to log feedback' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error in feedback API:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
