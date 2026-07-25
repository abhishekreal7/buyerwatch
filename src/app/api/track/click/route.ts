import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getSafeHttpUrl } from '@/lib/security/outbound-url'

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token')
  const fallback = new URL('/', req.nextUrl.origin)
  if (!token) return NextResponse.redirect(fallback, { status: 302 })

  try {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
    )
    const { data, error } = await supabase
      .from('reply_attribution')
      .select('destination_url, clicked_at')
      .eq('attribution_token', token)
      .maybeSingle()

    const destination = data?.destination_url ? getSafeHttpUrl(data.destination_url) : null
    if (error || !destination) {
      return NextResponse.redirect(fallback, { status: 302 })
    }

    if (!data?.clicked_at) {
      await supabase
        .from('reply_attribution')
        .update({ clicked_at: new Date().toISOString() })
        .eq('attribution_token', token)
        .is('clicked_at', null)
    }

    return NextResponse.redirect(destination, { status: 302 })
  } catch {
    return NextResponse.redirect(fallback, { status: 302 })
  }
}
