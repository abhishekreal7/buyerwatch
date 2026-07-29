import { NextResponse } from 'next/server'

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
}

export const dynamic = 'force-dynamic'

export function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS })
}

export function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim()

  if (!supabaseUrl || !supabaseAnonKey) {
    return NextResponse.json(
      { error: 'extension_auth_unavailable' },
      { status: 503, headers: CORS_HEADERS },
    )
  }

  return NextResponse.json({
    appName: 'BuyerWatch',
    supabaseUrl,
    supabaseAnonKey,
  }, {
    headers: {
      ...CORS_HEADERS,
      'Cache-Control': 'public, max-age=300',
    },
  })
}

