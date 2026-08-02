import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { isUuid } from '@/lib/request'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const threadId = new URL(request.url).searchParams.get('threadId')
  if (!isUuid(threadId)) return NextResponse.json({ error: 'Invalid thread' }, { status: 400 })

  const [{ data: thread }, { data: audit }] = await Promise.all([
    supabase
      .from('monitored_threads')
      .select('status')
      .eq('id', threadId)
      .eq('user_id', user.id)
      .single(),
    supabase
      .from('send_audit_log')
      .select('status, error_message, permalink, created_at')
      .eq('thread_id', threadId)
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])

  if (!thread) return NextResponse.json({ error: 'Thread not found' }, { status: 404 })
  return NextResponse.json({
    status: thread.status,
    delivery: audit?.status ?? null,
    error: audit?.error_message ?? null,
    permalink: audit?.permalink ?? null,
  })
}
