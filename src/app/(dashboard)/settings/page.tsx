'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Bell, CreditCard, Save, Check,
  Globe, AtSign, Shield,
  Link, AlertTriangle, Sparkles, Mail, Activity, BarChart2, Send, Info
} from 'lucide-react'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { createClient } from '@/utils/supabase/client'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { AppPage } from '@/components/AppPage'
import { toast } from 'sonner'
import { PLAN_LIMITS, getPlanLimits, normalizePlan } from '@/lib/plan-limits'
import { useDashboardSession } from '@/components/DashboardContext'
import {
  STYLE_GUARDRAILS,
  TONE_ARCHETYPES,
  isToneArchetype,
  normalizeStyleGuardrails,
  type StyleGuardrail,
  type ToneArchetype,
} from '@/lib/writing-style'
import {
  DEFAULT_HIGH_INTENT_THRESHOLD,
  HIGH_INTENT_THRESHOLD_MAX,
  HIGH_INTENT_THRESHOLD_MIN,
  normalizeHighIntentThreshold,
} from '@/lib/high-intent-threshold'
import { DataLoadError } from '@/components/DataLoadError'

/* ─── Nav sections ────────────────────────────────────────────────── */
const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: User, description: 'Business info & writing style' },
  { id: 'connections', label: 'Connections', icon: Link, description: 'Platform accounts & automation' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts & digest preferences' },
  { id: 'plan', label: 'Plan & Billing', icon: CreditCard, description: 'Subscription & usage' },
]

/* ─── Sub-components ─────────────────────────────────────────────── */

function SectionCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-gray-100 bg-surface">
      <div className="border-b border-gray-100 px-4 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
        <h3 className="text-[18px] font-semibold leading-[1.3] tracking-[-0.015em] text-gray-900">{title}</h3>
        {description && <p className="text-[14px] font-[400] text-[rgba(43,38,33,0.52)] mt-1.5 leading-snug tracking-[0]">{description}</p>}
      </div>
      <div className="p-4 sm:p-6">{children}</div>
    </section>
  )
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <label className="text-[13px] font-medium text-gray-700">{label}</label>
        {hint && <span className="text-[11px] text-gray-400">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls = "w-full bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-[13.5px] text-gray-900 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-gray-900/10 focus:border-gray-300 transition-all duration-150"

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:ring-offset-1"
    >
      <span className={`relative h-[22px] w-10 rounded-full transition-colors duration-200 ${checked ? 'bg-gray-900' : 'bg-gray-200'}`}>
        <span className={`absolute left-[3px] top-[3px] h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function PlatformRow({
  icon, name, description, connected, onConnect, onDisconnect, children
}: {
  icon: React.ReactNode; name: string; description: string;
  connected: boolean; onConnect?: () => void; onDisconnect?: () => void; children?: React.ReactNode
}) {
  return (
    <div className="rounded-xl border border-gray-100 overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:gap-4">
        <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[14px] font-semibold text-gray-900">{name}</p>
            {connected && (
              <span className="flex items-center gap-1 text-[11px] font-semibold text-emerald-600 bg-emerald-50 px-1.5 py-0.5 rounded-full">
                <span className="w-1.5 h-1.5 bg-emerald-500 rounded-full" />
                Connected
              </span>
            )}
          </div>
          <p className="text-[12px] text-gray-500 mt-0.5">{description}</p>
        </div>
        <div className="ml-[48px] shrink-0 sm:ml-0">
          {connected ? (
            <button type="button" onClick={onDisconnect} className="min-h-11 cursor-pointer rounded-lg px-3 py-1.5 text-[13px] font-medium text-red-500 transition-colors hover:bg-red-50 hover:text-red-600">
              Disconnect
            </button>
          ) : onConnect ? (
            <button type="button" onClick={onConnect} className="min-h-11 cursor-pointer rounded-lg bg-gray-100 px-3 py-1.5 text-[13px] font-semibold text-gray-900 transition-colors hover:bg-gray-200">
              Connect
            </button>
          ) : null}
        </div>
      </div>
      {children && <div className="border-t border-gray-50 px-4 pb-4 pt-3">{children}</div>}
    </div>
  )
}

/* ─── Main component ─────────────────────────────────────────────── */

export default function SettingsPage() {
  const [activeSection, setActiveSection] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(true)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  const upgradeHandledRef = useRef(false)

  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get('section')
    if (SECTIONS.some((section) => section.id === requestedSection)) {
      setActiveSection(requestedSection as string)
    }
  }, [])

  const [profile, setProfile] = useState({
    businessName: '',
    businessDescription: '',
    businessUrl: '',
    businessType: 'saas',
    writingStyle: '',
    toneArchetype: null as ToneArchetype | null,
    styleGuardrails: [] as StyleGuardrail[],
    competitors: '',
    toneExamples: '',
    redditUsername: '',
    autoSendEnabled: false,
    autoSendThreshold: 85,
    autoSendDailyLimit: 3,
    autoSendPlatforms: ['bluesky'] as string[],
    autoSendCommunities: '',
    referralTrackingEnabled: true,
  })
  const [activationAcknowledged, setActivationAcknowledged] = useState(false)

  const [connections, setConnections] = useState({
    reddit: false,
    bluesky: false,
    redditUsername: '',
    redditStatus: 'missing' as 'active' | 'reauth_required' | 'error' | 'missing',
  })
  const [deliveryCapabilities, setDeliveryCapabilities] = useState({
    redditDirectPosting: false,
    redditScheduledDiscovery: false,
    blueskyDirectPosting: true,
    redditConnectionProvider: null as 'sprinklr' | 'redditapis' | null,
  })
  const [bskyHandle, setBskyHandle] = useState('')
  const [bskyPassword, setBskyPassword] = useState('')
  const [bskyConnecting, setBskyConnecting] = useState(false)
  const [redditLoginUsername, setRedditLoginUsername] = useState('')
  const [redditPassword, setRedditPassword] = useState('')
  const [redditTotpSecret, setRedditTotpSecret] = useState('')
  const [redditConnecting, setRedditConnecting] = useState(false)

  const [slack, setSlack] = useState({ webhookUrl: '', threshold: 70 })
  const [slackConfigured, setSlackConfigured] = useState(false)
  const [slackTesting, setSlackTesting] = useState(false)
  const [slackDisconnecting, setSlackDisconnecting] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState('')

  const [notifications, setNotifications] = useState({
    emailDigest: true,
    highIntentAlerts: true,
    weeklyReport: false,
  })
  const [highIntentThreshold, setHighIntentThreshold] = useState(DEFAULT_HIGH_INTENT_THRESHOLD)

  const [planState, setPlanState] = useState<{ plan: string, keywordsMax: number, threadsMax: number, draftsMax: number }>({
    plan: 'free',
    keywordsMax: PLAN_LIMITS.free.keywords,
    threadsMax: PLAN_LIMITS.free.threadsPerMonth,
    draftsMax: PLAN_LIMITS.free.aiDraftsPerMonth,
  })
  const [usageStats, setUsageStats] = useState({ threads: 0, drafts: 0, replies: 0, keywords: 0 })
  // total_drafts_reviewed from user_trust_metrics — used to show trust-meter in locked auto-send toggle
  const [draftsReviewed, setDraftsReviewed] = useState<number>(0)

  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  useEffect(() => {
    async function load() {
      setSettingsLoading(true)
      setLoadFailed(false)

      try {
        const now = new Date()
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
        const slackSettingsPromise = fetch('/api/settings/slack', { cache: 'no-store' })
          .then(async response => {
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || 'slack_settings_failed')
            return payload as { configured?: boolean; threshold?: number }
          })
        const connectionsPromise = fetch('/api/settings/connections', { cache: 'no-store' })
          .then(async response => {
            const payload = await response.json().catch(() => null)
            if (!response.ok) throw new Error(payload?.error || 'connections_load_failed')
            return payload as {
              connections: Array<{
                platform: string
                external_username: string | null
                status?: 'active' | 'reauth_required' | 'error' | 'missing'
              }>
              capabilities: {
                redditDirectPosting: boolean
                redditScheduledDiscovery: boolean
                blueskyDirectPosting: boolean
                redditConnectionProvider: 'sprinklr' | 'redditapis' | null
              }
            }
          })
        const [
          extendedProfileResult,
          connectionsResult,
          threadsCountResult,
          draftsCountResult,
          sentCountResult,
          keywordsCountResult,
          trustResult,
          slackSettings,
        ] = await Promise.all([
          supabase
            .from('profiles')
            .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, reddit_username, auto_send_enabled, auto_send_threshold, auto_send_daily_limit, auto_send_platforms, auto_send_communities, referral_tracking_enabled, notification_preferences, high_intent_threshold, webhook_secret, plan')
            .eq('id', userId)
            .single(),
          connectionsPromise,
          supabase.from('monitored_threads').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDay),
          supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDay).not('draft_text', 'is', null),
          supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', userId).gte('created_at', firstDay).eq('was_sent', true),
          supabase.from('keywords').select('*', { count: 'exact', head: true }).eq('user_id', userId),
          supabase
            .from('user_trust_metrics')
            .select('total_drafts_reviewed')
            .eq('user_id', userId)
            .maybeSingle(),
          slackSettingsPromise,
        ])

        const requiredQueryError = [
          threadsCountResult,
          draftsCountResult,
          sentCountResult,
          keywordsCountResult,
          trustResult,
        ].find(result => result.error)?.error
        if (requiredQueryError) throw requiredQueryError

        const extendedProfile = extendedProfileResult.data
        let p = extendedProfile
        if (!p) {
          const legacyProfileResult = await supabase
            .from('profiles')
            .select('business_name, business_description, business_url, business_type, writing_style, competitors, tone_examples, reddit_username, auto_send_enabled, auto_send_threshold, referral_tracking_enabled, notification_preferences, high_intent_threshold, webhook_secret, plan')
            .eq('id', userId)
            .single()
          if (legacyProfileResult.error) throw legacyProfileResult.error
          const legacyProfile = legacyProfileResult.data
          p = legacyProfile
          ? {
              ...legacyProfile,
              tone_archetype: null,
              style_guardrails: [],
              auto_send_daily_limit: 3,
              auto_send_platforms: ['bluesky'],
              auto_send_communities: [],
            }
            : null
        }
        if (!p) throw new Error('Settings profile was not found')

        setProfile({
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
          referralTrackingEnabled: p.referral_tracking_enabled !== false, // default true
        })
        if (p.notification_preferences) setNotifications(p.notification_preferences)
        setHighIntentThreshold(normalizeHighIntentThreshold(p.high_intent_threshold))
        setSlack({ webhookUrl: '', threshold: slackSettings.threshold ?? 70 })
        setSlackConfigured(Boolean(slackSettings.configured))
        setWebhookSecret(p.webhook_secret || '')

        const conns = connectionsResult.connections
        if (conns) {
        const redditConn = conns.find(c => c.platform === 'reddit')
        setConnections({
          reddit: redditConn?.status === 'active',
          bluesky: conns.some(c => c.platform === 'bluesky'),
          redditUsername: redditConn?.external_username || '',
          redditStatus: redditConn?.status ?? 'missing',
        })
        }
        setDeliveryCapabilities(connectionsResult.capabilities)

        setUsageStats({
        threads: threadsCountResult.count || 0,
        drafts: draftsCountResult.count || 0,
        replies: sentCountResult.count || 0,
        keywords: keywordsCountResult.count || 0,
        })

        const plan = normalizePlan(p.plan)
        const limits = getPlanLimits(plan)
        setPlanState({
          plan,
          keywordsMax: limits.keywords,
          threadsMax: limits.threadsPerMonth,
          draftsMax: limits.aiDraftsPerMonth,
        })

        const trustData = trustResult.data
        setDraftsReviewed(Math.min(trustData?.total_drafts_reviewed ?? 0, 10))
      } catch (error) {
        console.error('[settings] Unable to load settings', error)
        setLoadFailed(true)
        toast.error('Unable to load settings.')
      } finally {
        setSettingsLoading(false)
      }
    }
    void load()

    const params = new URLSearchParams(window.location.search)
    const requestedSection = params.get('section')
    if (SECTIONS.some(section => section.id === requestedSection)) {
      setActiveSection(requestedSection!)
    }
    if (params.get('billing') === 'plan_change_pending') {
      toast.success('Your plan change was submitted. Billing will update shortly.')
      window.history.replaceState({}, '', '/settings?section=plan')
    }
  }, [loadAttempt, supabase, userId])

  const handleSave = async () => {
    if (settingsLoading || loadFailed) {
      toast.error('Load your settings successfully before saving changes.')
      return
    }
    setSaving(true)

    try {
      const baseProfileUpdates = {
        business_name: profile.businessName,
        business_description: profile.businessDescription,
        business_url: profile.businessUrl,
        business_type: profile.businessType,
        writing_style: profile.writingStyle,
        competitors: profile.competitors.split(',').map(s => s.trim()).filter(Boolean),
        tone_examples: profile.toneExamples,
        reddit_username: profile.redditUsername,
        referral_tracking_enabled: profile.referralTrackingEnabled,
        notification_preferences: notifications,
        high_intent_threshold: normalizeHighIntentThreshold(highIntentThreshold),
      }
      const saveProfile = async () => {
        const extendedResult = await supabase.from('profiles').update({
          ...baseProfileUpdates,
          tone_archetype: profile.toneArchetype,
          style_guardrails: profile.styleGuardrails,
        }).eq('id', userId)
        if (!extendedResult.error) return extendedResult
        return supabase.from('profiles').update(baseProfileUpdates).eq('id', userId)
      }

      const slackWebhookUrl = slack.webhookUrl.trim()
      const slackPayload: { threshold: number; webhookUrl?: string } = {
        threshold: slack.threshold,
      }
      if (slackWebhookUrl || !slackConfigured) slackPayload.webhookUrl = slackWebhookUrl
      const slackRequest = fetch('/api/settings/slack', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(slackPayload),
      })
      const [{ error }, autoSendResponse, slackResponse] = await Promise.all([
        saveProfile(),
        fetch('/api/settings/autosend', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            auto_send_enabled: profile.autoSendEnabled,
            auto_send_threshold: profile.autoSendThreshold,
            auto_send_daily_limit: profile.autoSendDailyLimit,
            auto_send_platforms: profile.autoSendPlatforms,
            auto_send_communities: profile.autoSendCommunities
              .split(',')
              .map(value => value.trim())
              .filter(Boolean),
            activation_acknowledged: activationAcknowledged,
          }),
        }),
        slackRequest,
      ])

      if (error || !autoSendResponse.ok || !slackResponse.ok) {
        throw new Error('One or more settings could not be saved')
      }
      const savedSlack = await slackResponse.json().catch(() => null)
      setSlackConfigured(Boolean(savedSlack?.configured))
      if (slackWebhookUrl) setSlack(current => ({ ...current, webhookUrl: '' }))
      clearSupabaseReadCache()
      setSaveSuccess(true)
      setActivationAcknowledged(false)
      toast.success('Settings saved')
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (error) {
      console.error('[settings] Unable to save settings', error)
      toast.error('Some settings could not be saved. Reload this page to confirm the saved values.')
    } finally {
      setSaving(false)
    }
  }

  const handleUpgrade = async (
    plan: 'starter' | 'pro' | 'growth' = 'pro',
    billing: 'monthly' | 'annual' = 'monthly',
  ) => {
    setUpgrading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan, billing }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
      } else {
        const messages: Record<string, string> = {
          plan_already_active: 'That plan is already active.',
          billing_subscription_requires_attention: 'Resolve the existing subscription in billing settings before changing plans.',
          billing_subscription_product_unknown: 'Your current subscription needs support review before it can be changed.',
          billing_not_configured: 'Billing is not configured yet.',
        }
        toast.error(messages[data?.error] || 'Could not start the plan change.')
      }
    } catch (err) {
      console.error(err)
      toast.error('Billing not yet configured')
    } finally {
      setUpgrading(false)
    }
  }

  const handleManageBilling = async () => {
    setOpeningPortal(true)
    try {
      const response = await fetch('/api/billing/portal', { method: 'POST' })
      const data = await response.json().catch(() => null)
      if (!response.ok || !data?.url) throw new Error(data?.error || 'portal_failed')
      window.location.href = data.url
    } catch (error) {
      console.error(error)
      toast.error('Could not open billing management.')
      setOpeningPortal(false)
    }
  }

  useEffect(() => {
    if (upgradeHandledRef.current) return
    const query = new URLSearchParams(window.location.search)
    const requestedPlan = query.get('upgrade')
    const requestedBilling = query.get('billing') === 'annual' ? 'annual' : 'monthly'
    if (requestedPlan !== 'starter' && requestedPlan !== 'pro' && requestedPlan !== 'growth') return
    upgradeHandledRef.current = true
    window.history.replaceState({}, '', '/settings?section=plan')
    void handleUpgrade(requestedPlan, requestedBilling)
  }, [])

  const handleConnectReddit = async () => {
    const usesSprinklr = deliveryCapabilities.redditConnectionProvider === 'sprinklr'
    if (!usesSprinklr && (!redditLoginUsername.trim() || !redditPassword)) {
      toast.error('Enter your Reddit username and password.')
      return
    }
    setRedditConnecting(true)
    try {
      const response = await fetch('/api/settings/reddit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usesSprinklr ? {} : {
          username: redditLoginUsername.trim(),
          password: redditPassword,
          ...(redditTotpSecret.trim() ? { totpSecret: redditTotpSecret.trim() } : {}),
        }),
      })
      const payload = await response.json().catch(() => null) as {
        error?: string
        connection?: { external_username?: string }
      } | null
      if (!response.ok) throw new Error(payload?.error || 'reddit_connection_failed')

      const connectedUsername = payload?.connection?.external_username
        || redditLoginUsername.trim()
      clearSupabaseReadCache()
      setConnections(current => ({
        ...current,
        reddit: true,
        redditUsername: connectedUsername,
        redditStatus: 'active',
      }))
      setRedditLoginUsername('')
      window.dispatchEvent(new Event('buyerwatch:connections-changed'))
      toast.success(`Reddit connected as u/${connectedUsername}`)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'reddit_connection_failed'
      if (code === 'reddit_credentials_or_2fa_rejected') {
        toast.error('Reddit rejected the credentials or 2FA secret.')
      } else if (code === 'rate_limited') {
        toast.error('Too many connection attempts. Please wait and try again.')
      } else if (code === 'reddit_provider_rate_limited') {
        toast.error('RedditAPIs is rate-limiting connections. Wait 10 minutes, then try once.')
      } else if (code === 'reddit_provider_temporarily_unavailable') {
        toast.error('RedditAPIs could not reach Reddit after one safe retry. Try again later.')
      } else if (code === 'sprinklr_authentication_failed') {
        toast.error('Sprinklr rejected the configured API credentials. An administrator must reconnect the integration.')
      } else if (code === 'sprinklr_reddit_account_invalid') {
        toast.error('The configured Sprinklr account is not an active Reddit account.')
      } else {
        toast.error('Could not connect Reddit. Check the details and try again.')
      }
    } finally {
      setRedditPassword('')
      setRedditTotpSecret('')
      setRedditConnecting(false)
    }
  }

  const handleConnectBluesky = async () => {
    if (!bskyHandle || !bskyPassword) { toast.error('Enter your handle and app password'); return }
    setBskyConnecting(true)
    try {
      const res = await fetch('/api/settings/bluesky', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ handle: bskyHandle, password: bskyPassword }),
      })
      if (!res.ok) throw new Error('connection_rejected')
      clearSupabaseReadCache()
      setConnections(p => ({ ...p, bluesky: true }))
      setBskyPassword('')
      toast.success('Bluesky connected')
    } catch (error) {
      console.error('[settings] Unable to connect Bluesky', error)
      toast.error(error instanceof Error && error.message === 'connection_rejected'
        ? 'Invalid credentials'
        : 'Could not connect Bluesky. Check your connection and try again.')
    } finally {
      setBskyConnecting(false)
    }
  }

  const handleDisconnect = async (platform: 'reddit' | 'bluesky') => {
    try {
      const response = await fetch('/api/settings/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      if (!response.ok) throw new Error('disconnect_failed')
      clearSupabaseReadCache()
      setConnections(p => platform === 'reddit'
        ? { ...p, reddit: false, redditUsername: '', redditStatus: 'missing' }
        : { ...p, bluesky: false })
      window.dispatchEvent(new Event('buyerwatch:connections-changed'))
      toast.success(`${platform} disconnected`)
    } catch (error) {
      console.error(`[settings] Unable to disconnect ${platform}`, error)
      toast.error(`Failed to disconnect ${platform}`)
    }
  }

  const copySettingValue = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value)
      toast.success(`${label} copied`)
    } catch (error) {
      console.error(`[settings] Unable to copy ${label.toLowerCase()}`, error)
      toast.error(`Could not copy ${label.toLowerCase()}.`)
    }
  }

  const handleDisconnectSlack = async () => {
    if (slackDisconnecting) return
    setSlackDisconnecting(true)
    try {
      const response = await fetch('/api/settings/slack', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ webhookUrl: '', threshold: slack.threshold }),
      })
      if (!response.ok) throw new Error('slack_disconnect_failed')
      setSlackConfigured(false)
      setSlack(current => ({ ...current, webhookUrl: '' }))
      toast.success('Slack disconnected')
    } catch (error) {
      console.error('[settings] Unable to disconnect Slack', error)
      toast.error('Could not disconnect Slack.')
    } finally {
      setSlackDisconnecting(false)
    }
  }

  const BUSINESS_TYPES = [
    { value: 'saas', label: 'SaaS / Software' },
    { value: 'agency', label: 'Agency / Services' },
    { value: 'ecommerce', label: 'E-commerce' },
    { value: 'creator', label: 'Creator / Content' },
    { value: 'other', label: 'Other' },
  ]
  const canActivateAutomation = getPlanLimits(planState.plan).autoSend && draftsReviewed >= 10
  const redditDirectConnected = deliveryCapabilities.redditDirectPosting && connections.reddit
  const hasSelectedDirectConnection = (
    profile.autoSendPlatforms.includes('bluesky') && connections.bluesky
  ) || (
    profile.autoSendPlatforms.includes('reddit') && redditDirectConnected
  )
  const conversionWebhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://buyerwatch.co'}/api/webhooks/conversion`

  if (settingsLoading) {
    return (
      <AppPage>
        <div className="flex min-h-64 w-full max-w-[960px] items-center justify-center" role="status" aria-label="Loading settings">
          <Activity className="h-5 w-5 animate-spin text-gray-400" aria-hidden="true" />
        </div>
      </AppPage>
    )
  }

  if (loadFailed) {
    return (
      <AppPage>
        <div className="w-full max-w-[960px]">
          <h1 className="page-title">Settings</h1>
          <DataLoadError
            title="Couldn’t load settings"
            description="BuyerWatch did not load your saved values, so editing is disabled to protect them. Check your connection and try again."
            onRetry={() => setLoadAttempt(attempt => attempt + 1)}
          />
        </div>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <div className="w-full max-w-[960px]">
        {/* Sticky Professional Page Header */}
        <div className="sticky -top-5 sm:-top-6 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 -mt-5 sm:-mt-6 pt-5 sm:pt-6 pb-4 bg-white/90 backdrop-blur-md border-b border-gray-100 mb-6 flex items-center justify-between transition-all">
          <div>
            <h1 className="page-title">Settings</h1>
            <p className="hidden sm:block text-xs text-gray-500 mt-0.5">Manage your account, platform connections, and AI writing preferences.</p>
          </div>
          <button
            type="button"
            onClick={handleSave}
            disabled={saving || settingsLoading || loadFailed}
            className="flex h-9 items-center gap-2 rounded-xl bg-gray-900 px-4 text-xs font-semibold text-white shadow-xs transition-colors hover:bg-black disabled:opacity-50 cursor-pointer"
          >
            {saving ? <Activity className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            <span>{saving ? 'Saving...' : 'Save changes'}</span>
          </button>
        </div>

        <div className="flex flex-col items-start gap-5 md:flex-row md:gap-8">
          {/* ── Sidebar ───────────────────────────────────────────── */}
          <nav className="sticky top-[72px] md:top-[84px] z-10 -mx-1 w-[calc(100%+8px)] shrink-0 overflow-x-auto bg-[#FAFAFA]/95 px-1 py-1 backdrop-blur-sm no-scrollbar md:mx-0 md:w-52 md:overflow-visible md:bg-transparent md:p-0" aria-label="Settings sections">
            <ul className="flex min-w-max gap-1 md:min-w-0 md:flex-col md:space-y-0.5">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => setActiveSection(s.id)}
                    aria-pressed={activeSection === s.id}
                    className={`group flex min-h-11 w-full cursor-pointer items-center gap-2.5 rounded-xl px-3 py-2.5 text-left transition-all duration-150 md:gap-3 ${activeSection === s.id
                      ? 'bg-gray-900 text-white'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
                      }`}
                  >
                    <s.icon className={`w-4 h-4 shrink-0 ${activeSection === s.id ? 'text-white' : 'text-gray-400 group-hover:text-gray-600'}`} strokeWidth={2} />
                    <span className="text-[13.5px] font-medium">{s.label}</span>
                  </button>
                </li>
              ))}
            </ul>
          </nav>

          {/* ── Content ───────────────────────────────────────────── */}
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait">
              <motion.div
                key={activeSection}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: [0.25, 0.46, 0.45, 0.94] }}
                className="space-y-4"
              >

                {/* ── PROFILE ─────────────────────────────────────── */}
                {activeSection === 'profile' && (
                  <>
                    <SectionCard title="Business Details" description="Used to personalise your AI-generated replies.">
                      <div className="space-y-5">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <Field label="Business Name">
                            <input
                              value={profile.businessName}
                              onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))}
                              placeholder="Acme Inc."
                              className={inputCls}
                            />
                          </Field>
                          <Field label="Business Type">
                            <select
                              value={profile.businessType}
                              onChange={e => setProfile(p => ({ ...p, businessType: e.target.value }))}
                              className={inputCls + ' cursor-pointer'}
                            >
                              {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                            </select>
                          </Field>
                        </div>
                        <Field label="Website URL">
                          <div className="relative">
                            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                            <input
                              value={profile.businessUrl}
                              onChange={e => setProfile(p => ({ ...p, businessUrl: e.target.value }))}
                              placeholder="https://yourdomain.com"
                              className={inputCls + ' pl-9'}
                            />
                          </div>
                        </Field>
                        <Field label="Business Description" hint="Helps AI understand what you do">
                          <textarea
                            value={profile.businessDescription}
                            onChange={e => setProfile(p => ({ ...p, businessDescription: e.target.value }))}
                            placeholder="We help SaaS companies find leads on Reddit and Bluesky..."
                            rows={3}
                            className={inputCls + ' resize-none'}
                          />
                        </Field>
                      </div>
                    </SectionCard>

                    <SectionCard title="Reply Identity" description="How your account appears when BuyerWatch posts on your behalf.">
                      <Field label="Reddit Username">
                        <div className="relative">
                          <AtSign className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            value={profile.redditUsername}
                            onChange={e => setProfile(p => ({ ...p, redditUsername: e.target.value }))}
                            placeholder="your_reddit_handle"
                            className={inputCls + ' pl-9'}
                          />
                        </div>
                      </Field>
                    </SectionCard>

                    <SectionCard title="Writing Style & Tone Matching" description="Select a tone archetype or describe your natural voice. BuyerWatch's AI will match this exact style when drafting replies.">
                      <div className="space-y-6">
                        {/* 1-Click Tone Archetypes */}
                        <div>
                          <label className="block text-[13px] font-semibold text-gray-900 mb-2">Tone Archetype</label>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            {(Object.entries(TONE_ARCHETYPES) as [ToneArchetype, (typeof TONE_ARCHETYPES)[ToneArchetype]][]).map(([id, archetype]) => (
                              <button
                                key={id}
                                type="button"
                                onClick={() => setProfile(p => ({
                                  ...p,
                                  toneArchetype: p.toneArchetype === id ? null : id,
                                }))}
                                className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                                  profile.toneArchetype === id
                                    ? 'bg-blue-50/60 border-[#0A84FF] ring-2 ring-[#0A84FF]/10'
                                    : 'bg-white border-gray-200/80 hover:border-gray-300 hover:bg-gray-50/50'
                                }`}
                              >
                                <span className="text-xs font-bold text-gray-900 block">{archetype.label}</span>
                                <span className="text-[11px] text-gray-500 mt-0.5 block leading-tight font-normal">{archetype.description}</span>
                              </button>
                            ))}
                          </div>
                        </div>

                        {/* Quick Style Guardrail Pills */}
                        <div>
                          <label className="block text-[12px] font-medium text-gray-500 mb-2">Quick Style Guardrails</label>
                          <div className="flex flex-wrap gap-1.5">
                            {(Object.entries(STYLE_GUARDRAILS) as [StyleGuardrail, (typeof STYLE_GUARDRAILS)[StyleGuardrail]][]).map(([id, guardrail]) => {
                              const active = profile.styleGuardrails.includes(id)
                              return (
                                <button
                                  key={id}
                                  type="button"
                                  onClick={() => {
                                    setProfile(p => {
                                      const styleGuardrails = p.styleGuardrails.includes(id)
                                        ? p.styleGuardrails.filter(item => item !== id)
                                        : [...p.styleGuardrails, id]
                                      return { ...p, styleGuardrails }
                                    })
                                  }}
                                  className={`text-[11px] font-semibold px-3 py-1 rounded-full border transition-all cursor-pointer ${
                                    active
                                      ? 'bg-gray-900 text-white border-gray-900'
                                      : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                                  }`}
                                >
                                  {active ? `✓ ${guardrail.label}` : `+ ${guardrail.label}`}
                                </button>
                              )
                            })}
                          </div>
                        </div>

                        <Field label="Custom Writing Style Instructions" hint="e.g. casual, direct, no buzzwords">
                          <textarea
                            value={profile.writingStyle}
                            onChange={e => setProfile(p => ({ ...p, writingStyle: e.target.value }))}
                            rows={2}
                            placeholder={`"I share personal experience first, then mention my product naturally..."`}
                            className={inputCls + ' resize-none'}
                          />
                        </Field>

                        <Field label="Tone Examples" hint="Paste 2-3 examples of replies you've written in the past.">
                          <textarea
                            value={profile.toneExamples}
                            onChange={e => setProfile(p => ({ ...p, toneExamples: e.target.value }))}
                            rows={4}
                            placeholder="Example 1: Hey! I built X which solves exactly this by doing Y. Happy to help if you have questions!&#10;Example 2: Totally agree with this take. Have you tried doing Z instead?"
                            className={inputCls + ' resize-none'}
                          />
                        </Field>
                      </div>
                    </SectionCard>

                    <SectionCard title="Competitor Mention Alerts" description="List competitors to track. BuyerWatch will highlight relevant posts where customers describe friction or ask for alternatives.">
                      <Field label="Competitors" hint="Comma separated (e.g. AcmeCorp, Globex, Initech)">
                        <input
                          value={profile.competitors}
                          onChange={e => setProfile(p => ({ ...p, competitors: e.target.value }))}
                          placeholder="e.g. CompetitorA, CompetitorB"
                          className={inputCls}
                        />
                      </Field>
                    </SectionCard>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-200 cursor-pointer shadow-sm ${saveSuccess
                          ? 'bg-emerald-500 text-white'
                          : 'bg-gray-900 hover:bg-gray-800 text-white'
                          }`}
                      >
                        {saveSuccess ? (
                          <><Check className="w-4 h-4" strokeWidth={2.5} /> Saved</>
                        ) : saving ? (
                          'Saving...'
                        ) : (
                          <><Save className="w-4 h-4" strokeWidth={2} /> Save Changes</>
                        )}
                      </button>
                    </div>
                  </>
                )}

                {/* ── CONNECTIONS ─────────────────────────────────── */}
                {activeSection === 'connections' && (
                  <>
                    <SectionCard title="Platform Accounts" description="Connect accounts to enable direct posting from BuyerWatch.">
                      <div className="space-y-3">
                        <PlatformRow
                          icon={<RedditIcon className="w-5 h-5 text-[#FF4500]" />}
                          name="Reddit"
                          description={
                            connections.reddit && connections.redditUsername
                              ? `Connected as u/${connections.redditUsername}`
                              : connections.redditStatus === 'reauth_required'
                                ? `Reconnect u/${connections.redditUsername || 'your account'} to resume delivery.`
                              : deliveryCapabilities.redditDirectPosting
                                ? 'Connect once for encrypted, server-side reply delivery.'
                                : deliveryCapabilities.redditScheduledDiscovery
                                  ? 'Scheduled discovery is active. Direct delivery is temporarily unavailable.'
                                  : 'Reddit monitoring and delivery are not configured.'
                          }
                          connected={connections.reddit}
                          onDisconnect={() => handleDisconnect('reddit')}
                        >
                          {!connections.reddit && deliveryCapabilities.redditDirectPosting && (
                            <div className="space-y-3">
                              {connections.redditStatus === 'reauth_required' && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-[12px] leading-5 text-amber-800" role="status">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                  Reddit expired the saved session. Automatic Reddit replies are paused until you reconnect.
                                </div>
                              )}
                              {deliveryCapabilities.redditConnectionProvider === 'sprinklr' ? (
                                <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[12px] leading-5 text-blue-900">
                                  Reddit authorization is managed in your organization&apos;s Sprinklr account. Verify the active Reddit channel here; BuyerWatch never receives your Reddit password.
                                </div>
                              ) : <>
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <input
                                  value={redditLoginUsername}
                                  onChange={event => setRedditLoginUsername(event.target.value)}
                                  placeholder="Reddit username"
                                  autoComplete="username"
                                  className={inputCls}
                                />
                                <input
                                  type="password"
                                  value={redditPassword}
                                  onChange={event => setRedditPassword(event.target.value)}
                                  placeholder="Reddit password"
                                  autoComplete="current-password"
                                  className={inputCls}
                                />
                              </div>
                              <input
                                type="password"
                                value={redditTotpSecret}
                                onChange={event => setRedditTotpSecret(event.target.value)}
                                placeholder="2FA setup secret (optional; not the 6-digit code)"
                                autoComplete="off"
                                className={inputCls}
                              />
                              <p className="text-[11.5px] leading-5 text-gray-500">
                                Credentials are sent once to RedditAPIs to establish a Reddit session. BuyerWatch never stores your password or 2FA secret; only the returned session cookies are encrypted at rest. RedditAPIs is an independent provider, not Reddit.
                              </p>
                              </>}
                              <button
                                type="button"
                                onClick={() => void handleConnectReddit()}
                                disabled={redditConnecting}
                                className="rounded-lg bg-[#FF4500] px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-[#e63e00] disabled:cursor-wait disabled:opacity-60"
                              >
                                {redditConnecting
                                  ? 'Connecting securely...'
                                  : deliveryCapabilities.redditConnectionProvider === 'sprinklr'
                                    ? 'Verify Sprinklr Reddit account'
                                    : connections.redditStatus === 'reauth_required'
                                      ? 'Reconnect Reddit'
                                      : 'Connect Reddit'}
                              </button>
                            </div>
                          )}
                        </PlatformRow>

                        <PlatformRow
                          icon={<BlueskyIcon className="w-5 h-5 text-[#1185FE]" />}
                          name="Bluesky"
                          description="Post via App Password. Generate one in Bluesky Settings → Privacy → App Passwords."
                          connected={connections.bluesky}
                          onConnect={() => { }}
                          onDisconnect={() => handleDisconnect('bluesky')}
                        >
                          {!connections.bluesky && (
                            <div className="space-y-3">
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                <input
                                  value={bskyHandle}
                                  onChange={e => setBskyHandle(e.target.value)}
                                  placeholder="you.bsky.social"
                                  className={inputCls}
                                />
                                <input
                                  type="password"
                                  value={bskyPassword}
                                  onChange={e => setBskyPassword(e.target.value)}
                                  placeholder="App password"
                                  className={inputCls}
                                />
                              </div>
                              <button
                                onClick={handleConnectBluesky}
                                disabled={bskyConnecting}
                                className="text-[13px] font-semibold text-white bg-[#1185FE] hover:bg-[#0d6fd4] px-4 py-2 rounded-lg transition-colors cursor-pointer"
                              >
                                {bskyConnecting ? 'Connecting...' : 'Connect Bluesky'}
                              </button>
                            </div>
                          )}
                        </PlatformRow>
                      </div>
                    </SectionCard>

                    <SectionCard title="Automation" description="Set the boundaries BuyerWatch must satisfy before it can act.">
                      <div className="space-y-5">
                        <div className="flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <p className="text-[14px] font-semibold text-gray-900">Earned auto-send</p>
                            <p className="mt-1 text-[13px] text-gray-500">
                              {!getPlanLimits(planState.plan).autoSend
                                ? `Professional plan required. ${draftsReviewed} of 10 trust reviews complete.`
                                : draftsReviewed < 10
                                  ? `${draftsReviewed} of 10 personal reviews complete. Community history cannot bypass this gate.`
                                  : 'Your trust gate is complete. Set the delivery limits below before activation.'}
                            </p>
                          </div>
                          {profile.autoSendEnabled || canActivateAutomation ? (
                            <Toggle
                              label="Toggle earned auto-send"
                              checked={profile.autoSendEnabled}
                              onChange={value => {
                                if (value && !activationAcknowledged) {
                                  toast.info('Confirm the activation acknowledgement first.')
                                  return
                                }
                                if (value && !hasSelectedDirectConnection) {
                                  toast.info('Connect and select at least one direct-delivery platform first.')
                                  return
                                }
                                setProfile(current => ({ ...current, autoSendEnabled: value }))
                              }}
                            />
                          ) : (
                            <div className="relative shrink-0">
                              <div className="h-[22px] w-10 cursor-not-allowed rounded-full bg-gray-200 opacity-50" />
                              <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-gray-400">
                                <Shield className="h-2.5 w-2.5 text-white" strokeWidth={2.5} />
                              </span>
                            </div>
                          )}
                        </div>

                        <div className="space-y-1 rounded-xl border border-black/5 bg-[#F8F9FA] p-4 text-[12.5px] leading-relaxed text-gray-600">
                          <p className="flex items-center gap-1.5 font-semibold text-gray-900">
                            <Sparkles className="h-3.5 w-3.5 text-blue-600" />
                            How BuyerWatch earns permission
                          </p>
                          <p>
                            Your first ten reviews are mandatory. After that, your threshold, quality checks, platform capability, target scope, and daily limit must all clear for every reply.
                          </p>
                        </div>

                        {canActivateAutomation && !profile.autoSendEnabled && (
                          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[#DFDFDB] bg-white p-3.5">
                            <input
                              type="checkbox"
                              checked={activationAcknowledged}
                              onChange={event => setActivationAcknowledged(event.target.checked)}
                              className="mt-0.5 h-4 w-4 accent-gray-900"
                            />
                            <span className="text-[12.5px] leading-5 text-gray-600">
                              I understand that direct auto-send can publish without individual review, and I can pause it instantly from the dashboard.
                            </span>
                          </label>
                        )}

                        <AnimatePresence>
                          {(profile.autoSendEnabled || canActivateAutomation) && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="space-y-5 border-t border-gray-100 pt-4">
                                {redditDirectConnected ? (
                                  <div className="flex items-start gap-2.5 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
                                    <Shield className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                                    <p className="text-[12.5px] leading-relaxed text-emerald-800">
                                      Reddit direct delivery is connected. Eligible high-intent replies can publish without individual approval after every safety and community-policy gate clears.
                                    </p>
                                  </div>
                                ) : (
                                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                    <p className="text-[12.5px] leading-relaxed text-amber-700">
                                      Reddit direct delivery is paused. Connect or reconnect Reddit above before enabling automatic Reddit replies.
                                    </p>
                                  </div>
                                )}

                                <div>
                                  <div className="mb-2 flex items-center justify-between">
                                    <label className="text-[13px] font-medium text-gray-700">Minimum confidence threshold</label>
                                    <span className="text-[13px] font-bold tabular-nums text-gray-900">{profile.autoSendThreshold}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="70"
                                    max="99"
                                    value={profile.autoSendThreshold}
                                    onChange={event => setProfile(current => ({ ...current, autoSendThreshold: Number(event.target.value) }))}
                                    className="w-full cursor-pointer accent-gray-900"
                                  />
                                  <div className="mt-1 flex justify-between text-[11px] text-gray-400">
                                    <span>70, learned floor still applies</span>
                                    <span>99, strict</span>
                                  </div>
                                </div>

                                <div>
                                  <div className="mb-2 flex items-center justify-between">
                                    <label className="text-[13px] font-medium text-gray-700">Maximum automated replies per day</label>
                                    <span className="text-[13px] font-bold tabular-nums text-gray-900">{profile.autoSendDailyLimit}</span>
                                  </div>
                                  <input
                                    type="range"
                                    min="1"
                                    max="10"
                                    value={profile.autoSendDailyLimit}
                                    onChange={event => setProfile(current => ({ ...current, autoSendDailyLimit: Number(event.target.value) }))}
                                    className="w-full cursor-pointer accent-gray-900"
                                  />
                                </div>

                                <div className="space-y-2">
                                  <p className="text-[13px] font-medium text-gray-700">Direct delivery platforms</p>
                                  <label className={`flex items-center justify-between rounded-xl border px-3.5 py-3 ${connections.bluesky ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                                    <span className="flex items-center gap-2.5 text-[12.5px] font-medium">
                                      <BlueskyIcon className="h-4 w-4 text-[#1185FE]" />
                                      Bluesky
                                      <span className="font-normal text-gray-400">Direct</span>
                                    </span>
                                    <input
                                      type="checkbox"
                                      disabled={!connections.bluesky}
                                      checked={profile.autoSendPlatforms.includes('bluesky')}
                                      onChange={event => setProfile(current => ({
                                        ...current,
                                        autoSendPlatforms: event.target.checked
                                          ? [...new Set([...current.autoSendPlatforms, 'bluesky'])]
                                          : current.autoSendPlatforms.filter(platform => platform !== 'bluesky'),
                                      }))}
                                      className="h-4 w-4 accent-gray-900"
                                    />
                                  </label>
                                  <label className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-[12.5px] ${redditDirectConnected ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                                    <span className="flex items-center gap-2.5 font-medium text-gray-700">
                                      <RedditIcon className="h-4 w-4 text-[#FF4500]" />
                                      Reddit
                                      <span className="font-normal text-gray-400">
                                        {redditDirectConnected ? 'Direct' : 'Not connected'}
                                      </span>
                                    </span>
                                    {redditDirectConnected ? (
                                      <input
                                        type="checkbox"
                                        checked={profile.autoSendPlatforms.includes('reddit')}
                                        onChange={event => setProfile(current => ({
                                          ...current,
                                          autoSendPlatforms: event.target.checked
                                            ? [...new Set([...current.autoSendPlatforms, 'reddit'])]
                                            : current.autoSendPlatforms.filter(platform => platform !== 'reddit'),
                                        }))}
                                        className="h-4 w-4 accent-gray-900"
                                      />
                                    ) : (
                                      <span className="text-[11px] font-semibold text-gray-500">Connect above</span>
                                    )}
                                  </label>
                                </div>

                                <Field label="Allowed targets" hint="Optional">
                                  <input
                                    value={profile.autoSendCommunities}
                                    onChange={event => setProfile(current => ({ ...current, autoSendCommunities: event.target.value }))}
                                    placeholder="r/SaaS, product feedback"
                                    className={inputCls}
                                  />
                                  <p className="mt-1.5 text-[11px] leading-4 text-gray-400">Comma-separated. Leave empty to use every monitored target on enabled platforms.</p>
                                </Field>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </SectionCard>

                    <SectionCard title="Reply Tracking" description="Control how BuyerWatch attributes clicks and revenue from your replies.">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1">
                          <p className="text-[14px] font-semibold text-gray-900">Include referral tracking in replies</p>
                          <p className="text-[13px] text-gray-500 mt-1">
                            Gives each relevant reply a unique tracked link. BuyerWatch records the click, then immediately redirects the reader to your website with its attribution token preserved.
                          </p>
                        </div>
                        <Toggle
                          label="Toggle referral tracking"
                          checked={profile.referralTrackingEnabled}
                          onChange={v => setProfile(p => ({ ...p, referralTrackingEnabled: v }))}
                        />
                      </div>
                      <div className="mt-4 p-3 bg-gray-50 border border-gray-100 rounded-xl text-[12px] text-gray-500 leading-relaxed">
                        <span className="font-semibold text-gray-700">How it works: </span>
                        A link such as <span className="font-mono text-gray-700">{process.env.NEXT_PUBLIC_APP_URL || 'https://app.buyerwatch.co'}/r/abc123</span> redirects to <span className="font-mono text-gray-700">{profile.businessUrl || 'https://yoursite.com'}?ref=buyerwatch&amp;sid=abc123</span>. It is included only when the product is directly relevant and the affiliation is disclosed.
                      </div>
                    </SectionCard>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-200 cursor-pointer shadow-sm ${saveSuccess ? 'bg-emerald-500 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'
                          }`}
                      >
                        {saveSuccess ? <><Check className="w-4 h-4" strokeWidth={2.5} /> Saved</> : saving ? 'Saving...' : <><Save className="w-4 h-4" strokeWidth={2} /> Save Changes</>}
                      </button>
                    </div>
                  </>
                )}

                {/* ── NOTIFICATIONS ────────────────────────────────── */}
                {activeSection === 'notifications' && (
                  <>
                    <SectionCard
                      title="High-intent threshold"
                      description="Choose which scored opportunities count as high intent across your dashboard and analytics."
                    >
                      <div>
                        <div className="mb-3 flex items-center justify-between gap-4">
                          <div>
                            <p className="text-[14px] font-semibold text-gray-900">Minimum dashboard intent score</p>
                            <p className="mt-1 text-[12px] leading-5 text-gray-500">
                              This changes counts and filters only. It does not rescore opportunities or change their buying/researching classification.
                            </p>
                          </div>
                          <span className="shrink-0 rounded-lg bg-gray-900 px-3 py-1.5 text-[14px] font-bold tabular-nums text-white">
                            {highIntentThreshold}%
                          </span>
                        </div>
                        <input
                          type="range"
                          min={HIGH_INTENT_THRESHOLD_MIN}
                          max={HIGH_INTENT_THRESHOLD_MAX}
                          step="1"
                          value={highIntentThreshold}
                          aria-label="Minimum high-intent dashboard score"
                          onChange={event => setHighIntentThreshold(normalizeHighIntentThreshold(event.target.value))}
                          className="w-full cursor-pointer accent-gray-900"
                        />
                        <div className="mt-1.5 flex justify-between text-[11px] text-gray-400">
                          <span>{HIGH_INTENT_THRESHOLD_MIN} — Catch more</span>
                          <span>{HIGH_INTENT_THRESHOLD_MAX} — Only the strongest</span>
                        </div>
                        <p className="mt-3 rounded-xl border border-blue-100 bg-blue-50 px-3 py-2.5 text-[11.5px] leading-5 text-blue-800">
                          Slack keeps its own notification threshold below, so changing this slider will not alter Slack delivery.
                        </p>
                      </div>
                    </SectionCard>

                    <SectionCard title="Email Notifications" description="Choose which updates you receive by email.">
                      <div className="space-y-0 divide-y divide-gray-50">
                        {[
                          { key: 'emailDigest', icon: Mail, label: 'Daily digest', description: 'A morning summary of new opportunities and activity.' },
                          { key: 'highIntentAlerts', icon: Activity, label: 'High-intent alerts', description: `Instant notification when a thread meets your ${highIntentThreshold}+ dashboard threshold.` },
                          { key: 'weeklyReport', icon: BarChart2, label: 'Weekly report', description: 'Your posting stats, top threads, and trends each week.' },
                        ].map(item => (
                          <div key={item.key} className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
                            <div className="flex items-start gap-3">
                              <div className="w-8 h-8 rounded-lg bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0 mt-0.5">
                                <item.icon className="w-4 h-4 text-gray-500" strokeWidth={1.75} />
                              </div>
                              <div>
                                <p className="text-[14px] font-semibold text-gray-900">{item.label}</p>
                                <p className="text-[13px] text-gray-500 mt-0.5">{item.description}</p>
                              </div>
                            </div>
                            <Toggle
                              label={`Toggle ${item.label}`}
                              checked={notifications[item.key as keyof typeof notifications]}
                              onChange={v => setNotifications(p => ({ ...p, [item.key]: v }))}
                            />
                          </div>
                        ))}
                      </div>
                    </SectionCard>

                    {/* Slack Notifications Card */}
                    <SectionCard
                      title="Slack Notifications"
                      description="Get an instant Slack message with the AI draft reply whenever BuyerWatch finds a high-intent lead."
                    >
                      <div className="space-y-5">
                        {/* Webhook URL */}
                        <Field
                          label="Webhook URL"
                          hint={
                            <a
                              href="https://api.slack.com/messaging/webhooks"
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-blue-500 hover:underline"
                            >
                              How to get one →
                            </a>
                          }
                        >
                          <input
                            type="url"
                            value={slack.webhookUrl}
                            onChange={e => setSlack(s => ({ ...s, webhookUrl: e.target.value }))}
                            placeholder={slackConfigured
                              ? 'Paste a new webhook URL to replace the saved one'
                              : 'https://hooks.slack.com/services/T.../B.../...'}
                            className={inputCls}
                          />
                          {slackConfigured && !slack.webhookUrl && (
                            <p className="mt-2 text-[12px] font-medium text-emerald-700" role="status">
                              Connected. The saved webhook is encrypted and never displayed here.
                            </p>
                          )}
                        </Field>

                        {/* Threshold slider */}
                        {(slackConfigured || slack.webhookUrl) && (
                          <div>
                            <div className="flex items-center justify-between mb-2">
                              <label className="text-[13px] font-medium text-gray-700">Minimum intent score to notify</label>
                              <span className="text-[13px] font-bold text-gray-900 tabular-nums">{slack.threshold}</span>
                            </div>
                            <input
                              type="range" min="60" max="95"
                              value={slack.threshold}
                              onChange={e => setSlack(s => ({ ...s, threshold: parseInt(e.target.value) }))}
                              className="w-full accent-gray-900 cursor-pointer"
                            />
                            <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                              <span>60 — Catch more</span>
                              <span>95 — Only the best</span>
                            </div>
                          </div>
                        )}

                        {/* Test button */}
                        {(slackConfigured || slack.webhookUrl) && (
                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={async () => {
                                setSlackTesting(true)
                                try {
                                  const res = await fetch('/api/settings/test-slack', {
                                    method: 'POST',
                                    headers: { 'Content-Type': 'application/json' },
                                    body: JSON.stringify(slack.webhookUrl
                                      ? { webhookUrl: slack.webhookUrl }
                                      : {}),
                                  })
                                  if (res.ok) toast.success('Test message sent to Slack ✓')
                                  else toast.error('Failed to send test — check your webhook URL')
                                } catch {
                                  toast.error('Network error sending test')
                                } finally {
                                  setSlackTesting(false)
                                }
                              }}
                              disabled={slackTesting || slackDisconnecting}
                              className="flex items-center gap-2 rounded-xl bg-gray-100 px-4 py-2 text-[13px] font-semibold text-gray-700 transition-colors hover:bg-gray-200 disabled:cursor-wait disabled:opacity-50"
                            >
                              <Send className="h-3.5 w-3.5" strokeWidth={2} />
                              {slackTesting ? 'Sending...' : 'Send test message'}
                            </button>
                            {slackConfigured && (
                              <button
                                type="button"
                                onClick={() => void handleDisconnectSlack()}
                                disabled={slackTesting || slackDisconnecting}
                                className="rounded-xl px-4 py-2 text-[13px] font-semibold text-red-600 transition-colors hover:bg-red-50 disabled:cursor-wait disabled:opacity-50"
                              >
                                {slackDisconnecting ? 'Disconnecting...' : 'Disconnect Slack'}
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    </SectionCard>

                    {/* Feature 2: Conversion Webhook Integration Card */}
                    <SectionCard
                      title="Conversion Webhook Integration"
                      description="Attribute paid conversions back to your BuyerWatch replies by firing a webhook from Stripe, Paddle, or your payment system."
                    >
                      <div className="space-y-4">
                        <Field
                          label="Webhook Receiver Endpoint"
                          hint="POST JSON payloads to this endpoint when a user who clicked a BuyerWatch link converts."
                        >
                          <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-[12px] text-gray-800 sm:flex-row sm:items-center">
                            <span className="min-w-0 break-all">{conversionWebhookUrl}</span>
                            <button
                              type="button"
                              onClick={() => void copySettingValue(conversionWebhookUrl, 'Webhook URL')}
                              className="min-h-11 shrink-0 px-2 font-sans text-[12px] font-semibold text-blue-600 hover:underline"
                            >
                              Copy
                            </button>
                          </div>
                        </Field>

                        <Field
                          label="Authorization Secret"
                          hint="Send this value as a Bearer token. Keep it server-side and rotate it if it is ever exposed."
                        >
                          <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-[12px] text-gray-800 sm:flex-row sm:items-center">
                            <span className="min-w-0 break-all">{webhookSecret ? `${'•'.repeat(16)}${webhookSecret.slice(-8)}` : 'Secret unavailable until migrations are applied'}</span>
                            {webhookSecret && (
                              <button
                                type="button"
                                onClick={() => void copySettingValue(webhookSecret, 'Webhook secret')}
                                className="min-h-11 shrink-0 px-2 font-sans text-[12px] font-semibold text-blue-600 hover:underline"
                              >
                                Copy
                              </button>
                            )}
                          </div>
                        </Field>

                        <div className="p-3.5 bg-blue-50 border border-blue-100 rounded-xl text-[12px] text-blue-900 leading-relaxed space-y-1.5">
                          <p className="font-semibold text-blue-950 flex items-center gap-1.5">
                            <Info className="w-3.5 h-3.5 text-blue-600" />
                            Sample POST Payload
                          </p>
                          <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-blue-200/50 bg-white/70 p-2.5 font-mono text-[11px] text-gray-800">
{`{
  "shortcode": "aB1cD2eF",
  "revenue_usd": 99.00
}

Authorization: Bearer YOUR_WEBHOOK_SECRET`}
                          </pre>
                        </div>
                      </div>
                    </SectionCard>

                    <div className="flex justify-end pt-2">
                      <button
                        onClick={handleSave}
                        disabled={saving}
                        className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-[13.5px] font-semibold transition-all duration-200 cursor-pointer shadow-sm ${saveSuccess ? 'bg-emerald-500 text-white' : 'bg-gray-900 hover:bg-gray-800 text-white'
                          }`}
                      >
                        {saveSuccess ? <><Check className="w-4 h-4" strokeWidth={2.5} /> Saved</> : saving ? 'Saving...' : <><Save className="w-4 h-4" strokeWidth={2} /> Save Changes</>}
                      </button>
                    </div>
                  </>
                )}

                {/* ── PLAN & BILLING ───────────────────────────────── */}
                {activeSection === 'plan' && (
                  <>
                    <SectionCard title="Current Plan">
                      <div className="flex items-start justify-between mb-6">
                        <div>
                          <div className="flex items-center gap-2.5 mb-1">
                            <span className="text-[28px] font-bold text-gray-900 tracking-tight capitalize">{planState.plan}</span>
                            <span className="text-[11px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-100 px-2 py-0.5 rounded-full">Active</span>
                          </div>
                          <p className="text-[13px] text-gray-500">
                            {planState.plan === 'free'
                              ? '1 keyword, 50 signals, and 10 AI drafts per month.'
                              : `${planState.keywordsMax} keywords, ${planState.threadsMax.toLocaleString()} signals, and ${planState.draftsMax.toLocaleString()} AI drafts per month.`}
                          </p>
                        </div>
                      </div>

                      <div className="space-y-2.5 mb-6">
                        {[
                          `${planState.threadsMax} monitored threads / month`,
                          'Reddit & Bluesky monitoring',
                          'AI draft reply generation',
                          'Manual review & approval workflow',
                        ].map(f => (
                          <div key={f} className="flex items-center gap-2.5 text-[13.5px] text-gray-600">
                            <div className="w-4 h-4 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                              <Check className="w-2.5 h-2.5 text-gray-500" strokeWidth={3} />
                            </div>
                            {f}
                          </div>
                        ))}
                      </div>

                      {planState.plan === 'free' && (
                        <div className="pt-5 border-t border-gray-100">
                          <div className="flex flex-col gap-4 p-4 bg-gray-950 rounded-xl sm:flex-row sm:items-start">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                                <span className="text-[14px] font-bold text-white">Choose a paid plan</span>
                              </div>
                              <p className="text-[12px] text-white/50 leading-relaxed">
                                Pay monthly, or save 20%+ with one annual payment. Professional adds auto-send and subreddit targeting.
                              </p>
                            </div>
                            <div className="flex gap-2">
                              <button className="rounded-lg bg-white/10 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/15 disabled:opacity-50" onClick={() => handleUpgrade('starter')} disabled={upgrading}>Starter</button>
                              <button className="rounded-lg bg-white px-3 py-2 text-[12px] font-semibold text-gray-900 hover:bg-gray-100 disabled:opacity-50" onClick={() => handleUpgrade('pro')} disabled={upgrading}>{upgrading ? 'Opening…' : 'Professional'}</button>
                              <button className="rounded-lg border border-white/20 px-3 py-2 text-[12px] font-semibold text-white hover:bg-white/10 disabled:opacity-50" onClick={() => handleUpgrade('starter', 'annual')} disabled={upgrading}>Starter annual</button>
                            </div>
                          </div>
                        </div>
                      )}
                      {planState.plan !== 'free' && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-5">
                          {planState.plan === 'starter' && <button onClick={() => handleUpgrade('pro')} disabled={upgrading} className="rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white disabled:opacity-50">Upgrade to Professional</button>}
                          {planState.plan !== 'growth' && <button onClick={() => handleUpgrade('growth')} disabled={upgrading} className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-800 disabled:opacity-50">Upgrade to Growth</button>}
                          <button
                            onClick={() => handleUpgrade(
                              planState.plan === 'starter'
                                ? 'starter'
                                : planState.plan === 'growth'
                                  ? 'growth'
                                  : 'pro',
                              'annual',
                            )}
                            disabled={upgrading}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-800 disabled:opacity-50"
                          >
                            Switch current plan to annual
                          </button>
                          <button
                            onClick={() => handleUpgrade(
                              planState.plan === 'starter'
                                ? 'starter'
                                : planState.plan === 'growth'
                                  ? 'growth'
                                  : 'pro',
                              'monthly',
                            )}
                            disabled={upgrading}
                            className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-800 disabled:opacity-50"
                          >
                            Switch current plan to monthly
                          </button>
                          <button onClick={handleManageBilling} disabled={openingPortal} className="rounded-lg border border-gray-200 px-4 py-2 text-[13px] font-semibold text-gray-800 disabled:opacity-50">
                            {openingPortal ? 'Opening…' : 'Manage or cancel billing'}
                          </button>
                        </div>
                      )}
                    </SectionCard>

                    <SectionCard title="Usage" description="Your consumption this billing cycle.">
                      {[
                        { label: 'Threads monitored', used: usageStats.threads, max: planState.threadsMax },
                        { label: 'Drafts generated', used: usageStats.drafts, max: planState.draftsMax },
                        { label: 'Replies sent', used: usageStats.replies, max: planState.draftsMax },
                      ].map(item => (
                        <div key={item.label} className="mb-5 last:mb-0">
                          <div className="flex items-center justify-between text-[13px] mb-1.5">
                            <span className="text-gray-700 font-medium">{item.label}</span>
                            <span className="text-gray-500 tabular-nums">{item.used} <span className="text-gray-300">/</span> {item.max}</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5 overflow-hidden">
                            <div
                              className={`h-full rounded-full transition-all ${item.used >= item.max ? 'bg-red-500' : 'bg-gray-900'}`}
                              style={{ width: `${Math.min((item.used / item.max) * 100, 100)}%` }}
                            />
                          </div>
                        </div>
                      ))}

                      {/* Warn free users shortly before their ten-draft monthly limit. */}
                      {planState.plan === 'free' && usageStats.drafts >= 8 && (() => {
                        const now = new Date()
                        const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
                        const resetStr = resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                        return (
                          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
                            <div>
                              <p className="text-[13px] text-amber-900 leading-relaxed">
                                You&apos;ve used <span className="font-semibold">{usageStats.drafts}</span> of {PLAN_LIMITS.free.aiDraftsPerMonth} draft previews this month.
                                This resets on <span className="font-semibold">{resetStr}</span>.{' '}
                                Professional members get 400 drafts/month — enough that this number becomes invisible.
                              </p>
                              <button
                                onClick={() => handleUpgrade('pro')}
                                disabled={upgrading}
                                className="mt-2 text-[12.5px] font-semibold text-amber-700 hover:text-amber-900 transition-colors cursor-pointer"
                              >
                                Upgrade to Professional →
                              </button>
                            </div>
                          </div>
                        )
                      })()}
                    </SectionCard>
                  </>
                )}

              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </AppPage>
  )
}
