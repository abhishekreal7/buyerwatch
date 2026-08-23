import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { encrypt } from '@/lib/encryption'
import { isAllowedSlackWebhookUrl } from '@/lib/security/outbound-url'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { boundedString, readJsonBody, RequestInputError } from '@/lib/request'
import { getPlanLimits } from '@/lib/plan-limits'

export async function GET() {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { data, error } = await getServiceRoleClient()
      .from('profiles')
      .select('plan, slack_webhook_ciphertext, slack_webhook_url, slack_notify_threshold')
      .eq('id', user.id)
      .single()
    if (error) throw error

    const available = getPlanLimits(data?.plan).slackNotifications
    return NextResponse.json({
      available,
      configured: Boolean(data?.slack_webhook_ciphertext || data?.slack_webhook_url),
      threshold: data?.slack_notify_threshold ?? 70,
    })
  } catch (error) {
    console.error('[settings/slack] Failed to load Slack configuration', error)
    return NextResponse.json({ error: 'slack_settings_failed' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await readJsonBody<Record<string, unknown>>(request, 2_048)
    const hasWebhookUpdate = Object.prototype.hasOwnProperty.call(body, 'webhookUrl')
    const webhookUrl = hasWebhookUpdate
      ? boundedString(body.webhookUrl, 1_000)
      : undefined
    const threshold = body.threshold
    if (
      webhookUrl === null
      || (webhookUrl && !isAllowedSlackWebhookUrl(webhookUrl))
      || !Number.isInteger(threshold)
      || Number(threshold) < 0
      || Number(threshold) > 100
    ) {
      return NextResponse.json({ error: 'invalid_slack_settings' }, { status: 400 })
    }

    const rate = await settingsRateLimit.limit(`slack-save:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const { data: profile, error: profileError } = await getServiceRoleClient()
      .from('profiles')
      .select('plan')
      .eq('id', user.id)
      .single()
    if (profileError) throw profileError
    if (!getPlanLimits(profile?.plan).slackNotifications) {
      return NextResponse.json({ error: 'plan_feature_unavailable', feature: 'slack_notifications' }, { status: 403 })
    }

    const updates: {
      slack_notify_threshold: number
      slack_webhook_ciphertext?: string | null
      slack_webhook_url?: null
    } = {
      slack_notify_threshold: Number(threshold),
    }
    if (hasWebhookUpdate) {
      updates.slack_webhook_ciphertext = webhookUrl ? encrypt(webhookUrl) : null
      updates.slack_webhook_url = null
    }

    const { data, error } = await getServiceRoleClient()
      .from('profiles')
      .update(updates)
      .eq('id', user.id)
      .select('slack_webhook_ciphertext, slack_webhook_url')
      .single()
    if (error) throw error

    return NextResponse.json({
      success: true,
      configured: Boolean(data?.slack_webhook_ciphertext || data?.slack_webhook_url),
    })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[settings/slack] Failed to save Slack configuration', error)
    return NextResponse.json({ error: 'slack_settings_failed' }, { status: 500 })
  }
}
