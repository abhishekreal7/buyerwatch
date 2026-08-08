import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { decrypt } from '@/lib/encryption'
import { fetchWithTimeout } from '@/lib/http'
import { isAllowedSlackWebhookUrl } from '@/lib/security/outbound-url'
import { getIp, settingsRateLimit } from '@/lib/ratelimit'
import { boundedString, readJsonBody, RequestInputError } from '@/lib/request'

export async function POST(req: NextRequest) {
  try {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await readJsonBody<Record<string, unknown>>(req, 2_048)
  const hasSuppliedWebhook = Object.prototype.hasOwnProperty.call(body, 'webhookUrl')
  const suppliedWebhook = hasSuppliedWebhook
    ? boundedString(body.webhookUrl, 1_000, { required: true })
    : ''
  if (hasSuppliedWebhook && (!suppliedWebhook || !isAllowedSlackWebhookUrl(suppliedWebhook))) {
    return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
  }
  const rate = await settingsRateLimit.limit(`slack-test:${user.id}:${await getIp()}`)
  if (!rate.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  let webhookUrl = suppliedWebhook
  if (!webhookUrl) {
    const { data: profile, error } = await getServiceRoleClient()
      .from('profiles')
      .select('slack_webhook_ciphertext, slack_webhook_url')
      .eq('id', user.id)
      .single()
    if (error) throw error
    webhookUrl = profile?.slack_webhook_ciphertext
      ? decrypt(profile.slack_webhook_ciphertext)
      : profile?.slack_webhook_url || ''
  }
  if (!webhookUrl || !isAllowedSlackWebhookUrl(webhookUrl)) {
    return NextResponse.json({ error: 'Slack webhook is not configured' }, { status: 400 })
  }

  const payload = {
    text: '✅ BuyerWatch is connected to your Slack!',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ *BuyerWatch is connected to your Slack!*\n\nYou\'ll receive messages like this whenever a high-intent lead is found. Here\'s a preview of what a real notification looks like:',
        },
      },
      { type: 'divider' },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: '*Subreddit*\nr/SaaS' },
          { type: 'mrkdwn', text: '*Author*\nu/example_user' },
          { type: 'mrkdwn', text: '*Intent Score*\n92/100 🔥' },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*Post:*\nLooking for a tool that monitors Reddit for mentions of my product — does anyone have recommendations?',
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '*AI Draft Reply:*\n```One useful way to reduce noise is to separate broad mentions from posts where the author names a current problem, constraint, or buying decision. I work on BuyerWatch, which monitors for those signals and keeps replies in review. (Disclosure: I\'m affiliated with BuyerWatch.)```',
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'This is a test message from BuyerWatch.' },
        ],
      },
    ],
  }

  const response = await fetchWithTimeout(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  }, 8_000)

  if (!response.ok) {
    return NextResponse.json({ error: 'Slack rejected the webhook' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    return NextResponse.json({ error: 'slack_test_failed' }, { status: 502 })
  }
}
