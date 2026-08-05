import { NextResponse, type NextRequest } from 'next/server'
import { updateSession } from '@/utils/supabase/middleware'
import { strictContentSecurityPolicy } from '@/lib/session-csp'

const SESSION_ROUTES = [
  '/dashboard',
  '/onboarding',
  '/opportunities',
  '/drafts',
  '/posted',
  '/analytics',
  '/keywords',
  '/settings',
  '/admin',
  '/login',
  '/signup',
  '/forgot-password',
  '/reset-password',
  '/auth',
]

function isSessionRoute(pathname: string): boolean {
  return SESSION_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`))
}

export async function proxy(request: NextRequest) {
  const isOAuthFallbackReturn =
    request.nextUrl.pathname === '/'
    && (
      request.nextUrl.searchParams.has('code')
      || request.nextUrl.searchParams.has('error')
      || request.nextUrl.searchParams.has('error_description')
    )

  // Supabase falls back to the configured Site URL when an exact OAuth
  // redirect URL is not allow-listed. Preserve the OAuth parameters and route
  // that fallback through the normal PKCE callback handler.
  if (isOAuthFallbackReturn) {
    const callbackUrl = request.nextUrl.clone()
    callbackUrl.pathname = '/auth/callback'
    return NextResponse.redirect(callbackUrl)
  }

  if (!isSessionRoute(request.nextUrl.pathname)) {
    return NextResponse.next()
  }

  const nonce = Buffer.from(crypto.randomUUID()).toString('base64')
  const contentSecurityPolicy = strictContentSecurityPolicy(nonce)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-nonce', nonce)
  requestHeaders.set('content-security-policy', contentSecurityPolicy)

  const response = await updateSession(request, requestHeaders)
  response.headers.set('Content-Security-Policy', contentSecurityPolicy)
  return response
}

export const config = {
  matcher: [
    /*
     * Match all request paths except for the ones starting with:
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * Feel free to modify this pattern to include more paths.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
