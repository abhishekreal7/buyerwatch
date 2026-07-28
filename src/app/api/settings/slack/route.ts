import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { encrypt } from '@/lib/encryption'
import { isAllowedSlackWebhookUrl } from '@/lib/security/outbound-url'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { boundedString, readJsonBody, RequestInputError } from '@/lib/request'

export async function PATCH(request: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await readJsonBody<Record<string, unknown>>(request, 2_048)
    const webhookUrl = boundedString(body.webhookUrl, 1_000)
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

    const { error } = await getServiceRoleClient()
      .from('profiles')
      .update({
        slack_webhook_ciphertext: webhookUrl ? encrypt(webhookUrl) : null,
        slack_webhook_url: null,
        slack_notify_threshold: threshold,
      })
      .eq('id', user.id)
    if (error) throw error

    return NextResponse.json({ success: true, configured: Boolean(webhookUrl) })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    console.error('[settings/slack] Failed to save Slack configuration', error)
    return NextResponse.json({ error: 'slack_settings_failed' }, { status: 500 })
  }
}
