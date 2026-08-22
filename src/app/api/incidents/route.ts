import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { data, error } = await getServiceRoleClient()
    .from('service_incidents')
    .select('id, kind, severity, status, title, message, action_path, started_at, updated_at, resolved_at')
    .or(`user_id.eq.${user.id},user_id.is.null`)
    .order('started_at', { ascending: false })
    .limit(20)
  if (error) {
    logger.error({ error }, 'Unable to load customer incidents')
    return NextResponse.json({ error: 'incidents_load_failed' }, { status: 500 })
  }
  return NextResponse.json({
    incidents: (data ?? []).map(incident => ({
      id: incident.id,
      kind: incident.kind,
      severity: incident.severity,
      status: incident.status,
      title: incident.title,
      message: incident.message,
      actionPath: incident.action_path,
      startedAt: incident.started_at,
      updatedAt: incident.updated_at,
      resolvedAt: incident.resolved_at,
    })),
  }, { headers: { 'Cache-Control': 'no-store' } })
}
