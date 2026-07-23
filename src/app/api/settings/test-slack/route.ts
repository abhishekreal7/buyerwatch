import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: NextRequest) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { webhookUrl } = await req.json()
  if (!webhookUrl || !webhookUrl.startsWith('https://hooks.slack.com/')) {
    return NextResponse.json({ error: 'Invalid webhook URL' }, { status: 400 })
  }

  const payload = {
    text: '✅ Scouto is connected to your Slack!',
    blocks: [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: '✅ *Scouto is connected to your Slack!*\n\nYou\'ll receive messages like this whenever a high-intent lead is found. Here\'s a preview of what a real notification looks like:',
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
          text: '*AI Draft Reply:*\n```Hey! I\'ve been building exactly this — Scouto monitors subreddits for high-intent posts and drafts replies automatically. Happy to share more if you\'re interested!```',
        },
      },
      {
        type: 'context',
        elements: [
          { type: 'mrkdwn', text: 'This is a test message from Scouto.' },
        ],
      },
    ],
  }

  const response = await fetch(webhookUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  })

  if (!response.ok) {
    return NextResponse.json({ error: 'Slack rejected the webhook' }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
