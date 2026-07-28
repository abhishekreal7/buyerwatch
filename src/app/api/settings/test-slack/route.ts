import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
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

  const { webhookUrl: rawWebhookUrl } = await readJsonBody<Record<string, unknown>>(req, 2_048)
  const webhookUrl = boundedString(rawWebhookUrl, 1_000, { required: true })
  if (!webhookUrl || !isAllowedSlackWebhookUrl(webhookUrl)) {
    return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
  }
  const rate = await settingsRateLimit.limit(`slack-test:${user.id}:${await getIp()}`)
  if (!rate.success) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
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
          text: '*AI Draft Reply:*\n```Hey! I\'ve been building exactly this — BuyerWatch monitors subreddits for high-intent posts and drafts replies automatically. Happy to share more if you\'re interested!```',
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
