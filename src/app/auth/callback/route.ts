import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { friendlyAuthError } from '@/lib/auth-errors'
import { afterAuthenticationDestination } from '@/lib/billing-selection'
import { logger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const oauthError = requestUrl.searchParams.get('error_description') || requestUrl.searchParams.get('error')
  const selectedPlan = requestUrl.searchParams.get('plan')
  const selectedBilling = requestUrl.searchParams.get('billing')

  if (oauthError) {
    logger.warn({ code: 'oauth_provider_rejected' }, 'OAuth callback returned an error')
    return NextResponse.redirect(
      new URL(`/login?error=${encodeURIComponent(friendlyAuthError(oauthError))}`, request.url)
    )
  }

  if (code) {
    try {
      const supabase = await createClient()
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        logger.warn(
          { code: error.code ?? error.name },
          'OAuth session exchange failed',
        )
        return NextResponse.redirect(
          new URL(`/login?error=${encodeURIComponent(friendlyAuthError(error.message))}`, request.url)
        )
      }

      const user = data?.user
      if (user) {
        // Prevent OAuth provider identity data from wiping user's custom avatar or name
        const userMeta = (user.user_metadata ?? {}) as Record<string, unknown>
        if (userMeta.custom_avatar_url || userMeta.custom_name) {
          try {
            const { getServiceRoleClient } = await import('@/lib/admin')
            const admin = getServiceRoleClient()
            await admin.auth.admin.updateUserById(user.id, {
              user_metadata: {
                ...userMeta,
                ...(userMeta.custom_avatar_url ? {
                  avatar_url: userMeta.custom_avatar_url,
                  picture: userMeta.custom_avatar_url,
                } : {}),
                ...(userMeta.custom_name ? {
                  full_name: userMeta.custom_name,
                  name: userMeta.custom_name,
                } : {}),
              },
            })
          } catch (metaErr) {
            logger.warn({ err: metaErr }, 'Failed to persist custom metadata during OAuth sign-in')
          }
        }

        // Check if user has completed onboarding profile
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, business_name')
          .eq('id', user.id)
          .maybeSingle()

        if (!profile || !profile.business_name) {
          return NextResponse.redirect(new URL(afterAuthenticationDestination(selectedPlan, false, selectedBilling), request.url))
        }

        return NextResponse.redirect(new URL(afterAuthenticationDestination(selectedPlan, true, selectedBilling), request.url))
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Authentication callback failed'
      logger.error(
        { code: err instanceof Error ? err.name : 'unknown' },
        'OAuth callback handler failed',
      )
      return NextResponse.redirect(
        new URL(`/login?error=${encodeURIComponent(friendlyAuthError(message))}`, request.url)
      )
    }
  }

  return NextResponse.redirect(new URL('/login', request.url))
}
