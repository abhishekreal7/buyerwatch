'use client'

import { useState, useEffect } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  User, Bell, CreditCard, Save, Check,
  Globe, AtSign, Shield,
  Link, AlertTriangle, Sparkles, Mail, Activity, BarChart2, Send, Info
} from 'lucide-react'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { createClient } from '@/utils/supabase/client'
import { AppPage } from '@/components/AppPage'
import { toast } from 'sonner'
import { PLAN_LIMITS, getPlanLimits, normalizePlan } from '@/lib/plan-limits'
import {
  STYLE_GUARDRAILS,
  TONE_ARCHETYPES,
  isToneArchetype,
  normalizeStyleGuardrails,
  type StyleGuardrail,
  type ToneArchetype,
} from '@/lib/writing-style'

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
    <div className="bg-surface border border-gray-100 rounded-2xl overflow-hidden">
      <div className="px-6 pt-6 pb-5 border-b border-gray-50">
        <h3 className="text-[22px] font-[500] tracking-[-0.02em] leading-[1.2] text-[rgba(43,38,33,0.95)]">{title}</h3>
        {description && <p className="text-[14px] font-[400] text-[rgba(43,38,33,0.52)] mt-1.5 leading-snug tracking-[0]">{description}</p>}
      </div>
      <div className="p-6">{children}</div>
    </div>
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative w-10 h-[22px] rounded-full transition-colors duration-200 cursor-pointer shrink-0 focus:outline-none focus:ring-2 focus:ring-gray-900/15 focus:ring-offset-1 ${checked ? 'bg-gray-900' : 'bg-gray-200'}`}
    >
      <span className={`absolute top-[3px] left-[3px] w-4 h-4 bg-white rounded-full shadow-sm transition-transform duration-200 ${checked ? 'translate-x-[18px]' : 'translate-x-0'}`} />
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
      <div className="flex items-center gap-4 px-4 py-4">
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
        <div className="shrink-0">
          {connected ? (
            <button onClick={onDisconnect} className="text-[13px] font-medium text-red-500 hover:text-red-600 transition-colors cursor-pointer px-3 py-1.5 rounded-lg hover:bg-red-50">
              Disconnect
            </button>
          ) : onConnect ? (
            <button onClick={onConnect} className="text-[13px] font-semibold text-gray-900 bg-gray-100 hover:bg-gray-200 px-3 py-1.5 rounded-lg transition-colors cursor-pointer">
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
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [upgrading, setUpgrading] = useState(false)

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
    referralTrackingEnabled: true,
  })

  const [connections, setConnections] = useState({ reddit: false, bluesky: false, redditUsername: '' })
  const [bskyHandle, setBskyHandle] = useState('')
  const [bskyPassword, setBskyPassword] = useState('')
  const [bskyConnecting, setBskyConnecting] = useState(false)

  const [slack, setSlack] = useState({ webhookUrl: '', threshold: 70 })
  const [slackTesting, setSlackTesting] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState('')

  const [notifications, setNotifications] = useState({
    emailDigest: true,
    highIntentAlerts: true,
    weeklyReport: false,
  })

  const [planState, setPlanState] = useState<{ plan: string, keywordsMax: number, threadsMax: number, draftsMax: number }>({
    plan: 'free',
    keywordsMax: PLAN_LIMITS.free.keywords,
    threadsMax: PLAN_LIMITS.free.threadsPerMonth,
    draftsMax: PLAN_LIMITS.free.aiDraftsPerMonth,
  })
  const [usageStats, setUsageStats] = useState({ threads: 0, drafts: 0, replies: 0, keywords: 0 })
  // total_drafts_reviewed from user_trust_metrics — used to show trust-meter in locked auto-send toggle
  const [draftsReviewed, setDraftsReviewed] = useState<number>(0)

  const supabase = createClient()

  useEffect(() => {
    async function load() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      const { data: extendedProfile } = await supabase
        .from('profiles')
        .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, reddit_username, auto_send_enabled, auto_send_threshold, referral_tracking_enabled, notification_preferences, slack_webhook_url, slack_notify_threshold, webhook_secret, plan')
        .eq('id', user.id)
        .single()
      let p = extendedProfile
      if (!p) {
        const { data: legacyProfile } = await supabase
          .from('profiles')
          .select('business_name, business_description, business_url, business_type, writing_style, competitors, tone_examples, reddit_username, auto_send_enabled, auto_send_threshold, referral_tracking_enabled, notification_preferences, slack_webhook_url, slack_notify_threshold, webhook_secret, plan')
          .eq('id', user.id)
          .single()
        p = legacyProfile
          ? { ...legacyProfile, tone_archetype: null, style_guardrails: [] }
          : null
      }
      if (p) {
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
          referralTrackingEnabled: p.referral_tracking_enabled !== false, // default true
        })
        if (p.notification_preferences) setNotifications(p.notification_preferences)
        setSlack({ webhookUrl: p.slack_webhook_url || '', threshold: p.slack_notify_threshold ?? 70 })
        setWebhookSecret(p.webhook_secret || '')
      }

      const { data: conns } = await supabase.from('platform_connections').select('platform, external_username').eq('user_id', user.id)
      if (conns) {
        const redditConn = conns.find(c => c.platform === 'reddit')
        setConnections({
          reddit: conns.some(c => c.platform === 'reddit'),
          bluesky: conns.some(c => c.platform === 'bluesky'),
          redditUsername: redditConn?.external_username || '',
        })
      }

      // Load Usage Data
      const now = new Date()
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()

      const [
        { count: threadsCount },
        { count: draftsCount },
        { count: sentCount },
        { count: keywordsCount }
      ] = await Promise.all([
        supabase.from('monitored_threads').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', firstDay),
        supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', firstDay).not('draft_text', 'is', null),
        supabase.from('reply_analytics').select('*', { count: 'exact', head: true }).eq('user_id', user.id).gte('created_at', firstDay).eq('was_sent', true),
        supabase.from('keywords').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      ])

      setUsageStats({
        threads: threadsCount || 0,
        drafts: draftsCount || 0,
        replies: sentCount || 0,
        keywords: keywordsCount || 0,
      })

      if (p) {
        const plan = normalizePlan(p.plan)
        const limits = getPlanLimits(plan)
        setPlanState({
          plan,
          keywordsMax: limits.keywords,
          threadsMax: limits.threadsPerMonth,
          draftsMax: limits.aiDraftsPerMonth,
        })
      }

      // Load trust metrics for auto-send trust meter (shown to all users)
      const { data: trustData } = await supabase
        .from('user_trust_metrics')
        .select('total_drafts_reviewed')
        .eq('user_id', user.id)
        .maybeSingle()
      setDraftsReviewed(Math.min(trustData?.total_drafts_reviewed ?? 0, 10))
    }
    load()

    // Handle OAuth Callback search parameters
    const params = new URLSearchParams(window.location.search)
    const success = params.get('success')
    const error = params.get('error')

    if (success === 'reddit_connected') {
      toast.success('Successfully connected Reddit account!')
      const newUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, '', newUrl)
    } else if (error) {
      if (error === 'reddit_state_mismatch') {
        toast.error('Reddit connection failed: State mismatch (CSRF protection triggered).')
      } else if (error === 'reddit_token_failed') {
        toast.error('Reddit connection failed: Could not exchange authorization token.')
      } else if (error === 'reddit_auth_failed') {
        toast.error('Reddit connection failed: Access denied or authorization failed.')
      } else if (error === 'reddit_credentials_missing') {
        toast.error('Reddit connection failed: REDDIT_CLIENT_ID is missing or empty in .env.local.')
      } else {
        toast.error(`Reddit connection failed: ${error.replace(/_/g, ' ')}`)
      }
      const newUrl = window.location.pathname + window.location.hash
      window.history.replaceState({}, '', newUrl)
    }
  }, [])

  const handleSave = async () => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    setSaving(true)

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
      slack_webhook_url: slack.webhookUrl || null,
      slack_notify_threshold: slack.threshold,
    }
    const saveProfile = async () => {
      const extendedResult = await supabase.from('profiles').update({
        ...baseProfileUpdates,
        tone_archetype: profile.toneArchetype,
        style_guardrails: profile.styleGuardrails,
      }).eq('id', user.id)
      if (!extendedResult.error) return extendedResult
      return supabase.from('profiles').update(baseProfileUpdates).eq('id', user.id)
    }

    const [{ error }, autoSendResponse] = await Promise.all([
      saveProfile(),
      fetch('/api/settings/autosend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          auto_send_enabled: profile.autoSendEnabled,
          auto_send_threshold: profile.autoSendThreshold,
        }),
      }),
    ])

    setSaving(false)
    if (error || !autoSendResponse.ok) { toast.error('Failed to save'); return }
    setSaveSuccess(true)
    toast.success('Settings saved')
    setTimeout(() => setSaveSuccess(false), 2500)
  }

  const handleUpgrade = async (plan: 'pro' | 'growth' = 'pro') => {
    setUpgrading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ plan }),
      })
      const data = await res.json()
      if (res.ok && data.url) {
        window.location.href = data.url
      } else {
        toast.error('Billing not yet configured')
      }
    } catch (err) {
      console.error(err)
      toast.error('Billing not yet configured')
    } finally {
      setUpgrading(false)
    }
  }

  const handleConnectReddit = () => { window.location.href = '/api/auth/reddit' }

  const handleConnectBluesky = async () => {
    if (!bskyHandle || !bskyPassword) { toast.error('Enter your handle and app password'); return }
    setBskyConnecting(true)
    const res = await fetch('/api/settings/bluesky', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ handle: bskyHandle, password: bskyPassword }),
    })
    setBskyConnecting(false)
    if (res.ok) {
      setConnections(p => ({ ...p, bluesky: true }))
      setBskyPassword('')
      toast.success('Bluesky connected')
    } else {
      toast.error('Invalid credentials')
    }
  }

  const handleDisconnect = async (platform: 'reddit' | 'bluesky') => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('platform_connections').delete().eq('user_id', user.id).eq('platform', platform)
    setConnections(p => ({ ...p, [platform]: false }))
    toast.success(`${platform} disconnected`)
  }

  const BUSINESS_TYPES = [
    { value: 'saas', label: 'SaaS / Software' },
    { value: 'agency', label: 'Agency / Services' },
    { value: 'ecommerce', label: 'E-commerce' },
    { value: 'creator', label: 'Creator / Content' },
    { value: 'other', label: 'Other' },
  ]

  return (
    <AppPage>
      <div className="w-full max-w-[960px]">
        {/* Page title */}
        <div className="mb-10">
          <h1 className="page-title">Settings</h1>
          <p className="page-subtitle">Manage your workspace, connections, and preferences.</p>
        </div>

        <div className="flex gap-8 items-start">
          {/* ── Sidebar ───────────────────────────────────────────── */}
          <nav className="w-52 shrink-0 sticky top-24">
            <ul className="space-y-0.5">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <button
                    onClick={() => setActiveSection(s.id)}
                    className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all duration-150 cursor-pointer group ${activeSection === s.id
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
                        <div className="grid grid-cols-2 gap-4">
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

                    <SectionCard title="Reply Identity" description="How your account appears when Scouto posts on your behalf.">
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

                    <SectionCard title="Writing Style & Tone Matching" description="Select a tone archetype or describe your natural voice. Scouto's AI will match this exact style when drafting replies.">
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

                    <SectionCard title="Competitor Hijack Alerts" description="List competitors to track. We'll aggressively flag posts where users complain about them.">
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
                    <SectionCard title="Platform Accounts" description="Connect accounts to enable direct posting from Scouto.">
                      <div className="space-y-3">
                        <PlatformRow
                          icon={<RedditIcon className="w-5 h-5 text-[#FF4500]" />}
                          name="Reddit"
                          description={
                            connections.reddit && connections.redditUsername
                              ? `Connected as u/${connections.redditUsername}`
                              : 'Post replies via OAuth. Requires a Reddit account.'
                          }
                          connected={connections.reddit}
                          onConnect={handleConnectReddit}
                          onDisconnect={() => handleDisconnect('reddit')}
                        />

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
                              <div className="grid grid-cols-2 gap-3">
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

                    <SectionCard title="Automation" description="Control how Scouto handles high-confidence matches.">
                      <div className="space-y-5">
                        <div className="flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <p className="text-[14px] font-semibold text-gray-900">Auto-send high-confidence replies</p>
                            {planState.plan === 'free' ? (
                              <p className="text-[13px] text-gray-500 mt-1">
                                Auto-send unlocks at Professional — you&apos;ve reviewed{' '}
                                <span className="font-semibold text-gray-900">{draftsReviewed} of 10</span>{' '}
                                drafts needed to activate it.
                              </p>
                            ) : (
                              <p className="text-[13px] text-gray-500 mt-1">
                                Automatically post replies when the intent score exceeds the threshold below. Only triggers when a platform is connected.
                              </p>
                            )}
                          </div>
                          {planState.plan === 'free' ? (
                            <div className="relative shrink-0">
                              <div className="w-10 h-[22px] rounded-full bg-gray-200 opacity-50 cursor-not-allowed" />
                              <span className="absolute -top-1 -right-1 w-4 h-4 bg-gray-400 rounded-full flex items-center justify-center">
                                <Shield className="w-2.5 h-2.5 text-white" strokeWidth={2.5} />
                              </span>
                            </div>
                          ) : (
                            <Toggle checked={profile.autoSendEnabled} onChange={v => setProfile(p => ({ ...p, autoSendEnabled: v }))} />
                          )}
                        </div>

                        {/* Feature 4: Educational Earn Auto-Send Callout */}
                        <div className="p-4 bg-[#F8F9FA] border border-black/5 rounded-xl text-[12.5px] text-gray-600 leading-relaxed space-y-1">
                          <p className="font-semibold text-gray-900 flex items-center gap-1.5">
                            <Sparkles className="w-3.5 h-3.5 text-blue-600" />
                            How Auto-Send Earns Your Trust
                          </p>
                          <p>
                            Scouto combines your review history with community rejection data. Your selected threshold remains the minimum: learned risk can make sending stricter, but never more permissive than your setting.
                          </p>
                        </div>

                        <AnimatePresence>
                          {profile.autoSendEnabled && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="pt-4 border-t border-gray-100 space-y-4">
                                <div className="p-3 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2.5">
                                  <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" />
                                  <p className="text-[12.5px] text-amber-700 leading-relaxed">
                                    Auto-send will post on your behalf without review. Start with a high threshold (90+) and monitor your audit log.
                                  </p>
                                </div>
                                <div>
                                  <div className="flex items-center justify-between mb-2">
                                    <label className="text-[13px] font-medium text-gray-700">Minimum confidence threshold</label>
                                    <span className="text-[13px] font-bold text-gray-900 tabular-nums">{profile.autoSendThreshold}</span>
                                  </div>
                                  <input
                                    type="range" min="70" max="99"
                                    value={profile.autoSendThreshold}
                                    onChange={e => setProfile(p => ({ ...p, autoSendThreshold: parseInt(e.target.value) }))}
                                    className="w-full accent-gray-900 cursor-pointer"
                                  />
                                  <div className="flex justify-between text-[11px] text-gray-400 mt-1">
                                    <span>70 — Learned floor applies</span>
                                    <span>99 — Strict</span>
                                  </div>
                                </div>
                              </div>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </SectionCard>

                    <SectionCard title="Reply Tracking" description="Control how Scouto attributes clicks and revenue from your replies.">
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1">
                          <p className="text-[14px] font-semibold text-gray-900">Include referral tracking in replies</p>
                          <p className="text-[13px] text-gray-500 mt-1">
                            Gives each relevant reply a unique tracked link. Scouto records the click, then immediately redirects the reader to your website with its attribution token preserved.
                          </p>
                        </div>
                        <Toggle
                          checked={profile.referralTrackingEnabled}
                          onChange={v => setProfile(p => ({ ...p, referralTrackingEnabled: v }))}
                        />
                      </div>
                      <div className="mt-4 p-3 bg-gray-50 border border-gray-100 rounded-xl text-[12px] text-gray-500 leading-relaxed">
                        <span className="font-semibold text-gray-700">How it works: </span>
                        A link such as <span className="font-mono text-gray-700">{process.env.NEXT_PUBLIC_APP_URL || 'https://app.scouto.co'}/r/abc123</span> redirects to <span className="font-mono text-gray-700">{profile.businessUrl || 'https://yoursite.com'}?ref=scouto&amp;sid=abc123</span>. It is included only when the product is directly relevant and the affiliation is disclosed.
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
                    <SectionCard title="Email Notifications" description="Choose which updates you receive by email.">
                      <div className="space-y-0 divide-y divide-gray-50">
                        {[
                          { key: 'emailDigest', icon: Mail, label: 'Daily digest', description: 'A morning summary of new opportunities and activity.' },
                          { key: 'highIntentAlerts', icon: Activity, label: 'High-intent alerts', description: 'Instant notification when a thread scores 85+.' },
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
                      description="Get an instant Slack message with the AI draft reply whenever Scouto finds a high-intent lead."
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
                            placeholder="https://hooks.slack.com/services/T.../B.../..."
                            className={inputCls}
                          />
                        </Field>

                        {/* Threshold slider */}
                        {slack.webhookUrl && (
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
                        {slack.webhookUrl && (
                          <button
                            onClick={async () => {
                              if (!slack.webhookUrl) return
                              setSlackTesting(true)
                              try {
                                const res = await fetch('/api/settings/test-slack', {
                                  method: 'POST',
                                  headers: { 'Content-Type': 'application/json' },
                                  body: JSON.stringify({ webhookUrl: slack.webhookUrl }),
                                })
                                if (res.ok) toast.success('Test message sent to Slack ✓')
                                else toast.error('Failed to send test — check your webhook URL')
                              } catch {
                                toast.error('Network error sending test')
                              } finally {
                                setSlackTesting(false)
                              }
                            }}
                            disabled={slackTesting}
                            className="flex items-center gap-2 text-[13px] font-semibold text-gray-700 bg-gray-100 hover:bg-gray-200 px-4 py-2 rounded-xl transition-colors cursor-pointer"
                          >
                            <Send className="w-3.5 h-3.5" strokeWidth={2} />
                            {slackTesting ? 'Sending...' : 'Send test message'}
                          </button>
                        )}
                      </div>
                    </SectionCard>

                    {/* Feature 2: Conversion Webhook Integration Card */}
                    <SectionCard
                      title="Conversion Webhook Integration"
                      description="Attribute paid conversions back to your Scouto replies by firing a webhook from Stripe, Paddle, or your payment system."
                    >
                      <div className="space-y-4">
                        <Field
                          label="Webhook Receiver Endpoint"
                          hint="POST JSON payloads to this endpoint when a user who clicked a Scouto link converts."
                        >
                          <div className="p-3 bg-gray-50 border border-gray-200 rounded-xl font-mono text-[12px] text-gray-800 flex items-center justify-between">
                            <span>{process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/conversion</span>
                            <button
                              type="button"
                              onClick={() => {
                                navigator.clipboard.writeText(`${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/conversion`)
                                toast.success('Webhook URL copied')
                              }}
                              className="text-[12px] text-blue-600 font-sans font-semibold hover:underline"
                            >
                              Copy
                            </button>
                          </div>
                        </Field>

                        <Field
                          label="Authorization Secret"
                          hint="Send this value as a Bearer token. Keep it server-side and rotate it if it is ever exposed."
                        >
                          <div className="flex items-center justify-between rounded-xl border border-gray-200 bg-gray-50 p-3 font-mono text-[12px] text-gray-800">
                            <span>{webhookSecret ? `${'•'.repeat(16)}${webhookSecret.slice(-8)}` : 'Secret unavailable until migrations are applied'}</span>
                            {webhookSecret && (
                              <button
                                type="button"
                                onClick={() => {
                                  navigator.clipboard.writeText(webhookSecret)
                                  toast.success('Webhook secret copied')
                                }}
                                className="font-sans text-[12px] font-semibold text-blue-600 hover:underline"
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
                          <pre className="font-mono text-[11px] bg-white/70 p-2.5 rounded-lg text-gray-800 border border-blue-200/50">
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
                              ? '1 keyword rule. Upgrade for 10 rules, 1,000 signals, and auto-send.'
                              : 'You have access to all premium features.'}
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
                          <div className="flex items-start gap-4 p-4 bg-gray-950 rounded-xl">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <Sparkles className="w-4 h-4 text-amber-400" />
                                <span className="text-[14px] font-bold text-white">Upgrade to Professional</span>
                                <span className="text-[12px] font-semibold text-white/60">$49/mo</span>
                              </div>
                              <p className="text-[12px] text-white/50 leading-relaxed">
                                10 keyword rules, 1,000 signals/month, auto-send, subreddit targeting.
                              </p>
                            </div>
                            <button
                              className="shrink-0 text-[13px] font-semibold bg-white text-gray-900 hover:bg-gray-100 px-4 py-2 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
                              onClick={() => handleUpgrade('pro')}
                              disabled={upgrading}
                            >
                              {upgrading ? 'Redirecting...' : 'Upgrade'}
                            </button>
                          </div>
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

                      {/* Placement C — Draft limit warning
                          Only fires for free users who have used >= 35 of 40 drafts.
                          Should be a rare event for a 1-keyword user; shown honestly. */}
                      {planState.plan === 'free' && usageStats.drafts >= 35 && (() => {
                        const now = new Date()
                        const resetDate = new Date(now.getFullYear(), now.getMonth() + 1, 1)
                        const resetStr = resetDate.toLocaleDateString('en-US', { month: 'long', day: 'numeric' })
                        return (
                          <div className="mt-4 p-3.5 bg-amber-50 border border-amber-100 rounded-xl flex items-start gap-2.5">
                            <AlertTriangle className="w-4 h-4 text-amber-500 shrink-0 mt-0.5" strokeWidth={1.75} />
                            <div>
                              <p className="text-[13px] text-amber-900 leading-relaxed">
                                You&apos;ve used <span className="font-semibold">{usageStats.drafts}</span> of 40 draft previews this month.
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
