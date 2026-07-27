import { checkApplicationReadiness } from '@/lib/health'

export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await checkApplicationReadiness()
  return Response.json(
    {
      status: result.ready ? 'ok' : 'degraded',
      service: 'buyerwatch-web',
      timestamp: new Date().toISOString(),
      checks: result.checks,
    },
    {
      status: result.ready ? 200 : 503,
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
