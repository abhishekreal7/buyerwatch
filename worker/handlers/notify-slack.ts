import { Job } from 'bullmq'
import { logger } from '../../src/lib/logger'
import { supabaseWorker as supabase } from '../lib/supabase'
import { fetchWithTimeout } from '../../src/lib/http'
import { isAllowedSlackWebhookUrl } from '../../src/lib/security/outbound-url'

/**
 * Sends a Slack Block Kit notification to the user's configured webhook URL
 * when a high-intent lead is found.
 *
 * Job payload: { userId, postUrl, postTitle, postAuthor, intentScore, draftText, subreddit }
 */
export async function notifySlackHandler(job: Job) {
  const { userId, postUrl, postTitle, postAuthor, intentScore, draftText, subreddit } = job.data

  // 1. Fetch the user's Slack webhook URL and threshold from Supabase
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('slack_webhook_url, slack_notify_threshold, business_name')
    .eq('id', userId)
    .single()

  if (error) throw new Error(`Unable to load Slack notification settings: ${error.message}`)
  if (!profile) return { success: false, reason: 'no_profile' }

  const { slack_webhook_url, slack_notify_threshold, business_name } = profile

  if (!slack_webhook_url) {
    return { success: false, reason: 'no_webhook' }
  }
  if (!isAllowedSlackWebhookUrl(slack_webhook_url)) {
    throw new Error('Stored Slack webhook URL is not an allowed Slack endpoint')
  }

  const threshold = slack_notify_threshold ?? 70
  if (intentScore < threshold) {
    return { success: false, reason: 'below_threshold' }
  }

  // 2. Build Block Kit payload
  const scoreEmoji = intentScore >= 90 ? '🔥' : intentScore >= 80 ? '⚡' : '💡'
  const draftPreview = draftText
    ? draftText.slice(0, 300) + (draftText.length > 300 ? '…' : '')
    : 'No draft available.'

  const payload = {
    text: `${scoreEmoji} Scouto found a ${intentScore}% intent lead on r/${subreddit}`,
    blocks: [
      {
        type: 'header',
        text: {
          type: 'plain_text',
          text: `${scoreEmoji} New Lead — ${intentScore}% Intent`,
          emoji: true,
        },
      },
      {
        type: 'section',
        fields: [
          { type: 'mrkdwn', text: `*Subreddit*\nr/${subreddit}` },
          { type: 'mrkdwn', text: `*Author*\nu/${postAuthor}` },
          { type: 'mrkdwn', text: `*Intent Score*\n${intentScore}/100` },
          { type: 'mrkdwn', text: `*Business*\n${business_name || 'Your business'}` },
        ],
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*Post:*\n${postTitle || '(No title)'}`,
        },
      },
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `*AI Draft Reply:*\n\`\`\`${draftPreview}\`\`\``,
        },
      },
      {
        type: 'actions',
        elements: [
          {
            type: 'button',
            text: { type: 'plain_text', text: '↗ Open on Reddit', emoji: true },
            url: postUrl,
            style: 'primary',
          },
          {
            type: 'button',
            text: { type: 'plain_text', text: '📋 View in Scouto', emoji: true },
            url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard`,
          },
        ],
      },
      {
        type: 'divider',
      },
      {
        type: 'context',
        elements: [
          {
            type: 'mrkdwn',
            text: `Sent by Scouto · <${process.env.NEXT_PUBLIC_APP_URL}/settings|Manage notifications>`,
          },
        ],
      },
    ],
  }

  // 3. POST to Slack webhook
  try {
    const response = await fetchWithTimeout(slack_webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, 8_000)

    if (!response.ok) {
      const body = await response.text()
      logger.error({ userId, status: response.status, body }, '[Slack] Webhook POST failed')
      throw new Error(`Slack webhook returned HTTP ${response.status}`)
    }

    logger.info({ userId, intentScore, subreddit }, '[Slack] Notification sent successfully')
    return { success: true }
  } catch (err) {
    logger.error({ err, userId }, '[Slack] Network error posting to webhook')
    throw err // Let BullMQ retry
  }
}
