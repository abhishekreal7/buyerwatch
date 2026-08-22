import { NextResponse } from 'next/server'
import { getPublicServiceStatus } from '@/lib/public-service-status'

export const dynamic = 'force-dynamic'

export async function GET() {
  const status = await getPublicServiceStatus()
  return NextResponse.json(status, {
    status: status.status === 'operational' ? 200 : 503,
    headers: { 'Cache-Control': 'public, max-age=30, stale-while-revalidate=60' },
  })
}
