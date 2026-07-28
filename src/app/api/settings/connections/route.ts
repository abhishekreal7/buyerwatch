import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { readJsonBody, RequestInputError } from '@/lib/request'

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { platform } = await readJsonBody<Record<string, unknown>>(request, 1_024)
    if (platform !== 'reddit' && platform !== 'bluesky') {
      return NextResponse.json({ error: 'invalid_platform' }, { status: 400 })
    }
    const rate = await settingsRateLimit.limit(`connection-delete:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const { error } = await getServiceRoleClient()
      .from('platform_connections')
      .delete()
      .eq('user_id', user.id)
      .eq('platform', platform)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'disconnect_failed' }, { status: 500 })
  }
}
