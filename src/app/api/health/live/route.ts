export const dynamic = 'force-dynamic'

export function GET() {
  return Response.json(
    {
      status: 'ok',
      service: 'buyerwatch-web',
      timestamp: new Date().toISOString(),
      release: process.env.SENTRY_RELEASE ?? process.env.VERCEL_GIT_COMMIT_SHA ?? 'development',
    },
    {
      headers: {
        'Cache-Control': 'no-store',
      },
    },
  )
}
