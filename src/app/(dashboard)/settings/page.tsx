// This file intentionally has no 'use client' — it is an async Server Component.
// It pre-fetches all settings data in parallel server-side, eliminating the
// 8 client-side API calls that previously caused a blank loading screen.

import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { redirect } from 'next/navigation'
import { normalizePlan, getPlanLimits } from '@/lib/plan-limits'
import {
  isToneArchetype,
  normalizeStyleGuardrails,
} from '@/lib/writing-style'
import { normalizeHighIntentThreshold } from '@/lib/high-intent-threshold'
import {
  getRedditPostingProviderKind,
  hasRedditDiscoveryProvider,
  hasRedditPostingProvider,
} from '@/lib/env'
import { getRedditConnectionSummary } from '@/lib/reddit-session'
import { isXDiscoveryConfigured } from '@/lib/x'
import { isXPostingConfigured } from '@/lib/x-post'
import SettingsPage, { type SettingsInitialData } from './SettingsPage'

export default async function SettingsServerPage() {
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) redirect('/login')

  const userId = user.id
  const now = new Date()
  const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

  // Fire all queries in parallel server-side — zero client round-trips on initial load
  let prefetch: Awaited<ReturnType<typeof loadSettingsPrefetch>>
  try {
    prefetch = await loadSettingsPrefetch(supabase, userId, firstDay)
  } catch (error) {
    console.error('[settings] Server prefetch threw; using the protected client load path', error)
    return <SettingsPage />
  }
  const {
    profileResult,
    threadsCountResult,
    draftsCountResult,
    sentCountResult,
    keywordsCountResult,
    trustResult,
    slackResult,
    platformConnectionsResult,
    redditSummary,
  } = prefetch

  // Initial data is all-or-nothing. Hydrating even one failed read as an
  // empty value can make a connected Slack channel look disconnected (and
  // then overwrite it on Save), or falsely lock a user's automation trust.
  // Let the client load path surface a retryable error instead.
  const initialDataError = [
    profileResult,
    threadsCountResult,
    draftsCountResult,
    sentCountResult,
    keywordsCountResult,
    trustResult,
    slackResult,
    platformConnectionsResult,
  ].find(result => result.error)?.error
  if (initialDataError || !profileResult.data) {
    console.error('[settings] Server prefetch failed; using the protected client load path', initialDataError)
    return <SettingsPage />
  }

  const p = profileResult.data

  // Build connections object matching the client component's state shape
  const rawConns = platformConnectionsResult.data ?? []
  const redditConn = rawConns.find(c => c.platform === 'reddit')
  const connections: SettingsInitialData['connections'] = {
    reddit: redditSummary.status === 'active',
    bluesky: rawConns.some(c => c.platform === 'bluesky'),
    x: rawConns.some(c => c.platform === 'x'),
    xUsername: rawConns.find(c => c.platform === 'x')?.external_username || '',
    redditUsername: redditConn?.external_username || '',
    redditStatus: redditSummary.status ?? 'missing',
    redditProvider: redditSummary.provider ?? null,
  }

  const plan = normalizePlan(p.plan)
  const limits = getPlanLimits(plan)

  const initialData: SettingsInitialData = {
    profile: {
      businessName: p.business_name || '',
      businessDescription: p.business_description || '',
      businessUrl: p.business_url || '',
      businessType: p.business_type || 'saas',
      writingStyle: p.writing_style || '',
      toneArchetype: isToneArchetype(p.tone_archetype) ? p.tone_archetype : null,
      styleGuardrails: normalizeStyleGuardrails(p.style_guardrails),
      competitors: (p.competitors || []).join(', '),
      toneExamples: p.tone_examples || '',
      redditUsername: p.reddit_username || '',
      autoSendEnabled: p.auto_send_enabled || false,
      autoSendThreshold: p.auto_send_threshold || 85,
      autoSendDailyLimit: p.auto_send_daily_limit || 3,
      autoSendPlatforms: Array.isArray(p.auto_send_platforms) ? p.auto_send_platforms : ['bluesky'],
      autoSendCommunities: Array.isArray(p.auto_send_communities) ? p.auto_send_communities.join(', ') : '',
      referralTrackingEnabled: p.referral_tracking_enabled !== false,
    },
    notifications: (p.notification_preferences as SettingsInitialData['notifications']) ?? {
      emailDigest: true,
      highIntentAlerts: true,
      weeklyReport: false,
    },
    highIntentThreshold: normalizeHighIntentThreshold(p.high_intent_threshold),
    slack: {
      configured: Boolean(slackResult.data?.slack_webhook_ciphertext || slackResult.data?.slack_webhook_url),
      threshold: slackResult.data?.slack_notify_threshold ?? 70,
    },
    webhookSecret: p.webhook_secret || '',
    connections,
    deliveryCapabilities: {
      blueskyDirectPosting: true,
      xDiscovery: isXDiscoveryConfigured(),
      xDirectPosting: isXPostingConfigured(),
      redditDirectPosting: hasRedditPostingProvider(),
      redditScheduledDiscovery: hasRedditDiscoveryProvider(),
      redditConnectionProvider: getRedditPostingProviderKind(),
      redditBrowserConnection: true,
    },
    usageStats: {
      threads: threadsCountResult.count || 0,
      drafts: draftsCountResult.count || 0,
      replies: sentCountResult.count || 0,
      keywords: keywordsCountResult.count || 0,
    },
    planState: {
      plan,
      keywordsMax: limits.keywords,
      threadsMax: limits.threadsPerMonth,
      draftsMax: limits.aiDraftsPerMonth,
    },
    draftsReviewed: Math.min(trustResult.data?.total_drafts_reviewed ?? 0, 10),
  }

  return <SettingsPage initialData={initialData} />
}

async function loadSettingsPrefetch(
  supabase: Awaited<ReturnType<typeof createClient>>,
  userId: string,
  firstDay: string,
) {
  const [
    profileResult,
    threadsCountResult,
    draftsCountResult,
    sentCountResult,
    keywordsCountResult,
    trustResult,
    slackResult,
    platformConnectionsResult,
    redditSummary,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, reddit_username, auto_send_enabled, auto_send_threshold, auto_send_daily_limit, auto_send_platforms, auto_send_communities, referral_tracking_enabled, notification_preferences, high_intent_threshold, webhook_secret, plan')
      .eq('id', userId)
      .single(),
    supabase.from('monitored_threads').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDay),
    supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDay).not('draft_text', 'is', null),
    supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDay).eq('was_sent', true),
    supabase.from('keywords').select('*', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('user_trust_metrics').select('total_drafts_reviewed').eq('user_id', userId).maybeSingle(),
    getServiceRoleClient()
      .from('profiles')
      .select('slack_webhook_ciphertext, slack_webhook_url, slack_notify_threshold')
      .eq('id', userId)
      .single(),
    supabase.from('platform_connections').select('platform, external_username').eq('user_id', userId),
    getRedditConnectionSummary(userId),
  ])
  return {
    profileResult,
    threadsCountResult,
    draftsCountResult,
    sentCountResult,
    keywordsCountResult,
    trustResult,
    slackResult,
    platformConnectionsResult,
    redditSummary,
  }
}
