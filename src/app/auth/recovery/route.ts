import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const recoveryError = requestUrl.searchParams.get('error_description')
    || requestUrl.searchParams.get('error')

  if (recoveryError || !code) {
    logger.warn(
      { code: recoveryError ? 'recovery_provider_rejected' : 'recovery_code_missing' },
      'Password recovery callback was rejected',
    )
    return NextResponse.redirect(
      new URL('/forgot-password?error=invalid_or_expired', request.url),
    )
  }

  const supabase = await createClient()
  const { error } = await supabase.auth.exchangeCodeForSession(code)

  if (error) {
    logger.warn(
      { code: error.code ?? error.name },
      'Password recovery session exchange failed',
    )
    return NextResponse.redirect(
      new URL('/forgot-password?error=invalid_or_expired', request.url),
    )
  }

  return NextResponse.redirect(new URL('/reset-password', request.url))
}
