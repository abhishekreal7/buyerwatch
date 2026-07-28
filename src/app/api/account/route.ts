import { NextResponse } from 'next/server'
import DodoPayments from 'dodopayments'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { authRateLimit, getIp } from '@/lib/ratelimit'
import { readJsonBody, RequestInputError } from '@/lib/request'

export async function DELETE(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await readJsonBody<Record<string, unknown>>(request, 1_024)
    if (body.confirmation !== 'DELETE') {
      return NextResponse.json({ error: 'confirmation_required' }, { status: 400 })
    }
    const signedInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0
    if (!signedInAt || Date.now() - signedInAt > 15 * 60_000) {
      return NextResponse.json({ error: 'recent_login_required' }, { status: 403 })
    }
    const rate = await authRateLimit.limit(`account-delete:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const admin = getServiceRoleClient()
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('billing_subscription_id')
      .eq('id', user.id)
      .single()
    if (profileError) throw profileError

    if (profile.billing_subscription_id) {
      const apiKey = process.env.DODO_PAYMENTS_API_KEY
      if (!apiKey) {
        return NextResponse.json(
          { error: 'billing_cancellation_not_configured' },
          { status: 409 },
        )
      }
      const dodo = new DodoPayments({
        bearerToken: apiKey,
        environment: process.env.DODO_PAYMENTS_ENVIRONMENT === 'test_mode'
          ? 'test_mode'
          : 'live_mode',
        timeout: 15_000,
        maxRetries: 2,
      })
      await dodo.subscriptions.update(profile.billing_subscription_id, {
        status: 'cancelled',
        cancel_reason: 'cancelled_by_customer',
        cancellation_comment: 'Account deleted by customer',
      })
    }

    const { error } = await admin.auth.admin.deleteUser(user.id)
    if (error) throw error
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[account] Account deletion failed', error)
    return NextResponse.json({ error: 'account_deletion_failed' }, { status: 500 })
  }
}
