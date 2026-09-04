import { NextResponse } from 'next/server'
import DodoPayments from 'dodopayments'
import { createClient } from '@/utils/supabase/server'
import { getAppUrl } from '@/lib/app-url'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { getDodoEnvironment } from '@/lib/dodo'
import { isTrustedSameOriginMutation } from '@/lib/request'

export async function POST(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const rate = await actionRateLimit.limit(`billing-portal:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const apiKey = process.env.DODO_PAYMENTS_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    let environment: ReturnType<typeof getDodoEnvironment>
    try {
      environment = getDodoEnvironment()
    } catch {
      console.error('[billing/portal] DODO_PAYMENTS_ENVIRONMENT is invalid')
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }
    const { data: profile } = await supabase
      .from('profiles')
      .select('billing_customer_id')
      .eq('id', user.id)
      .single()
    if (!profile?.billing_customer_id) {
      return NextResponse.json({ error: 'billing_customer_not_found' }, { status: 404 })
    }

    const dodo = new DodoPayments({
      bearerToken: apiKey,
      environment,
      timeout: 15_000,
      maxRetries: 1,
    })
    const session = await dodo.customers.customerPortal.create(
      profile.billing_customer_id,
      { return_url: `${getAppUrl()}/settings` },
    )
    return NextResponse.json({ url: session.link })
  } catch (error) {
    console.error('[billing/portal] Failed to create portal session', error)
    return NextResponse.json({ error: 'billing_portal_failed' }, { status: 502 })
  }
}
