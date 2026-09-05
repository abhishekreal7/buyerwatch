'use client'

import { useState, useEffect, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  CircleUserRound, Bell, CreditCard, Check, Loader2,
  Globe, AtSign, Shield,
  Link, AlertTriangle, Sparkles, Mail, Activity, BarChart2, Send, Info, ShieldCheck, ChevronDown
} from 'lucide-react'
import { RedditIcon, BlueskyIcon, XIcon } from '@/components/Icons'
import { createClient } from '@/utils/supabase/client'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { AppPage } from '@/components/AppPage'
import { toast } from 'sonner'
import { PLAN_LIMITS, canMonitorPlatform, getPlanLimits } from '@/lib/plan-limits'
import { getBillingDisplayState, getEntitledPlan } from '@/lib/billing-entitlements'
import { getDodoBillingSelectionFromProductId } from '@/lib/dodo'
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
import { CreditPackPicker } from '@/components/CreditPackPicker'
import { connectRedditThroughChrome } from '@/lib/browser-connector-client'
import type { RedditAutoSendEligibility } from '@/lib/reddit-auto-send-eligibility'
import { getLowCapacityNotice } from '@/lib/capacity-notices'
import { getCurrentUsageMonth } from '@/lib/billing-addons'

/* ─── Nav sections ────────────────────────────────────────────────── */
const SECTIONS = [
  { id: 'profile', label: 'Profile', icon: CircleUserRound, description: 'Business info & writing style' },
  { id: 'connections', label: 'Connections', icon: Link, description: 'Platform accounts & automation' },
  { id: 'notifications', label: 'Notifications', icon: Bell, description: 'Alerts & digest preferences' },
  { id: 'plan', label: 'Plan & Billing', icon: CreditCard, description: 'Subscription & usage' },
]

/* ─── Sub-components ─────────────────────────────────────────────── */

function SectionCard({ title, description, children }: {
  title: string; description?: string; children: React.ReactNode
}) {
  return (
    <section className="overflow-hidden rounded-[22px] border border-[#E4E7EC] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.025),0_12px_30px_rgba(16,24,40,0.035)]">
      <div className="px-5 pb-0 pt-5 sm:px-6 sm:pt-6">
        <h3 className="font-[family-name:var(--font-display)] text-[16px] font-semibold leading-6 tracking-[-0.025em] text-[#101828]">{title}</h3>
        {description && <p className="mt-1 max-w-2xl text-[12.5px] leading-5 text-[#667085]">{description}</p>}
      </div>
      <div className="p-5 sm:p-6 sm:pt-5">{children}</div>
    </section>
  )
}

function SettingsNavItem({
  section,
  active,
  onClick,
}: {
  section: (typeof SECTIONS)[number]
  active: boolean
  onClick: () => void
}) {
  const Icon = section.icon
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
      aria-label={`${section.label}: ${section.description}`}
      className={`group flex min-h-[42px] w-full shrink-0 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-left outline-none transition-all duration-150 focus-visible:ring-2 focus-visible:ring-neutral-400/40 ${
        active
          ? 'bg-white text-neutral-950 font-semibold border border-neutral-200/90 shadow-[0_1px_3px_rgba(16,24,40,0.06),0_1px_2px_rgba(16,24,40,0.04)]'
          : 'text-neutral-600 font-medium hover:bg-neutral-100/70 hover:text-neutral-900 border border-transparent'
      }`}
    >
      <span
        className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg transition-all ${
          active
            ? 'bg-neutral-900 text-white shadow-2xs'
            : 'bg-neutral-100 text-neutral-500 group-hover:bg-neutral-200/80 group-hover:text-neutral-800'
        }`}
      >
        <Icon className="h-4 w-4" strokeWidth={active ? 2.25 : 1.75} />
      </span>
      <span className="whitespace-nowrap text-[13px] leading-5 tracking-[-0.01em]">{section.label}</span>
    </button>
  )
}

function SettingsSlider({
  label,
  description,
  value,
  min,
  max,
  step = 1,
  unit = '',
  onChange,
  disabled = false,
  minLabel,
  maxLabel,
  badgeText,
}: {
  label: string
  description?: string
  value: number
  min: number
  max: number
  step?: number
  unit?: string
  onChange: (value: number) => void
  disabled?: boolean
  minLabel?: string
  maxLabel?: string
  badgeText?: string
}) {
  const percentage = Math.min(100, Math.max(0, ((value - min) / (max - min)) * 100))

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1">
          <label className="text-[13px] font-semibold text-[#101828]">{label}</label>
          {description && (
            <p className="mt-0.5 text-[12px] leading-5 text-[#667085]">{description}</p>
          )}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {badgeText && (
            <span className="rounded-md border border-[#E4E7EC] bg-white px-2 py-0.5 text-[11px] font-medium text-[#475467]">
              {badgeText}
            </span>
          )}
          <div className="flex items-center gap-1">
            <button
              type="button"
              disabled={disabled || value <= min}
              onClick={() => onChange(Math.max(min, value - step))}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#D0D5DD] bg-white text-[13px] font-semibold text-[#344054] shadow-2xs transition-all hover:bg-[#F9FAFB] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Decrease ${label}`}
            >
              −
            </button>
            <div className="flex min-w-[54px] items-center justify-center rounded-lg border border-[#E4E7EC] bg-[#F8FAFC] px-2 py-1 text-center font-mono text-[12.5px] font-bold tabular-nums text-[#101828]">
              {value}{unit}
            </div>
            <button
              type="button"
              disabled={disabled || value >= max}
              onClick={() => onChange(Math.min(max, value + step))}
              className="flex h-7 w-7 items-center justify-center rounded-lg border border-[#D0D5DD] bg-white text-[13px] font-semibold text-[#344054] shadow-2xs transition-all hover:bg-[#F9FAFB] active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
              aria-label={`Increase ${label}`}
            >
              +
            </button>
          </div>
        </div>
      </div>

      <div className="relative pt-1 pb-1">
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          disabled={disabled}
          aria-label={label}
          onChange={e => onChange(Number(e.target.value))}
          style={{
            background: `linear-gradient(to right, #101828 0%, #101828 ${percentage}%, #E4E7EC ${percentage}%, #E4E7EC 100%)`
          }}
          className="h-2 w-full appearance-none rounded-full cursor-pointer outline-none transition-all disabled:cursor-not-allowed disabled:opacity-50
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:h-4.5
            [&::-webkit-slider-thumb]:w-4.5
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-white
            [&::-webkit-slider-thumb]:border-[1.5px]
            [&::-webkit-slider-thumb]:border-[#344054]
            [&::-webkit-slider-thumb]:shadow-[0_1px_3px_rgba(16,24,40,0.15)]
            [&::-webkit-slider-thumb]:transition-transform
            hover:[&::-webkit-slider-thumb]:scale-110
            active:[&::-webkit-slider-thumb]:scale-95
            [&::-moz-range-thumb]:h-4.5
            [&::-moz-range-thumb]:w-4.5
            [&::-moz-range-thumb]:rounded-full
            [&::-moz-range-thumb]:bg-white
            [&::-moz-range-thumb]:border-[1.5px]
            [&::-moz-range-thumb]:border-[#344054]
            [&::-moz-range-thumb]:shadow-[0_1px_3px_rgba(16,24,40,0.15)]"
        />
        {(minLabel || maxLabel) && (
          <div className="mt-1.5 flex justify-between text-[11px] font-medium text-[#98A2B3]">
            <span>{minLabel}</span>
            <span>{maxLabel}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-3">
        <label className="text-[12.5px] font-semibold text-[#344054]">{label}</label>
        {hint && <span className="text-right text-[10.5px] leading-4 text-[#98A2B3]">{hint}</span>}
      </div>
      {children}
    </div>
  )
}

const inputCls = "min-h-11 w-full rounded-xl border border-[#DDE2E8] bg-[#FBFCFD] px-3.5 py-2.5 text-[13px] text-[#101828] shadow-[inset_0_1px_2px_rgba(16,24,40,0.025)] outline-none transition-all duration-150 placeholder:text-[#98A2B3] hover:border-[#C9D0D8] focus:border-[#0A84FF] focus:bg-white focus:ring-4 focus:ring-[#0A84FF]/10"

function Toggle({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      onClick={() => onChange(!checked)}
      className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-xl outline-none focus-visible:ring-4 focus-visible:ring-[#0A84FF]/15"
    >
      <span className={`relative h-5 w-9 rounded-full transition-colors duration-200 ${checked ? 'bg-[#0A84FF]' : 'bg-[#D0D5DD]'}`}>
        <span className={`absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow-[0_1px_3px_rgba(16,24,40,0.24)] transition-transform duration-200 ${checked ? 'translate-x-4' : 'translate-x-0'}`} />
      </span>
    </button>
  )
}

function SaveButton({
  saving,
  saved,
  disabled,
  onClick,
  size = 'md',
  showShortcut = true,
  className = '',
}: {
  saving: boolean
  saved: boolean
  disabled?: boolean
  onClick: () => void
  size?: 'sm' | 'md'
  showShortcut?: boolean
  className?: string
}) {
  const [isMac, setIsMac] = useState(false)
  useEffect(() => {
    setIsMac(/Mac|iPod|iPhone|iPad/.test(navigator.platform || navigator.userAgent))
  }, [])

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled || saving}
      aria-label="Save changes"
      className={`group relative inline-flex select-none items-center justify-center font-medium text-white antialiased transition-all duration-150 cursor-pointer active:scale-[0.985] disabled:pointer-events-none disabled:opacity-40 rounded-lg ${
        size === 'sm' ? 'h-8 px-3 text-[12px] gap-1.5' : 'h-9 px-3.5 sm:px-4 text-[13px] gap-2'
      } ${
        saved
          ? 'bg-gradient-to-b from-emerald-600 to-emerald-700 hover:from-emerald-600 hover:to-emerald-700 text-white border border-emerald-800 shadow-[inset_0_1px_0_rgba(255,255,255,0.28),0_1px_2px_rgba(0,0,0,0.12),0_2px_8px_rgba(16,185,129,0.3)]'
          : 'bg-gradient-to-b from-[#1c2026] via-[#131519] to-[#0a0c0e] hover:from-[#272d36] hover:via-[#181b20] hover:to-[#0d0f12] border border-[#262b34]/90 hover:border-[#323945] shadow-[inset_0_1px_0_0_rgba(255,255,255,0.18),inset_0_-1px_0_0_rgba(0,0,0,0.4),0_1px_2px_0_rgba(0,0,0,0.24),0_2px_6px_0_rgba(0,0,0,0.12)] hover:shadow-[inset_0_1px_0_0_rgba(255,255,255,0.26),0_2px_4px_0_rgba(0,0,0,0.25),0_6px_16px_0_rgba(0,0,0,0.16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/40 focus-visible:ring-offset-2'
      } ${className}`}
    >
      {saved ? (
        <>
          <Check className="h-3.5 w-3.5 stroke-[2.5] text-emerald-100 transition-transform duration-200 scale-105" />
          <span className="font-semibold tracking-[-0.01em]">Saved</span>
        </>
      ) : saving ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin text-white/70" />
          <span className="font-medium tracking-[-0.01em] text-white/90">Saving…</span>
        </>
      ) : (
        <>
          <span className="font-medium tracking-[-0.01em] text-white">Save changes</span>
          {showShortcut && (
            <kbd className="hidden sm:inline-flex items-center justify-center rounded px-1.5 py-0.5 text-[9.5px] font-sans font-medium text-white/45 bg-white/[0.08] border border-white/[0.08] shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] group-hover:text-white/70 group-hover:bg-white/[0.12] transition-colors">
              {isMac ? '⌘S' : 'Ctrl S'}
            </kbd>
          )}
        </>
      )}
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
    <div className="overflow-hidden rounded-2xl border border-[#E4E7EC] bg-[#FBFCFD] transition-colors hover:border-[#D6DAE1]">
      <div className="flex flex-wrap items-center gap-3 px-4 py-4 sm:gap-4 sm:px-5">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#EAECF0] bg-white shadow-[0_1px_2px_rgba(16,24,40,0.04)]">
          {icon}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-[13.5px] font-semibold text-[#101828]">{name}</p>
            {connected && (
              <span className="flex items-center gap-1.5 rounded-full border border-emerald-100 bg-emerald-50 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                Connected
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11.5px] leading-5 text-[#667085]">{description}</p>
        </div>
        <div className="ml-[48px] shrink-0 sm:ml-0">
          {connected ? (
            <button type="button" onClick={onDisconnect} className="min-h-10 cursor-pointer rounded-xl border border-[#E4E7EC] bg-white px-3.5 py-2 text-[12px] font-semibold text-[#475467] shadow-[0_1px_2px_rgba(16,24,40,0.03)] transition-colors hover:border-red-200 hover:bg-red-50 hover:text-red-600">
              Disconnect
            </button>
          ) : onConnect ? (
            <button type="button" onClick={onConnect} className="min-h-10 cursor-pointer rounded-xl bg-[#101828] px-4 py-2 text-[12px] font-semibold text-white shadow-[0_2px_5px_rgba(16,24,40,0.16)] transition-colors hover:bg-black">
              Connect
            </button>
          ) : null}
        </div>
      </div>
      {children && <div className="border-t border-[#EAECF0] bg-white px-4 pb-4 pt-3 sm:px-5">{children}</div>}
    </div>
  )
}

/* ─── Server-provided initial data type ────────────────────────── */
export type SettingsInitialData = {
  profile: {
    businessName: string; businessDescription: string; businessUrl: string; businessType: string
    writingStyle: string; toneArchetype: ToneArchetype | null; styleGuardrails: StyleGuardrail[]
    competitors: string; toneExamples: string; redditUsername: string; autoSendEnabled: boolean
    autoSendThreshold: number; autoSendDailyLimit: number; autoSendPlatforms: string[]
    autoSendCommunities: string; referralTrackingEnabled: boolean
  }
  notifications: { emailDigest: boolean; highIntentAlerts: boolean; weeklyReport: boolean }
  highIntentThreshold: number
  slack: { configured: boolean; threshold: number }
  webhookSecret: string
  connections: {
    reddit: boolean; bluesky: boolean; x: boolean; xUsername: string; redditUsername: string
    redditStatus: 'active' | 'reauth_required' | 'error' | 'missing'
    redditProvider: 'redditapis' | 'sprinklr' | 'browser_relay' | 'mcp_agent' | 'hyperbrowser' | null
    redditAutoSendEligibility: RedditAutoSendEligibility
  }
  deliveryCapabilities: {
    redditDirectPosting: boolean; redditScheduledDiscovery: boolean; blueskyDirectPosting: boolean; xDiscovery: boolean; xDirectPosting: boolean
    redditConnectionProvider: 'sprinklr' | 'hyperbrowser' | 'redditapis' | null; redditBrowserConnection: boolean; mcpConnection: boolean
  }
  usageStats: { threads: number; drafts: number; replies: number; keywords: number }
  planState: {
    plan: string
    billingState: 'active' | 'attention_required' | 'trial_not_started'
    currentCadence: 'monthly' | 'annual' | null
    hasBillingPortal: boolean
    keywordsMax: number
    threadsMax: number
    draftsMax: number
  }
  draftsReviewed: number
  instantAutopilot: { available: boolean; used: boolean; expiresAt: string | null }
}

/* ─── Main component ─────────────────────────────────────────────── */

export default function SettingsPage({ initialData }: { initialData?: SettingsInitialData }) {
  const [activeSection, setActiveSection] = useState('profile')
  const [saving, setSaving] = useState(false)
  const [settingsLoading, setSettingsLoading] = useState(!initialData)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [upgrading, setUpgrading] = useState(false)
  const [openingPortal, setOpeningPortal] = useState(false)
  // Skip the initial client-side fetch when data was pre-loaded server-side
  const serverDataUsed = useRef(!!initialData)
  const upgradeHandledRef = useRef(false)

  useEffect(() => {
    const requestedSection = new URLSearchParams(window.location.search).get('section')
    if (SECTIONS.some((section) => section.id === requestedSection)) {
      setActiveSection(requestedSection as string)
    }
  }, [])

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('billing') !== 'plan_change_pending') return
    toast.success('Your plan change was submitted. Billing will update shortly.')
    window.history.replaceState({}, '', '/settings?section=plan')
  }, [])

  const [profile, setProfile] = useState(initialData?.profile ?? {
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
  const [instantAutopilot, setInstantAutopilot] = useState(initialData?.instantAutopilot ?? {
    available: false,
    used: false,
    expiresAt: null,
  })

  const [connections, setConnections] = useState(initialData?.connections ?? {
    reddit: false,
    bluesky: false,
    x: false,
    xUsername: '',
    redditUsername: '',
    redditStatus: 'missing' as 'active' | 'reauth_required' | 'error' | 'missing',
    redditProvider: null as 'redditapis' | 'sprinklr' | 'browser_relay' | 'mcp_agent' | 'hyperbrowser' | null,
    redditAutoSendEligibility: {
      eligible: false,
      code: 'profile_unavailable',
      minimumAgeDays: 30,
      minimumCombinedKarma: 50,
      accountAgeDays: null,
      combinedKarma: null,
      daysRemaining: 30,
      karmaRemaining: 50,
    } as RedditAutoSendEligibility,
  })
  const [deliveryCapabilities, setDeliveryCapabilities] = useState(initialData?.deliveryCapabilities ?? {
    redditDirectPosting: false,
    redditScheduledDiscovery: false,
    blueskyDirectPosting: true,
    xDiscovery: false,
    xDirectPosting: false,
    redditConnectionProvider: null as 'sprinklr' | 'hyperbrowser' | 'redditapis' | null,
    redditBrowserConnection: false,
    mcpConnection: false,
  })
  const [bskyHandle, setBskyHandle] = useState('')
  const [bskyPassword, setBskyPassword] = useState('')
  const [bskyConnecting, setBskyConnecting] = useState(false)
  const [redditLoginUsername, setRedditLoginUsername] = useState('')
  const [redditPassword, setRedditPassword] = useState('')
  const [redditTotpSecret, setRedditTotpSecret] = useState('')
  const [redditConnecting, setRedditConnecting] = useState(false)
  const [redditSignInSessionId, setRedditSignInSessionId] = useState<string | null>(null)
  const [redditSessionCookie, setRedditSessionCookie] = useState('')
  const [mcpSettings, setMcpSettings] = useState({
    configured: false,
    tokenPrefix: '',
    endpoint: 'https://www.buyerwatch.co/api/mcp',
    lastUsedAt: null as string | null,
  })
  const [mcpToken, setMcpToken] = useState('')
  const [mcpUpdating, setMcpUpdating] = useState(false)

  const [slack, setSlack] = useState({ webhookUrl: '', threshold: initialData?.slack.threshold ?? 70 })
  const [slackConfigured, setSlackConfigured] = useState(initialData?.slack.configured ?? false)
  const [slackTesting, setSlackTesting] = useState(false)
  const [slackDisconnecting, setSlackDisconnecting] = useState(false)
  const [webhookSecret, setWebhookSecret] = useState(initialData?.webhookSecret ?? '')

  const [notifications, setNotifications] = useState(initialData?.notifications ?? {
    emailDigest: true,
    highIntentAlerts: true,
    weeklyReport: false,
  })
  const [highIntentThreshold, setHighIntentThreshold] = useState(initialData?.highIntentThreshold ?? DEFAULT_HIGH_INTENT_THRESHOLD)

  const [planState, setPlanState] = useState<SettingsInitialData['planState']>(initialData?.planState ?? {
    plan: 'free',
    billingState: 'trial_not_started',
    currentCadence: null,
    hasBillingPortal: false,
    keywordsMax: PLAN_LIMITS.free.keywords,
    threadsMax: PLAN_LIMITS.free.threadsPerMonth,
    draftsMax: PLAN_LIMITS.free.aiDraftsPerMonth,
  })
  const [usageStats, setUsageStats] = useState(initialData?.usageStats ?? { threads: 0, drafts: 0, replies: 0, keywords: 0 })
  const planEntitlements = getPlanLimits(planState.plan)
  const usageCapacityAtLimit = planState.billingState === 'active' && (
    (planState.threadsMax > 0 && usageStats.threads >= planState.threadsMax)
    || (planState.draftsMax > 0 && usageStats.drafts >= planState.draftsMax)
  )
  const usageCapacityNotice = planState.billingState === 'active' && !usageCapacityAtLimit
    ? getLowCapacityNotice([
        { resource: 'signals', used: usageStats.threads, limit: planState.threadsMax },
        { resource: 'drafts', used: usageStats.drafts, limit: planState.draftsMax },
      ])
    : null
  const capacityPickerInitialType = usageCapacityNotice?.resource
    ?? (planState.draftsMax > 0 && usageStats.drafts >= planState.draftsMax
      && !(planState.threadsMax > 0 && usageStats.threads >= planState.threadsMax)
      ? 'drafts'
      : 'signals')
  const usageItems = [
    { label: 'Threads monitored', used: usageStats.threads, max: planState.threadsMax },
    { label: 'Drafts generated', used: usageStats.drafts, max: planState.draftsMax },
    { label: 'Replies sent', used: usageStats.replies, max: planState.draftsMax },
  ]
  // total_drafts_reviewed from user_trust_metrics — used to show trust-meter in locked auto-send toggle
  const [draftsReviewed, setDraftsReviewed] = useState<number>(initialData?.draftsReviewed ?? 0)

  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  useEffect(() => {
    // Skip initial fetch when data was pre-loaded server-side
    if (serverDataUsed.current) {
      serverDataUsed.current = false
      return
    }
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
                provider?: 'redditapis' | 'sprinklr' | 'browser_relay' | 'mcp_agent' | 'hyperbrowser' | null
                auto_send_eligibility?: RedditAutoSendEligibility
              }>
              capabilities: {
                redditDirectPosting: boolean
                redditScheduledDiscovery: boolean
                blueskyDirectPosting: boolean
                xDiscovery: boolean
                xDirectPosting: boolean
                redditConnectionProvider: 'sprinklr' | 'hyperbrowser' | 'redditapis' | null
                redditBrowserConnection: boolean
                mcpConnection: boolean
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
            .select('business_name, business_description, business_url, business_type, writing_style, tone_archetype, style_guardrails, competitors, tone_examples, reddit_username, auto_send_enabled, auto_send_threshold, auto_send_daily_limit, auto_send_platforms, auto_send_communities, referral_tracking_enabled, notification_preferences, high_intent_threshold, webhook_secret, plan, billing_status, billing_subscription_id, billing_customer_id, billing_product_id, signal_count, signal_month, draft_count, draft_month, instant_autopilot_granted_at, instant_autopilot_expires_at, instant_autopilot_used_at')
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
            .select('business_name, business_description, business_url, business_type, writing_style, competitors, tone_examples, reddit_username, auto_send_enabled, auto_send_threshold, referral_tracking_enabled, notification_preferences, high_intent_threshold, webhook_secret, plan, billing_status, billing_subscription_id, billing_customer_id, billing_product_id, signal_count, signal_month, draft_count, draft_month')
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
              instant_autopilot_granted_at: null,
              instant_autopilot_expires_at: null,
              instant_autopilot_used_at: null,
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
          x: conns.some(c => c.platform === 'x'),
          xUsername: conns.find(c => c.platform === 'x')?.external_username || '',
          redditUsername: redditConn?.external_username || '',
          redditStatus: redditConn?.status ?? 'missing',
          redditProvider: redditConn?.provider ?? null,
          redditAutoSendEligibility: redditConn?.auto_send_eligibility ?? {
            eligible: false,
            code: 'profile_unavailable',
            minimumAgeDays: 30,
            minimumCombinedKarma: 50,
            accountAgeDays: null,
            combinedKarma: null,
            daysRemaining: 30,
            karmaRemaining: 50,
          },
        })
        }
        setDeliveryCapabilities(connectionsResult.capabilities)

        const usageMonth = getCurrentUsageMonth()
        setUsageStats({
          threads: p.signal_month === usageMonth ? Math.max(p.signal_count ?? 0, 0) : 0,
          drafts: p.draft_month === usageMonth ? Math.max(p.draft_count ?? 0, 0) : 0,
          replies: sentCountResult.count || 0,
          keywords: keywordsCountResult.count || 0,
        })

        const plan = getEntitledPlan(p)
        const limits = getPlanLimits(plan)
        const billingSelection = getDodoBillingSelectionFromProductId(p.billing_product_id)
        setPlanState({
          plan,
          billingState: getBillingDisplayState(p),
          currentCadence: billingSelection?.plan === plan ? billingSelection.cadence : null,
          hasBillingPortal: Boolean(p.billing_customer_id && p.billing_subscription_id),
          keywordsMax: limits.keywords,
          threadsMax: limits.threadsPerMonth,
          draftsMax: limits.aiDraftsPerMonth,
        })

        const trustData = trustResult.data
        setDraftsReviewed(Math.min(trustData?.total_drafts_reviewed ?? 0, 10))
        const instantExpiry = Date.parse(p.instant_autopilot_expires_at ?? '')
        setInstantAutopilot({
          available: Boolean(p.instant_autopilot_granted_at)
            && Number.isFinite(instantExpiry)
            && instantExpiry > Date.now()
            && !p.instant_autopilot_used_at,
          used: Boolean(p.instant_autopilot_used_at),
          expiresAt: p.instant_autopilot_expires_at ?? null,
        })
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
        referral_tracking_enabled: planEntitlements.replyAttribution && profile.referralTrackingEnabled,
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
      const slackRequest = planEntitlements.slackNotifications
        ? fetch('/api/settings/slack', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(slackPayload),
          })
        : Promise.resolve(new Response(null, { status: 204 }))
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
            instant_autopilot: instantAutopilot.available && draftsReviewed < 10,
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
      window.dispatchEvent(new CustomEvent('buyerwatch:auto-send-changed', { detail: profile.autoSendEnabled }))
      setTimeout(() => setSaveSuccess(false), 2500)
    } catch (error) {
      console.error('[settings] Unable to save settings', error)
      toast.error('Some settings could not be saved. Reload this page to confirm the saved values.')
    } finally {
      setSaving(false)
    }
  }

  const handleSaveRef = useRef(handleSave)
  handleSaveRef.current = handleSave

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault()
        void handleSaveRef.current()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const handleUpgrade = async (
    plan: 'starter' | 'pro' | 'growth' = 'pro',
    billing: 'monthly' | 'annual' = 'monthly',
  ) => {
    setUpgrading(true)
    try {
      const res = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
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
  useEffect(() => {
    const result = new URLSearchParams(window.location.search).get('x')
    if (result === 'connected') toast.success('X connected. BuyerWatch can now post only when you approve or enable guarded auto-send.')
    if (result && result !== 'connected') toast.error(result === 'plan_required' ? 'X is available on Professional and Growth.' : 'X connection did not complete. Please try again.')
  }, [])

  const handleConnectReddit = async () => {
    const usesSprinklr = deliveryCapabilities.redditConnectionProvider === 'sprinklr'
    const usesHyperbrowser = deliveryCapabilities.redditConnectionProvider === 'hyperbrowser'
    if (!usesSprinklr && !usesHyperbrowser && (!redditLoginUsername.trim() || !redditPassword)) {
      toast.error('Enter your Reddit username and password.')
      return
    }
    setRedditConnecting(true)
    try {
      const response = await fetch('/api/settings/reddit', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(usesSprinklr ? {} : usesHyperbrowser ? {
          sessionId: redditSignInSessionId,
        } : {
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
      setRedditSignInSessionId(null)
      window.dispatchEvent(new Event('buyerwatch:connections-changed'))
      toast.success(`Reddit connected as u/${connectedUsername}`)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'reddit_connection_failed'
      if (code === 'reddit_credentials_or_2fa_rejected') {
        toast.error('Reddit rejected the credentials or 2FA secret.')
      } else if (code === 'rate_limited') {
        toast.error('Too many connection attempts. Please wait and try again.')
      } else if (code === 'reddit_provider_rate_limited') {
        toast.error('Reddit is temporarily rate-limiting connections. Wait 10 minutes, then try once.')
      } else if (code === 'reddit_provider_temporarily_unavailable') {
        toast.error('The Reddit connection service could not reach Reddit after one safe retry. Try again later.')
      } else if (code === 'sprinklr_authentication_failed') {
        toast.error('The managed Reddit connection was rejected. An administrator must reconnect the integration.')
      } else if (code === 'sprinklr_reddit_account_invalid') {
        toast.error('The configured Reddit connection is not an active Reddit account.')
      } else if (code === 'reddit_reconnect_required' || code === 'reddit_account_identity_mismatch') {
        toast.error('Open your Reddit connection, sign in to the expected account, then verify again.')
      } else if (code === 'hyperbrowser_profile_connection_required') {
        toast.error('Reddit connection setup is not ready for this workspace yet.')
      } else if (code === 'hyperbrowser_sign_in_session_required') {
        toast.error('Open a secure Reddit sign-in session first, then verify it here.')
      } else if (code === 'hyperbrowser_session_profile_mismatch') {
        toast.error('That sign-in session does not belong to this Reddit connection. Start a new one.')
      } else if (code === 'hyperbrowser_session_unavailable') {
        toast.error('The Reddit connection is temporarily unavailable. Wait a moment, then verify again.')
      } else {
        toast.error('Could not connect Reddit. Check the details and try again.')
      }
    } finally {
      setRedditPassword('')
      setRedditTotpSecret('')
      setRedditConnecting(false)
    }
  }

  const handleConnectRedditCookie = async () => {
    const cookie = redditSessionCookie.trim()
    if (!cookie) {
      toast.error('Paste your reddit_session cookie.')
      return
    }
    setRedditConnecting(true)
    try {
      const response = await fetch('/api/settings/reddit/hyperbrowser/cookie', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          cookie,
          ...(redditLoginUsername.trim() ? { username: redditLoginUsername.trim() } : {}),
        }),
      })
      const payload = await response.json().catch(() => null) as {
        error?: string
        connection?: { external_username?: string }
      } | null
      if (!response.ok) {
        throw new Error(payload?.error || 'reddit_connection_failed')
      }

      const connectedUsername = payload?.connection?.external_username || redditLoginUsername.trim() || 'Reddit user'
      clearSupabaseReadCache()
      setConnections(current => ({
        ...current,
        reddit: true,
        redditUsername: connectedUsername,
        redditStatus: 'active',
        redditProvider: 'hyperbrowser',
      }))
      setRedditSessionCookie('')
      setRedditLoginUsername('')
      setRedditSignInSessionId(null)
      window.dispatchEvent(new Event('buyerwatch:connections-changed'))
      toast.success(`Reddit connected as u/${connectedUsername}! Auto-pilot is ready.`)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'reddit_connection_failed'
      if (code === 'reddit_session_cookie_invalid') {
        toast.error('Invalid cookie format. Make sure to copy the value of reddit_session.')
      } else if (code === 'reddit_session_cookie_expired_or_invalid') {
        toast.error('Reddit rejected that session cookie. Make sure you are logged in on reddit.com and copy the fresh value.')
      } else if (code === 'reddit_account_identity_mismatch') {
        toast.error('The cookie belongs to a different Reddit account than expected.')
      } else if (code === 'rate_limited') {
        toast.error('Too many attempts. Please wait a moment and try again.')
      } else {
        toast.error('Could not connect Reddit with that cookie. Please check it and try again.')
      }
    } finally {
      setRedditConnecting(false)
    }
  }

  const handleStartHyperbrowserRedditSession = async () => {
    const username = redditLoginUsername.trim().replace(/^u\//i, '')
    if (!/^[A-Za-z0-9_-]{3,32}$/.test(username)) {
      toast.error('Enter the Reddit username you want BuyerWatch to verify.')
      return
    }

    const signInWindow = window.open('about:blank', 'buyerwatch-reddit-sign-in')
    if (!signInWindow) {
      toast.error('Allow pop-ups for BuyerWatch, then try again.')
      return
    }
    signInWindow.opener = null
    signInWindow.document.title = 'Preparing secure Reddit sign-in…'
    signInWindow.document.body.textContent = 'Preparing secure Reddit sign-in…'

    setRedditConnecting(true)
    try {
      const response = await fetch('/api/settings/reddit/hyperbrowser/session', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username }),
      })
      const payload = await response.json().catch(() => null) as {
        error?: string
        sessionId?: string
        liveUrl?: string
      } | null
      if (!response.ok || !payload?.sessionId || !payload.liveUrl) {
        throw new Error(payload?.error || 'hyperbrowser_session_unavailable')
      }
      const liveUrl = new URL(payload.liveUrl)
      if (liveUrl.protocol !== 'https:' || !(
        liveUrl.hostname === 'app.hyperbrowser.ai' || liveUrl.hostname.endsWith('.hxproxy.io')
      )) {
        throw new Error('hyperbrowser_live_view_unavailable')
      }

      setRedditSignInSessionId(payload.sessionId)
      setConnections(current => ({
        ...current,
        reddit: false,
        redditUsername: username,
        redditStatus: 'reauth_required',
        redditProvider: 'hyperbrowser',
      }))
      signInWindow.location.replace(liveUrl.toString())
      toast.success('Secure Reddit sign-in opened. Sign in there, then return and verify.')
    } catch (error) {
      signInWindow.close()
      const code = error instanceof Error ? error.message : 'hyperbrowser_session_unavailable'
      toast.error(code === 'rate_limited'
        ? 'Too many sign-in attempts. Please wait and try again.'
        : 'Could not open the secure Reddit sign-in. Please try again.')
    } finally {
      setRedditConnecting(false)
    }
  }

  const handleConnectRedditBrowser = async () => {
    setRedditConnecting(true)
    try {
      const identity = await connectRedditThroughChrome()
      if (!identity) throw new Error('connector_not_installed')
      if (!identity.success || !identity.username) {
        throw new Error(identity.error || 'reddit_identity_failed')
      }
      const response = await fetch('/api/settings/reddit/browser', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: identity.username }),
      })
      const payload = await response.json().catch(() => null) as {
        error?: string
        connection?: { external_username?: string }
      } | null
      if (!response.ok) throw new Error(payload?.error || 'reddit_browser_connection_failed')

      const username = payload?.connection?.external_username || identity.username
      clearSupabaseReadCache()
      setConnections(current => ({
        ...current,
        reddit: true,
        redditUsername: username,
        redditStatus: 'active',
        redditProvider: 'browser_relay',
      }))
      window.dispatchEvent(new Event('buyerwatch:connections-changed'))
      toast.success(`Reddit connected as u/${username}`)
    } catch (error) {
      const code = error instanceof Error ? error.message : 'reddit_browser_connection_failed'
      if (code === 'connector_not_installed') {
        toast.error('Install the BuyerWatch Reddit Connector, then click Connect with Chrome again.')
      } else if (code === 'reddit_login_required') {
        toast.error('Log in to Reddit in Chrome, then try again.')
      } else {
        toast.error('Chrome could not verify the logged-in Reddit account. Open your Reddit profile and retry.')
      }
    } finally {
      setRedditConnecting(false)
    }
  }

  useEffect(() => {
    if (!userId) return
    let cancelled = false
    fetch('/api/settings/mcp/token', { cache: 'no-store' })
      .then(async response => {
        const payload = await response.json().catch(() => null)
        if (!response.ok) throw new Error(payload?.error || 'mcp_settings_load_failed')
        if (!cancelled) {
          setMcpSettings({
            configured: Boolean(payload.configured),
            tokenPrefix: payload.tokenPrefix || '',
            endpoint: payload.endpoint || 'https://www.buyerwatch.co/api/mcp',
            lastUsedAt: payload.lastUsedAt || null,
          })
        }
      })
      .catch(error => console.error('[settings] Unable to load MCP settings', error))
    return () => { cancelled = true }
  }, [userId])

  const handleCreateMcpToken = async () => {
    setMcpUpdating(true)
    try {
      const response = await fetch('/api/settings/mcp/token', { method: 'POST' })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.token) throw new Error(payload?.error || 'mcp_token_create_failed')
      setMcpToken(payload.token)
      setMcpSettings(current => ({
        ...current,
        configured: true,
        tokenPrefix: payload.tokenPrefix || '',
        endpoint: payload.endpoint || current.endpoint,
        lastUsedAt: null,
      }))
      toast.success('Connection key created. Copy it now; it is shown only once.')
    } catch (error) {
      console.error('[settings] Unable to create MCP token', error)
      toast.error('Could not create the connection key.')
    } finally {
      setMcpUpdating(false)
    }
  }

  const handleRevokeMcpToken = async () => {
    setMcpUpdating(true)
    try {
      const response = await fetch('/api/settings/mcp/token', { method: 'DELETE' })
      if (!response.ok) throw new Error('mcp_token_revoke_failed')
      setMcpToken('')
      setMcpSettings(current => ({ ...current, configured: false, tokenPrefix: '', lastUsedAt: null }))
      toast.success('Connection access revoked')
    } catch (error) {
      console.error('[settings] Unable to revoke MCP token', error)
      toast.error('Could not revoke connection access.')
    } finally {
      setMcpUpdating(false)
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

  const handleDisconnect = async (platform: 'reddit' | 'bluesky' | 'x') => {
    try {
      const response = await fetch('/api/settings/connections', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ platform }),
      })
      if (!response.ok) throw new Error('disconnect_failed')
      clearSupabaseReadCache()
      setConnections(p => platform === 'reddit'
        ? { ...p, reddit: false, redditUsername: '', redditStatus: 'missing', redditProvider: null }
        : platform === 'bluesky' ? { ...p, bluesky: false } : { ...p, x: false, xUsername: '' })
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
  const instantAutopilotMode = instantAutopilot.available && draftsReviewed < 10
  const canActivateAutomation = getPlanLimits(planState.plan).autoSend
    && (draftsReviewed >= 10 || instantAutopilotMode)
  const redditDirectConnected = deliveryCapabilities.redditDirectPosting && connections.reddit
  const redditAutomaticDeliveryReady = redditDirectConnected && (
    connections.redditProvider === 'sprinklr'
    || connections.redditAutoSendEligibility.eligible
  )
  const hasSelectedDirectConnection = (
    profile.autoSendPlatforms.includes('bluesky') && connections.bluesky
  ) || (
    profile.autoSendPlatforms.includes('reddit') && redditAutomaticDeliveryReady
  )
  const conversionWebhookUrl = `${process.env.NEXT_PUBLIC_APP_URL || 'https://buyerwatch.co'}/api/webhooks/conversion`

  if (settingsLoading) {
    return (
      <AppPage>
        <div className="w-full max-w-[1280px]" role="status" aria-label="Loading settings">
          <div className="mb-7 flex h-[56px] items-center justify-between border-b border-[#EAECF0] px-1">
            <div className="h-7 w-24 animate-pulse rounded-lg bg-[#EEF0F3]" />
            <div className="h-10 w-32 animate-pulse rounded-xl bg-[#EEF0F3]" />
          </div>
          <div className="flex flex-col gap-7 md:flex-row md:items-start md:gap-8">
              <div className="grid grid-cols-2 gap-1.5 md:w-[210px] md:grid-cols-1">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-[14px] bg-white/80" />
                ))}
              </div>
              <div className="min-w-0 flex-1 space-y-4">
                {[1, 2, 3].map((_, i) => (
                  <div key={i} className="rounded-[22px] border border-[#E4E7EC] bg-white p-6">
                    <div className="mb-5 h-5 w-36 animate-pulse rounded-md bg-[#EEF0F3]" />
                    <div className="h-11 w-full animate-pulse rounded-xl bg-[#F2F4F7]" />
                  </div>
                ))}
              </div>
            </div>
        </div>
      </AppPage>
    )
  }


  if (loadFailed) {
    return (
      <AppPage>
        <div className="w-full max-w-[1280px]">
          <div className="mb-7 border-b border-[#EAECF0] px-1 pb-5">
            <h1 className="page-title">Settings</h1>
          </div>
          <DataLoadError
            title="Couldn’t load settings"
            description="Your saved settings could not be loaded, so editing is disabled to protect them. Check your connection and try again."
            onRetry={() => setLoadAttempt(attempt => attempt + 1)}
          />
        </div>
      </AppPage>
    )
  }

  return (
    <AppPage>
      <div className="w-full max-w-[1280px] pb-6 font-[family-name:var(--font-sans)]">
        <header className="mb-7 flex min-h-[56px] items-center justify-between gap-4 border-b border-[#EAECF0] px-1 pb-5">
          <h1 className="page-title font-[family-name:var(--font-display)] font-semibold tracking-[-0.04em]">Settings</h1>
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <SaveButton
              onClick={handleSave}
              saving={saving}
              saved={saveSuccess}
              disabled={settingsLoading || loadFailed}
              size="sm"
            />
          </div>
        </header>

        <div className="flex flex-col items-stretch gap-7 md:flex-row md:items-start md:gap-8">
          {/* ── Sidebar ───────────────────────────────────────────── */}
          <nav className="shrink-0 md:sticky md:top-6 md:w-[200px] md:border-r md:border-[#EAECF0] md:pr-5" aria-label="Settings sections">
            <ul className="grid grid-cols-2 gap-1 md:flex md:flex-col">
              {SECTIONS.map(s => (
                <li key={s.id}>
                  <SettingsNavItem section={s} active={activeSection === s.id} onClick={() => setActiveSection(s.id)} />
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
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_272px]">
                      <SectionCard title="Business profile" description="The context BuyerWatch uses to understand your product.">
                        <div className="space-y-4">
                          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                            <Field label="Business name">
                              <input value={profile.businessName} onChange={e => setProfile(p => ({ ...p, businessName: e.target.value }))} placeholder="Acme Inc." className={inputCls} />
                            </Field>
                            <Field label="Category">
                              <select value={profile.businessType} onChange={e => setProfile(p => ({ ...p, businessType: e.target.value }))} className={inputCls + ' cursor-pointer'}>
                                {BUSINESS_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                              </select>
                            </Field>
                          </div>
                          <Field label="Website">
                            <div className="relative">
                              <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                              <input value={profile.businessUrl} onChange={e => setProfile(p => ({ ...p, businessUrl: e.target.value }))} placeholder="https://yourdomain.com" className={inputCls + ' pl-9'} />
                            </div>
                          </Field>
                          <Field label="What you do" hint="Used only for reply context">
                            <textarea value={profile.businessDescription} onChange={e => setProfile(p => ({ ...p, businessDescription: e.target.value }))} placeholder="Describe your product in one or two clear sentences." rows={3} className={inputCls + ' resize-none'} />
                          </Field>
                        </div>
                      </SectionCard>

                      <aside className="rounded-[22px] bg-[#101828] p-5 text-white shadow-[0_12px_30px_rgba(16,24,40,0.16)]">
                        <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/10 text-[17px] font-semibold">
                          {(profile.businessName || 'B').trim().charAt(0).toUpperCase()}
                        </div>
                        <p className="mt-5 text-[15px] font-semibold tracking-[-0.015em]">{profile.businessName || 'Your business'}</p>
                        <p className="mt-1 text-[12px] leading-5 text-white/60">This profile guides qualification and reply drafting.</p>
                        <div className="mt-6 space-y-3 border-t border-white/10 pt-4 text-[11px]">
                          <div className="flex items-center justify-between"><span className="text-white/55">Website</span><span className="font-medium text-white">{profile.businessUrl ? 'Added' : 'Missing'}</span></div>
                          <div className="flex items-center justify-between"><span className="text-white/55">Description</span><span className="font-medium text-white">{profile.businessDescription ? 'Added' : 'Missing'}</span></div>
                          <div className="flex items-center justify-between"><span className="text-white/55">Voice</span><span className="font-medium text-white">{profile.toneArchetype ? 'Set' : 'Default'}</span></div>
                        </div>
                      </aside>
                    </div>

                    <div className="grid gap-4 lg:grid-cols-2">
                      <SectionCard title="Reply identity" description="The account shown when BuyerWatch replies.">
                        <Field label="Reddit username">
                          <div className="relative">
                            <AtSign className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#98A2B3]" />
                            <input value={profile.redditUsername} onChange={e => setProfile(p => ({ ...p, redditUsername: e.target.value }))} placeholder="your_reddit_handle" className={inputCls + ' pl-9'} />
                          </div>
                        </Field>
                      </SectionCard>

                      <SectionCard title="Competitor signals" description="Surface relevant alternative and switching conversations.">
                        <Field label="Competitors" hint="Separate names with commas">
                          <input value={profile.competitors} onChange={e => setProfile(p => ({ ...p, competitors: e.target.value }))} placeholder="e.g. CompetitorA, CompetitorB" className={inputCls} />
                        </Field>
                      </SectionCard>
                    </div>

                    <SectionCard title="Reply voice" description="Choose the default voice for generated replies.">
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-4">
                        {(Object.entries(TONE_ARCHETYPES) as [ToneArchetype, (typeof TONE_ARCHETYPES)[ToneArchetype]][]).map(([id, archetype]) => {
                          const selected = profile.toneArchetype === id
                          return (
                            <button key={id} type="button" onClick={() => setProfile(p => ({ ...p, toneArchetype: p.toneArchetype === id ? null : id }))} className={`min-h-[88px] cursor-pointer rounded-2xl border p-3.5 text-left transition-all ${selected ? 'border-[#101828] bg-[#101828] shadow-[0_4px_12px_rgba(16,24,40,0.14)]' : 'border-[#E4E7EC] bg-[#FBFCFD] hover:border-[#C9D0D8] hover:bg-white'}`}>
                              <span className={`block text-[12px] font-semibold ${selected ? 'text-white' : 'text-[#101828]'}`}>{archetype.label}</span>
                              <span className={`mt-1 block text-[10.5px] leading-4 ${selected ? 'text-white/65' : 'text-[#667085]'}`}>{archetype.description}</span>
                            </button>
                          )
                        })}
                      </div>
                      <div className="mt-5 border-t border-[#EAECF0] pt-4">
                        <p className="mb-2 text-[12.5px] font-semibold text-[#344054]">Guardrails</p>
                        <div className="flex flex-wrap gap-2">
                          {(Object.entries(STYLE_GUARDRAILS) as [StyleGuardrail, (typeof STYLE_GUARDRAILS)[StyleGuardrail]][]).map(([id, guardrail]) => {
                            const active = profile.styleGuardrails.includes(id)
                            return <button key={id} type="button" onClick={() => setProfile(p => ({ ...p, styleGuardrails: p.styleGuardrails.includes(id) ? p.styleGuardrails.filter(item => item !== id) : [...p.styleGuardrails, id] }))} className={`min-h-8 cursor-pointer rounded-lg border px-3 py-1 text-[11px] font-semibold transition-all ${active ? 'border-[#101828] bg-[#101828] text-white' : 'border-[#E4E7EC] bg-white text-[#475467] hover:border-[#C9D0D8]'}`}>{active ? `✓ ${guardrail.label}` : guardrail.label}</button>
                          })}
                        </div>
                      </div>
                      <details className="group mt-5 rounded-2xl border border-[#E4E7EC] bg-[#FBFCFD] px-4 py-3.5">
                        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[12.5px] font-semibold text-[#344054] [&::-webkit-details-marker]:hidden">
                          Fine-tune your writing style
                          <ChevronDown className="h-4 w-4 text-[#667085] transition-transform group-open:rotate-180" />
                        </summary>
                        <div className="mt-4 grid gap-4 lg:grid-cols-2">
                          <Field label="Custom instructions" hint="Optional">
                            <textarea value={profile.writingStyle} onChange={e => setProfile(p => ({ ...p, writingStyle: e.target.value }))} rows={4} placeholder="Casual, direct, no buzzwords…" className={inputCls + ' resize-none bg-white'} />
                          </Field>
                          <Field label="Example replies" hint="Optional">
                            <textarea value={profile.toneExamples} onChange={e => setProfile(p => ({ ...p, toneExamples: e.target.value }))} rows={4} placeholder="Paste two or three replies that sound like you." className={inputCls + ' resize-none bg-white'} />
                          </Field>
                        </div>
                      </details>
                    </SectionCard>

                    <div className="flex justify-end pt-2">
                      <SaveButton
                        onClick={handleSave}
                        saving={saving}
                        saved={saveSuccess}
                      />
                    </div>
                  </>
                )}

                {/* ── CONNECTIONS ─────────────────────────────────── */}
                {activeSection === 'connections' && (
                  <>
                    <SectionCard title="Accounts" description="One place to manage monitoring and delivery access.">
                      <div className="mb-5 grid gap-2 sm:grid-cols-3">
                        {[
                          { label: 'Monitoring', value: connections.reddit || connections.x || connections.bluesky ? 'Connected' : 'Not connected', good: connections.reddit || connections.x || connections.bluesky },
                          { label: 'Reply delivery', value: hasSelectedDirectConnection ? 'Ready to configure' : 'Needs an account', good: hasSelectedDirectConnection },
                          { label: 'Security', value: 'Accounts stay private', good: true },
                        ].map(item => (
                          <div key={item.label} className="rounded-xl border border-[#E7E9EE] bg-[#F8FAFC] px-3.5 py-3">
                            <div className="flex items-center gap-2 text-[11px] font-medium text-[#667085]">
                              <span className={`h-1.5 w-1.5 rounded-full ${item.good ? 'bg-emerald-500' : 'bg-[#98A2B3]'}`} />
                              {item.label}
                            </div>
                            <p className="mt-1 text-[12.5px] font-semibold text-[#101828]">{item.value}</p>
                          </div>
                        ))}
                      </div>
                      <div className="space-y-3">
                        <PlatformRow
                          icon={<RedditIcon className="w-5 h-5 text-[#FF4500]" />}
                          name="Reddit"
                          description={
                            connections.reddit && connections.redditUsername
                              ? `Connected as u/${connections.redditUsername}`
                              : connections.redditStatus === 'reauth_required'
                                ? `Reconnect u/${connections.redditUsername || 'your account'} to resume delivery.`
                              : deliveryCapabilities.redditBrowserConnection
                                ? 'Connect your own account through an AI agent without sharing Reddit credentials.'
                              : deliveryCapabilities.redditDirectPosting
                                ? 'Connect once for encrypted, server-side reply delivery.'
                                : deliveryCapabilities.redditScheduledDiscovery
                                  ? 'Scheduled discovery is active. Direct delivery is temporarily unavailable.'
                                  : 'Reddit monitoring and delivery are not configured.'
                          }
                          connected={connections.reddit}
                          onDisconnect={() => handleDisconnect('reddit')}
                        >
                          {!connections.reddit && (
                            deliveryCapabilities.redditDirectPosting
                            || deliveryCapabilities.redditBrowserConnection
                          ) && (
                            <div className="space-y-3">
                              {connections.redditStatus === 'reauth_required' && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-100 bg-amber-50 p-3 text-[12px] leading-5 text-amber-800" role="status">
                                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                                  Reddit expired the saved session. Automatic Reddit replies are paused until you reconnect.
                                </div>
                              )}
                              <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
                                <div className="flex items-start gap-3">
                                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                                    <ShieldCheck className="h-4 w-4" />
                                  </span>
                                  <div className="min-w-0">
                                    <p className="text-[13px] font-semibold text-gray-950">Connect Reddit securely</p>
                                    <p className="mt-1 text-[12px] leading-5 text-gray-600">
                                      Connect the Reddit account you already use. BuyerWatch never receives your Reddit password or browser cookies.
                                    </p>
                                  </div>
                                </div>
                                <details className="group mt-4 rounded-xl border border-gray-200 bg-gray-50/70 p-3">
                                  <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-[12px] font-semibold text-gray-800 [&::-webkit-details-marker]:hidden">
                                    <span>Set up a Reddit connection</span>
                                    <ChevronDown className="h-4 w-4 shrink-0 text-gray-500 transition-transform group-open:rotate-180" />
                                  </summary>
                                  <div className="mt-3 space-y-3">
                                    {deliveryCapabilities.mcpConnection && (
                                    <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
                                      <p className="text-[12px] font-semibold text-blue-950">Use your connected AI assistant</p>
                                      <p className="mt-1 text-[11.5px] leading-5 text-blue-900/75">
                                        Create a secure connection key, then follow the setup instructions in your assistant. Your Reddit account remains in your control.
                                      </p>
                                      <div className="mt-3 space-y-2">
                                        <div className="flex gap-2">
                                          <input readOnly value={mcpSettings.endpoint} aria-label="BuyerWatch connection endpoint" className={`${inputCls} min-w-0 flex-1 bg-white text-[11.5px]`} />
                                          <button type="button" onClick={() => void copySettingValue(mcpSettings.endpoint, 'connection endpoint')} className="rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-semibold text-blue-900 hover:bg-blue-100">Copy</button>
                                        </div>
                                        {mcpToken && (
                                          <div className="flex gap-2">
                                            <input readOnly value={mcpToken} aria-label="BuyerWatch connection key" className={`${inputCls} min-w-0 flex-1 bg-white font-mono text-[11px]`} />
                                            <button type="button" onClick={() => void copySettingValue(mcpToken, 'connection key')} className="rounded-lg border border-blue-200 bg-white px-3 text-[12px] font-semibold text-blue-900 hover:bg-blue-100">Copy key</button>
                                          </div>
                                        )}
                                      </div>
                                      <div className="mt-3 flex flex-wrap items-center gap-2">
                                        <button
                                          type="button"
                                          onClick={() => void handleCreateMcpToken()}
                                          disabled={mcpUpdating}
                                          className="rounded-lg bg-blue-600 px-3 py-2 text-[12px] font-semibold text-white hover:bg-blue-700 disabled:cursor-wait disabled:opacity-60"
                                        >
                                          {mcpUpdating ? 'Updating...' : mcpSettings.configured ? 'Rotate connection key' : 'Create connection key'}
                                        </button>
                                        {mcpSettings.configured && (
                                          <button type="button" onClick={() => void handleRevokeMcpToken()} disabled={mcpUpdating} className="rounded-lg border border-blue-200 bg-white px-3 py-2 text-[12px] font-semibold text-blue-900 hover:bg-blue-100 disabled:opacity-60">Revoke key</button>
                                        )}
                                        {mcpSettings.configured && !mcpToken && (
                                          <span className="text-[11px] text-blue-900/65">Key {mcpSettings.tokenPrefix}… is active.</span>
                                        )}
                                      </div>
                                    </div>
                                    )}
                                    {deliveryCapabilities.redditBrowserConnection && (
                                      <details className="rounded-xl border border-gray-200 bg-white p-3">
                                        <summary className="cursor-pointer text-[12px] font-semibold text-gray-800">Connect with Chrome</summary>
                                        <p className="mt-2 text-[11.5px] leading-5 text-gray-500">Use the connector when your assistant cannot control a logged-in browser.</p>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          <a href="/buyerwatch-reddit-connector.zip" download className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50">Download connector</a>
                                          <button type="button" onClick={() => void handleConnectRedditBrowser()} disabled={redditConnecting} className="rounded-lg border border-gray-200 px-3 py-2 text-[12px] font-semibold text-gray-700 hover:bg-gray-50 disabled:opacity-60">{redditConnecting ? 'Checking Chrome...' : 'Connect with Chrome'}</button>
                                        </div>
                                      </details>
                                    )}
                                    <details className="rounded-xl border border-gray-200 bg-white p-3">
                                      <summary className="cursor-pointer text-[12px] font-semibold text-gray-800">Verify your Reddit connection</summary>
                                      <div className="mt-3 space-y-3">
                                        {deliveryCapabilities.redditConnectionProvider === 'sprinklr' ? (
                                          <div className="rounded-lg border border-blue-100 bg-blue-50 p-3 text-[12px] leading-5 text-blue-900">
                                            Reddit authorization is managed by your organization. Verify the active Reddit connection here; BuyerWatch never receives your Reddit password.
                                          </div>
                                        ) : deliveryCapabilities.redditConnectionProvider === 'hyperbrowser' ? (
                                          <div className="space-y-4">
                                            {/* Session Cookie Connection (Primary & 100% Reliable) */}
                                            <div className="rounded-xl border border-blue-200 bg-blue-50/60 p-3.5 space-y-2.5">
                                              <div className="flex items-center justify-between">
                                                <span className="text-[12px] font-semibold text-blue-950 flex items-center gap-1.5">
                                                  <span className="inline-block h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                                                  Connect via Session Cookie (Instant & 100% Autonomous)
                                                </span>
                                                <span className="text-[10.5px] font-medium rounded-full bg-blue-100 text-blue-800 px-2 py-0.5">
                                                  Recommended
                                                </span>
                                              </div>
                                              <p className="text-[11.5px] leading-relaxed text-blue-900/80">
                                                Already signed into Reddit in your browser? Paste your <code className="rounded bg-blue-100/80 px-1 py-0.5 font-mono text-[11px] text-blue-900">reddit_session</code> cookie to connect instantly without password or network security blocks.
                                              </p>
                                              
                                              <div className="space-y-2">
                                                <div className="flex gap-2">
                                                  <input
                                                    type="password"
                                                    value={redditSessionCookie}
                                                    onChange={event => setRedditSessionCookie(event.target.value)}
                                                    placeholder="Paste reddit_session cookie value here…"
                                                    autoComplete="off"
                                                    className={`${inputCls} min-w-0 flex-1 bg-white`}
                                                  />
                                                  <button
                                                    type="button"
                                                    onClick={() => void handleConnectRedditCookie()}
                                                    disabled={redditConnecting || !redditSessionCookie.trim()}
                                                    className="rounded-lg bg-gray-900 px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60 shrink-0 shadow-sm"
                                                  >
                                                    {redditConnecting ? 'Connecting…' : 'Connect Reddit'}
                                                  </button>
                                                </div>

                                                <details className="text-[11px] text-blue-900/70 pt-1">
                                                  <summary className="cursor-pointer font-medium hover:text-blue-950 transition-colors">
                                                    📋 How to find your reddit_session cookie in 15 seconds
                                                  </summary>
                                                  <ol className="mt-2 list-decimal pl-4 space-y-1 text-[11px] leading-relaxed text-blue-950/80 bg-white/70 rounded-lg p-2.5 border border-blue-100">
                                                    <li>Open <a href="https://www.reddit.com" target="_blank" rel="noreferrer" className="underline font-semibold">reddit.com</a> in your browser where you are logged in.</li>
                                                    <li>Press <strong>F12</strong> (or right-click anywhere and click <strong>Inspect</strong>).</li>
                                                    <li>Go to the <strong>Application</strong> tab (or <strong>Storage</strong> in Firefox).</li>
                                                    <li>Under <strong>Cookies</strong>, click <strong>https://www.reddit.com</strong>.</li>
                                                    <li>Find <strong>reddit_session</strong>, double-click its <strong>Value</strong>, and copy it.</li>
                                                  </ol>
                                                </details>
                                              </div>
                                            </div>

                                            {/* Alternative Sign-in Window Option */}
                                            <details className="rounded-xl border border-gray-200 bg-white p-3">
                                              <summary className="cursor-pointer text-[12px] font-semibold text-gray-700">
                                                Alternative: Sign in via cloud browser pop-up
                                              </summary>
                                              <div className="mt-3 space-y-3">
                                                <div className="rounded-lg border border-gray-100 bg-gray-50 p-2.5 text-[11.5px] leading-5 text-gray-600">
                                                  If your account has a Reddit username and password, you can sign in directly inside the cloud browser window.
                                                </div>
                                                <input
                                                  value={redditLoginUsername}
                                                  onChange={event => setRedditLoginUsername(event.target.value)}
                                                  placeholder="Reddit username (e.g. Ok_Assist_5361)"
                                                  autoComplete="username"
                                                  className={inputCls}
                                                />
                                                <div className="flex flex-wrap items-center gap-2">
                                                  <button type="button" onClick={() => void handleStartHyperbrowserRedditSession()} disabled={redditConnecting} className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-[12px] font-semibold text-gray-800 transition-colors hover:bg-gray-50 disabled:cursor-wait disabled:opacity-60">
                                                    {redditConnecting ? 'Preparing securely…' : redditSignInSessionId ? 'Open a new sign-in session' : 'Open secure Reddit sign-in'}
                                                  </button>
                                                  {redditSignInSessionId && (
                                                    <button type="button" onClick={() => void handleConnectReddit()} disabled={redditConnecting} className="rounded-lg bg-gray-900 px-3 py-1.5 text-[12px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60">
                                                      {redditConnecting ? 'Verifying…' : 'I’m signed in — verify account'}
                                                    </button>
                                                  )}
                                                </div>
                                              </div>
                                            </details>
                                          </div>
                                        ) : <>
                                        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                          <input value={redditLoginUsername} onChange={event => setRedditLoginUsername(event.target.value)} placeholder="Reddit username" autoComplete="username" className={inputCls} />
                                          <input type="password" value={redditPassword} onChange={event => setRedditPassword(event.target.value)} placeholder="Reddit password" autoComplete="current-password" className={inputCls} />
                                        </div>
                                        <input type="password" value={redditTotpSecret} onChange={event => setRedditTotpSecret(event.target.value)} placeholder="2FA setup secret (optional; not the 6-digit code)" autoComplete="off" className={inputCls} />
                                        <p className="text-[11.5px] leading-5 text-gray-500">Credentials are used once to establish a Reddit session. BuyerWatch never stores your password or 2FA secret; only the returned session cookies are encrypted at rest.</p>
                                        </>}
                                        {deliveryCapabilities.redditConnectionProvider !== 'hyperbrowser' && (
                                          <button type="button" onClick={() => void handleConnectReddit()} disabled={redditConnecting} className="rounded-lg bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800 disabled:cursor-wait disabled:opacity-60">
                                            {redditConnecting ? 'Connecting securely...' : deliveryCapabilities.redditConnectionProvider === 'sprinklr' ? 'Verify Reddit connection' : connections.redditStatus === 'reauth_required' ? 'Reconnect Reddit' : 'Connect Reddit'}
                                          </button>
                                        )}
                                      </div>
                                    </details>
                                  </div>
                                </details>
                              </div>
                            </div>
                          )}
                        </PlatformRow>

                        <PlatformRow
                          icon={<XIcon className="w-5 h-5 text-[#0F1419]" />}
                          name="X"
                          description={connections.x ? `Connected as @${connections.xUsername}` : canMonitorPlatform(planState.plan, 'x') ? 'Connect your X account to post replies from your own account.' : 'Professional or Growth is required for X monitoring and posting.'}
                          connected={connections.x}
                          onDisconnect={() => handleDisconnect('x')}
                        >
                          {!connections.x && canMonitorPlatform(planState.plan, 'x') && (
                            <a href="/api/settings/x" className="inline-flex rounded-lg bg-[#0F1419] px-4 py-2 text-[13px] font-semibold text-white hover:bg-black">Connect X securely</a>
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

                    <SectionCard title="Automation" description="Control when BuyerWatch may publish without individual approval.">
                      <div className="space-y-5">
                        <div className={`rounded-xl border p-4 sm:p-5 ${
                          instantAutopilot.available
                            ? 'border-emerald-200 bg-emerald-50'
                            : 'border-black/5 bg-[#F8F9FA]'
                        }`}>
                          <div className="flex items-start justify-between gap-4">
                            <div className="flex min-w-0 items-start gap-3">
                              <span className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border bg-white ${
                                instantAutopilot.available ? 'border-emerald-200 text-emerald-600' : 'border-black/5 text-gray-500'
                              }`}>
                                <Sparkles className="h-4 w-4" />
                              </span>
                              <div className="min-w-0">
                                <p className="text-[14px] font-semibold text-gray-900">Trial auto-send</p>
                                <p className="mt-1 max-w-[560px] text-[13px] leading-5 text-gray-600">
                                  {instantAutopilot.available
                                    ? 'One automatic reply is ready. BuyerWatch will send it only after every safety check passes.'
                                    : instantAutopilot.used
                                      ? 'Your included trial auto-send has been used. Complete the review period to unlock ongoing auto-send.'
                                      : instantAutopilot.expiresAt
                                        ? 'Your trial auto-send has expired. Complete the review period to unlock ongoing auto-send.'
                                        : 'One safeguarded automatic reply is included with your 7-day Starter trial.'}
                                </p>
                              </div>
                            </div>
                            <span className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-semibold ${
                              instantAutopilot.available
                                ? 'bg-emerald-100 text-emerald-700'
                                : instantAutopilot.used
                                  ? 'bg-gray-200 text-gray-600'
                                  : 'bg-white text-gray-600 ring-1 ring-black/5'
                            }`}>
                              {instantAutopilot.available
                                ? 'Ready'
                                : instantAutopilot.used
                                  ? 'Completed'
                                  : instantAutopilot.expiresAt
                                    ? 'Expired'
                                    : 'Included in trial'}
                            </span>
                          </div>
                        </div>

                        <div className="flex items-start justify-between gap-6">
                          <div className="flex-1">
                            <p className="text-[14px] font-semibold text-gray-900">
                              {instantAutopilotMode ? 'Activate trial auto-send' : 'Ongoing auto-send'}
                            </p>
                            <p className="mt-1 max-w-[580px] text-[13px] leading-5 text-gray-500">
                              {!getPlanLimits(planState.plan).autoSend
                                ? `Available on Starter and above. ${draftsReviewed} of 10 required reviews completed.`
                                : instantAutopilotMode
                              ? 'Your included auto-send is ready for one eligible reply—no draft approval required.'
                                  : draftsReviewed < 10
                                  ? `${draftsReviewed} of 10 required reviews completed. This review period helps BuyerWatch learn your standards before ongoing automation is enabled.`
                                  : 'Enable ongoing auto-send so eligible high-intent replies can publish automatically after every safeguard passes. You can pause automation at any time.'}
                            </p>
                            {!instantAutopilotMode && draftsReviewed < 10 && (
                              <div className="mt-3 max-w-[420px]" aria-label={`${draftsReviewed} of 10 required reviews completed`}>
                                <div className="mb-1.5 flex items-center justify-between text-[11.5px] font-medium text-gray-500">
                                  <span>Review progress</span>
                                  <span className="tabular-nums text-gray-700">{draftsReviewed}/10</span>
                                </div>
                                <div className="h-1.5 overflow-hidden rounded-full bg-gray-100">
                                  <div
                                    className="h-full rounded-full bg-gray-900 transition-[width] duration-300"
                                    style={{ width: `${Math.min(100, Math.max(0, draftsReviewed * 10))}%` }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                          {profile.autoSendEnabled || canActivateAutomation ? (
                            <Toggle
                              label="Toggle earned auto-send"
                              checked={profile.autoSendEnabled}
                              onChange={value => {
                                if (value && !hasSelectedDirectConnection) {
                                  toast.info('Connect and select at least one direct-delivery platform first.')
                                  return
                                }
                                setActivationAcknowledged(true)
                                setProfile(current => ({
                                  ...current,
                                  autoSendEnabled: value,
                                  ...(value && instantAutopilotMode
                                    ? { autoSendThreshold: Math.max(90, current.autoSendThreshold), autoSendDailyLimit: 1 }
                                    : {}),
                                }))
                                if (value) {
                                  toast.success('Auto-send enabled! Remember to click Save changes.')
                                }
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

                        <div className={`rounded-xl border p-4 ${instantAutopilotMode ? 'border-emerald-200 bg-emerald-50' : 'border-black/5 bg-[#F8F9FA]'}`}>
                          <p className="flex items-center gap-2 text-[12.5px] font-semibold text-gray-900">
                            <ShieldCheck className={`h-4 w-4 ${instantAutopilotMode ? 'text-emerald-600' : 'text-blue-600'}`} />
                            Built-in safeguards
                          </p>
                          <p className={`mt-1.5 text-[12.5px] leading-5 ${instantAutopilotMode ? 'text-emerald-800' : 'text-gray-600'}`}>
                            {instantAutopilotMode
                              ? 'BuyerWatch sends only when intent is 90 or higher, the reply is fresh and unique, the account is connected, and platform requirements are satisfied. Auto-send pauses after this reply.'
                              : 'After the review period, every reply must meet your confidence threshold, quality checks, platform requirements, target scope, and daily limit.'}
                          </p>
                        </div>

                        <AnimatePresence>
                          {(profile.autoSendEnabled || canActivateAutomation) && (
                            <motion.div
                              initial={{ opacity: 0, height: 0 }}
                              animate={{ opacity: 1, height: 'auto' }}
                              exit={{ opacity: 0, height: 0 }}
                              transition={{ duration: 0.2 }}
                            >
                              <div className="space-y-5 border-t border-gray-100 pt-4">
                                {redditDirectConnected && !redditAutomaticDeliveryReady ? (
                                  <div className="flex items-start gap-2.5 rounded-xl border border-amber-100 bg-amber-50 p-3">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                    <p className="text-[12.5px] leading-relaxed text-amber-800">
                                      Reddit is connected for reviewed replies. Automatic replies unlock when the account reaches {connections.redditAutoSendEligibility.minimumAgeDays} days old and {connections.redditAutoSendEligibility.minimumCombinedKarma} combined karma
                                      {connections.redditAutoSendEligibility.daysRemaining > 0 || connections.redditAutoSendEligibility.karmaRemaining > 0
                                        ? ` (${connections.redditAutoSendEligibility.daysRemaining} days and ${connections.redditAutoSendEligibility.karmaRemaining} karma remaining).`
                                        : '.'}
                                    </p>
                                </div>
                                ) : redditDirectConnected ? (
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

                                <div className="space-y-5 rounded-2xl border border-[#EAECF0] bg-[#F9FAFB]/60 p-4 sm:p-5">
                                  <SettingsSlider
                                    label="Minimum confidence threshold"
                                    description="BuyerWatch only publishes automatically when confidence meets or clears this threshold."
                                    value={instantAutopilotMode ? Math.max(90, profile.autoSendThreshold) : profile.autoSendThreshold}
                                    min={instantAutopilotMode ? 90 : 70}
                                    max={99}
                                    step={1}
                                    unit="%"
                                    disabled={instantAutopilotMode}
                                    minLabel={instantAutopilotMode ? '90% floor (Trial autopilot)' : '70% floor (Standard)'}
                                    maxLabel="99% (Strict conviction)"
                                    badgeText={profile.autoSendThreshold >= 90 ? 'High confidence' : 'Balanced'}
                                    onChange={val => setProfile(current => ({ ...current, autoSendThreshold: val }))}
                                  />

                                  <div className="border-t border-[#EAECF0] pt-4">
                                    <SettingsSlider
                                      label="Maximum automated replies per day"
                                      description="Caps automated replies published across all connected platforms per 24 hours."
                                      value={instantAutopilotMode ? 1 : profile.autoSendDailyLimit}
                                      min={1}
                                      max={25}
                                      step={1}
                                      unit=" / day"
                                      disabled={instantAutopilotMode}
                                      minLabel="1 / day (Conservative)"
                                      maxLabel="25 / day (High volume)"
                                      badgeText={instantAutopilotMode ? 'Trial locked' : `${profile.autoSendDailyLimit} max / day`}
                                      onChange={val => setProfile(current => ({ ...current, autoSendDailyLimit: val }))}
                                    />
                                  </div>
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
                                  <label className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-[12.5px] ${redditAutomaticDeliveryReady ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                                    <span className="flex items-center gap-2.5 font-medium text-gray-700">
                                      <RedditIcon className="h-4 w-4 text-[#FF4500]" />
                                      Reddit
                                      <span className="font-normal text-gray-400">
                                        {redditAutomaticDeliveryReady ? 'Direct' : redditDirectConnected ? 'Reviewed only' : 'Not connected'}
                                      </span>
                                    </span>
                                    {redditDirectConnected ? (
                                      <input
                                        type="checkbox"
                                        disabled={!redditAutomaticDeliveryReady}
                                        checked={redditAutomaticDeliveryReady && profile.autoSendPlatforms.includes('reddit')}
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
                                  <label className={`flex items-center justify-between rounded-xl border px-3.5 py-3 text-[12.5px] ${connections.x && deliveryCapabilities.xDirectPosting ? 'border-gray-200 bg-white' : 'border-gray-100 bg-gray-50 text-gray-400'}`}>
                                    <span className="flex items-center gap-2.5 font-medium text-gray-700"><XIcon className="h-4 w-4 text-[#0F1419]" />X <span className="font-normal text-gray-400">{connections.x && deliveryCapabilities.xDirectPosting ? 'Direct' : 'Connect above'}</span></span>
                                    <input type="checkbox" disabled={!connections.x || !deliveryCapabilities.xDirectPosting} checked={profile.autoSendPlatforms.includes('x')} onChange={event => setProfile(current => ({ ...current, autoSendPlatforms: event.target.checked ? [...new Set([...current.autoSendPlatforms, 'x'])] : current.autoSendPlatforms.filter(platform => platform !== 'x') }))} className="h-4 w-4 accent-gray-900" />
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

                    <SectionCard title="Reply attribution" description="Measure visits and conversions from replies.">
                      {!planEntitlements.replyAttribution ? (
                        <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900">
                          Reply attribution is available on Professional and Growth. Existing links remain measurable, while new Starter replies are published without tracking links.
                          <a href="/pricing" className="ml-1 font-semibold text-amber-950 underline">Compare plans</a>
                        </div>
                      ) : <>
                      <div className="flex items-start justify-between gap-6">
                        <div className="flex-1">
                          <p className="text-[14px] font-semibold text-gray-900">Track visits from relevant replies</p>
                          <p className="mt-1 max-w-[580px] text-[13px] leading-5 text-gray-500">
                            When a product link is appropriate, BuyerWatch adds a unique attribution link so visits and conversions appear in Analytics.
                          </p>
                        </div>
                        <Toggle
                          label="Toggle referral tracking"
                          checked={profile.referralTrackingEnabled}
                          onChange={v => setProfile(p => ({ ...p, referralTrackingEnabled: v }))}
                        />
                      </div>
                      <div className="mt-4 rounded-xl border border-gray-100 bg-[#F8F9FA] p-4">
                        <div className="flex items-start gap-2.5">
                          <BarChart2 className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-gray-800">Attribution link</p>
                            <p className="mt-1 text-[12.5px] leading-5 text-gray-600">
                              Visitors are redirected to your website instantly while BuyerWatch preserves the source of the visit. Links are added only when relevant and with a clear affiliation disclosure.
                            </p>
                            <div className="mt-3 overflow-hidden rounded-lg border border-black/5 bg-white px-3 py-2.5">
                              <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-gray-400">Destination preview</p>
                              <p className="mt-1 break-all font-mono text-[11.5px] leading-5 text-gray-700">
                                {profile.businessUrl || 'https://yoursite.com'}?ref=buyerwatch&amp;sid=abc123
                              </p>
                            </div>
                          </div>
                        </div>
                      </div>
                      </>}
                    </SectionCard>

                    <div className="flex justify-end pt-2">
                      <SaveButton
                        onClick={handleSave}
                        saving={saving}
                        saved={saveSuccess}
                      />
                    </div>
                  </>
                )}

                {/* ── NOTIFICATIONS ────────────────────────────────── */}
                {activeSection === 'notifications' && (
                  <>
                    <div className="space-y-5">
                      {/* 1. Notification Preferences & Signal Focus */}
                      <SectionCard
                        title="Notification preferences"
                        description="Choose which updates reach your inbox and tune your minimum intent sensitivity."
                      >
                        <div className="space-y-6">
                          {/* Alert Sensitivity Slider */}
                          <div className="rounded-xl border border-[#EAECF0] bg-[#F9FAFB]/70 p-4 sm:p-5">
                            <SettingsSlider
                              label="Minimum dashboard intent score"
                              description="Controls dashboard filters and high-intent alerts without rescoring opportunities."
                              value={highIntentThreshold}
                              min={HIGH_INTENT_THRESHOLD_MIN}
                              max={HIGH_INTENT_THRESHOLD_MAX}
                              step={1}
                              unit="%"
                              minLabel={`${HIGH_INTENT_THRESHOLD_MIN}% — Broader reach`}
                              maxLabel={`${HIGH_INTENT_THRESHOLD_MAX}% — Strongest buyer intent only`}
                              badgeText={highIntentThreshold >= 85 ? 'High conviction' : highIntentThreshold >= 75 ? 'Balanced' : 'Broad reach'}
                              onChange={val => setHighIntentThreshold(normalizeHighIntentThreshold(val))}
                            />
                          </div>

                          {/* Delivery Channels (Inbox) */}
                          <div className="divide-y divide-[#EAECF0] border-t border-[#EAECF0] pt-2">
                            {[
                              { key: 'emailDigest', icon: Mail, label: 'Daily digest', description: 'A morning summary of new buyer opportunities and platform activity.' },
                              { key: 'highIntentAlerts', icon: Activity, label: 'High-intent alerts', description: `Instant notification when a thread meets your ${highIntentThreshold}+ dashboard conviction score.` },
                              { key: 'weeklyReport', icon: BarChart2, label: 'Weekly report', description: 'Posting statistics, top-performing threads, and conversion trends each week.' },
                            ].map(item => (
                              <div key={item.key} className="flex items-center justify-between gap-6 py-4 first:pt-3 last:pb-1">
                                <div className="flex items-start gap-3.5">
                                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-[#EAECF0] bg-[#F9FAFB] text-[#475467]">
                                    <item.icon className="h-4 w-4" strokeWidth={1.75} />
                                  </div>
                                  <div>
                                    <p className="text-[13.5px] font-semibold text-[#101828]">{item.label}</p>
                                    <p className="mt-0.5 text-[12.5px] text-[#667085]">{item.description}</p>
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
                        </div>
                      </SectionCard>

                      {/* 2. Slack Integration */}
                      <SectionCard
                        title="Slack channel delivery"
                        description="Stream high-intent buyer opportunities directly into your team's Slack channel."
                      >
                        {!planEntitlements.slackNotifications ? (
                          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900">
                            Slack notifications are available on Professional and Growth. Your current plan can still use email alerts.
                            <a href="/pricing" className="ml-1 font-semibold text-amber-950 underline">Compare plans</a>
                          </div>
                        ) : (
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
                              <div className="rounded-xl border border-[#EAECF0] bg-[#F9FAFB]/70 p-4 sm:p-5">
                                <SettingsSlider
                                  label="Minimum intent score to notify Slack"
                                  description="Opportunities below this score will not trigger Slack channel alerts."
                                  value={slack.threshold}
                                  min={60}
                                  max={95}
                                  step={1}
                                  unit="%"
                                  minLabel="60% — Catch more"
                                  maxLabel="95% — High conviction only"
                                  badgeText={slack.threshold >= 85 ? 'High conviction' : 'Standard'}
                                  onChange={val => setSlack(s => ({ ...s, threshold: val }))}
                                />
                              </div>
                            )}

                            {/* Actions */}
                            {(slackConfigured || slack.webhookUrl) && (
                              <div className="flex flex-wrap items-center gap-2 pt-1">
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
                                  className="flex items-center gap-2 rounded-xl bg-[#101828] px-4 py-2 text-[12.5px] font-semibold text-white transition-colors hover:bg-black disabled:cursor-wait disabled:opacity-50"
                                >
                                  <Send className="h-3.5 w-3.5" strokeWidth={2} />
                                  {slackTesting ? 'Sending...' : 'Send test message'}
                                </button>
                                {slackConfigured && (
                                  <button
                                    type="button"
                                    onClick={() => void handleDisconnectSlack()}
                                    disabled={slackTesting || slackDisconnecting}
                                    className="rounded-xl border border-red-200 bg-red-50 px-4 py-2 text-[12.5px] font-semibold text-red-700 transition-colors hover:bg-red-100 disabled:cursor-wait disabled:opacity-50"
                                  >
                                    {slackDisconnecting ? 'Disconnecting...' : 'Disconnect Slack'}
                                  </button>
                                )}
                              </div>
                            )}
                          </div>
                        )}
                      </SectionCard>

                      {/* 3. Conversion Events */}
                      <SectionCard
                        title="Conversion tracking & attribution"
                        description="Attribute revenue back to the replies and channels that created it."
                      >
                        {!planEntitlements.replyAttribution ? (
                          <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-[13px] leading-5 text-amber-900">
                            Conversion attribution is available on Professional and Growth, together with tracked reply links.
                            <a href="/pricing" className="ml-1 font-semibold text-amber-950 underline">Compare plans</a>
                          </div>
                        ) : (
                          <div className="space-y-4">
                            <Field
                              label="Webhook Receiver Endpoint"
                              hint="POST JSON payloads to this endpoint when a user who clicked a BuyerWatch link converts."
                            >
                              <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-[#EAECF0] bg-[#F9FAFB] p-3.5 font-mono text-[12px] text-[#101828] sm:flex-row sm:items-center">
                                <span className="min-w-0 break-all">{conversionWebhookUrl}</span>
                                <button
                                  type="button"
                                  onClick={() => void copySettingValue(conversionWebhookUrl, 'Webhook URL')}
                                  className="min-h-9 shrink-0 rounded-lg border border-[#D0D5DD] bg-white px-3 text-[12px] font-semibold text-[#344054] transition-colors hover:bg-[#F8FAFC]"
                                >
                                  Copy
                                </button>
                              </div>
                            </Field>

                            <Field
                              label="Authorization Secret"
                              hint="Send this value as a Bearer token. Keep it server-side and rotate it if it is ever exposed."
                            >
                              <div className="flex flex-col items-start justify-between gap-2 rounded-xl border border-[#EAECF0] bg-[#F9FAFB] p-3.5 font-mono text-[12px] text-[#101828] sm:flex-row sm:items-center">
                                <span className="min-w-0 break-all">
                                  {webhookSecret ? `${'•'.repeat(16)}${webhookSecret.slice(-8)}` : 'Secret unavailable until migrations are applied'}
                                </span>
                                {webhookSecret && (
                                  <button
                                    type="button"
                                    onClick={() => void copySettingValue(webhookSecret, 'Webhook secret')}
                                    className="min-h-9 shrink-0 rounded-lg border border-[#D0D5DD] bg-white px-3 text-[12px] font-semibold text-[#344054] transition-colors hover:bg-[#F8FAFC]"
                                  >
                                    Copy
                                  </button>
                                )}
                              </div>
                            </Field>

                            <div className="rounded-xl border border-[#EAECF0] bg-[#F9FAFB] p-4 text-[12px] text-[#344054] space-y-2">
                              <p className="font-semibold text-[#101828] flex items-center gap-1.5 text-[12.5px]">
                                <Info className="w-4 h-4 text-blue-600" />
                                Sample POST Payload
                              </p>
                              <pre className="overflow-x-auto whitespace-pre-wrap break-all rounded-lg border border-[#E4E7EC] bg-white p-3 font-mono text-[11.5px] leading-relaxed text-[#101828]">
{`{
  "shortcode": "aB1cD2eF",
  "revenue_usd": 99.00
}

Authorization: Bearer YOUR_WEBHOOK_SECRET`}
                              </pre>
                            </div>
                          </div>
                        )}
                      </SectionCard>
                    </div>

                    <div className="flex justify-end pt-2">
                      <SaveButton
                        onClick={handleSave}
                        saving={saving}
                        saved={saveSuccess}
                      />
                    </div>
                  </>
                )}

                {/* ── PLAN & BILLING ───────────────────────────────── */}
                {activeSection === 'plan' && (
                  <>
                    <div className="grid gap-4 xl:grid-cols-[minmax(0,1.05fr)_minmax(330px,0.95fr)]">
                    <section className="h-full overflow-hidden rounded-[22px] border border-[#E4E7EC] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.025),0_12px_30px_rgba(16,24,40,0.035)] sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Current plan</p>
                          <div className="mt-2 flex items-center gap-2.5">
                            <span className="font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-[-0.035em] text-[#101828]">
                              {planState.plan === 'free'
                                ? 'Starter'
                                : planState.plan === 'pro' ? 'Professional' : planState.plan[0].toUpperCase() + planState.plan.slice(1)}
                            </span>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${planState.billingState === 'active' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : planState.billingState === 'attention_required' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[#E4E7EC] bg-[#F8FAFC] text-[#667085]'}`}>
                              {planState.billingState === 'active'
                                ? `Active${planState.currentCadence ? ` · ${planState.currentCadence === 'annual' ? 'Annual' : 'Monthly'}` : ''}`
                                : planState.billingState === 'attention_required' ? 'Action required' : 'Trial not started'}
                            </span>
                          </div>
                          <p className="mt-2 max-w-[520px] text-[12.5px] leading-5 text-[#667085]">
                            {planState.plan === 'free'
                              ? planState.billingState === 'attention_required'
                                ? 'Your subscription needs attention before monitoring can resume.'
                                : 'Start a card-required 7-day trial to activate monitoring, intent scoring, and one guarded automatic reply.'
                              : `${planState.keywordsMax} keywords, ${planState.threadsMax.toLocaleString()} signals, and ${planState.draftsMax.toLocaleString()} AI drafts per month.`}
                          </p>
                        </div>
                      </div>

                      {planState.plan !== 'free' && <div className="my-6 grid grid-cols-1 gap-2.5 border-y border-[#EAECF0] py-5 sm:grid-cols-2">
                        {[
                          `${planState.threadsMax} monitored threads / month`,
                          'Reddit & Bluesky monitoring',
                          'AI draft reply generation',
                          'Manual review & approval workflow',
                        ].map(f => (
                          <div key={f} className="flex items-center gap-2.5 text-[12.5px] text-[#475467]">
                            <div className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-emerald-50">
                              <Check className="h-2.5 w-2.5 text-emerald-600" strokeWidth={3} />
                            </div>
                            {f}
                          </div>
                        ))}
                      </div>}

                      {planState.plan === 'free' && planState.billingState === 'trial_not_started' && (
                        <div className="mt-6 flex flex-col gap-4 border-t border-[#EAECF0] pt-5 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <p className="text-[12.5px] font-semibold text-[#344054]">7-day Starter trial</p>
                            <p className="mt-0.5 text-[11.5px] leading-5 text-[#98A2B3]">Card details are required before monitoring begins.</p>
                          </div>
                          <button type="button" onClick={() => void handleUpgrade('starter')} disabled={upgrading} className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-xl bg-[#101828] px-4 text-[12px] font-semibold text-white shadow-[0_2px_5px_rgba(16,24,40,0.16)] transition-colors hover:bg-black disabled:opacity-60">
                            {upgrading ? 'Opening checkout…' : 'Start 7-day trial'}
                          </button>
                        </div>
                      )}
                      {planState.billingState === 'attention_required' && planState.hasBillingPortal && (
                        <div className="mt-6 border-t border-[#EAECF0] pt-5">
                          <button onClick={handleManageBilling} disabled={openingPortal} className="rounded-xl bg-[#101828] px-4 py-2.5 text-[12px] font-semibold text-white disabled:opacity-50">
                            {openingPortal ? 'Opening…' : 'Resolve billing'}
                          </button>
                        </div>
                      )}
                      {planState.plan !== 'free' && (
                        <div className="flex flex-wrap items-center gap-2">
                          {(['starter', 'pro', 'growth'] as const).filter(plan => plan !== planState.plan).map(plan => (
                            <button key={plan} onClick={() => handleUpgrade(plan, planState.currentCadence ?? 'monthly')} disabled={upgrading} className="rounded-lg border border-[#D0D5DD] bg-white px-4 py-2 text-[12px] font-semibold text-[#344054] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50">
                              Switch to {plan === 'pro' ? 'Professional' : plan[0].toUpperCase() + plan.slice(1)}
                            </button>
                          ))}
                          {planState.currentCadence && (
                            <button
                              onClick={() => handleUpgrade(planState.plan as 'starter' | 'pro' | 'growth', planState.currentCadence === 'annual' ? 'monthly' : 'annual')}
                              disabled={upgrading}
                              className="rounded-lg border border-[#D0D5DD] bg-white px-4 py-2 text-[12px] font-semibold text-[#344054] transition-colors hover:bg-[#F8FAFC] disabled:opacity-50"
                            >
                              Switch to {planState.currentCadence === 'annual' ? 'monthly' : 'annual'} billing
                            </button>
                          )}
                          {planState.hasBillingPortal && <button onClick={handleManageBilling} disabled={openingPortal} className="rounded-lg bg-[#101828] px-4 py-2 text-[12px] font-semibold text-white disabled:opacity-50">
                            {openingPortal ? 'Opening…' : 'Manage billing'}
                          </button>}
                        </div>
                      )}
                    </section>

                    <section className="h-full overflow-hidden rounded-[22px] border border-[#E4E7EC] bg-white p-5 shadow-[0_1px_2px_rgba(16,24,40,0.025),0_12px_30px_rgba(16,24,40,0.035)] sm:p-6">
                      <div className="flex items-start justify-between gap-4">
                        <div>
                          <p className="text-[10.5px] font-semibold uppercase tracking-[0.14em] text-[#667085]">Monthly usage</p>
                          <div className="mt-2 flex items-center gap-2.5">
                            <span className="font-[family-name:var(--font-display)] text-[28px] font-semibold tracking-[-0.035em] text-[#101828]">
                              Capacity
                            </span>
                            <span className="rounded-full border border-[#E4E7EC] bg-[#F8FAFC] px-2.5 py-1 text-[10px] font-semibold text-[#667085]">
                              Current cycle
                            </span>
                          </div>
                          <p className="mt-2 text-[12.5px] leading-5 text-[#667085]">
                            {planState.billingState === 'active'
                              ? 'Included allowance for the current billing cycle.'
                              : 'Usage tracking activates once your subscription begins.'}
                          </p>
                        </div>
                      </div>

                      {planState.billingState !== 'active' ? (
                        <div className="my-6 border-t border-[#EAECF0] pt-5">
                          <div className="flex items-center justify-between gap-4">
                            <p className="text-[12.5px] font-semibold text-[#344054]">Monitoring status</p>
                            <span className={`rounded-full border px-2.5 py-1 text-[10px] font-semibold ${planState.billingState === 'attention_required' ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-[#E4E7EC] bg-[#F8FAFC] text-[#667085]'}`}>
                              {planState.billingState === 'attention_required' ? 'Paused' : 'Inactive'}
                            </span>
                          </div>
                          <p className="mt-4 max-w-md text-[12px] leading-5 text-[#667085]">
                            {planState.billingState === 'attention_required'
                              ? 'Resolve billing to resume monitoring and monthly usage tracking.'
                              : 'Your allowance remains untouched. Usage appears here once the trial begins.'}
                          </p>
                        </div>
                      ) : (
                        <>
                          {(usageCapacityNotice || usageCapacityAtLimit) && (
                            <div className="my-5 flex flex-col gap-3 border-b border-[#EAECF0] pb-5 sm:flex-row sm:items-center sm:justify-between">
                              <div>
                                <p className="text-[13px] font-semibold text-[#101828]">
                                  {usageCapacityAtLimit ? 'Monthly capacity reached' : 'Capacity running low'}
                                </p>
                                <p className="mt-0.5 text-[12px] leading-5 text-[#667085]">
                                  {usageCapacityAtLimit
                                    ? 'Your included allowance is fully used. Add capacity to continue this month.'
                                    : `${usageCapacityNotice?.remaining} ${usageCapacityNotice?.resource === 'signals' ? 'signal' : 'AI draft'}${usageCapacityNotice?.remaining === 1 ? '' : 's'} left this month.`}
                                </p>
                              </div>
                              <CreditPackPicker
                                initialType={capacityPickerInitialType}
                                triggerLabel="Add capacity"
                                className="inline-flex min-h-9 shrink-0 items-center justify-center rounded-lg bg-[#101828] px-3.5 text-[12px] font-semibold text-white transition-colors hover:bg-black"
                              />
                            </div>
                          )}

                          <div className="my-6 space-y-4 border-y border-[#EAECF0] py-5">
                            {usageItems.filter(item => item.max > 0).map(item => {
                              const atLimit = item.used >= item.max
                              const displayedUsed = Math.min(item.used, item.max)
                              const percentage = Math.min((item.used / item.max) * 100, 100)

                              return (
                                <div key={item.label} className="space-y-1.5">
                                  <div className="flex items-center justify-between text-[13px]">
                                    <span className="font-medium text-[#344054]">{item.label}</span>
                                    <div className="flex items-center gap-1.5">
                                      <span className="font-mono text-[12.5px] font-bold tabular-nums text-[#101828]">
                                        {displayedUsed.toLocaleString()}
                                      </span>
                                      <span className="text-[12px] text-[#98A2B3]">
                                        / {item.max.toLocaleString()}
                                      </span>
                                    </div>
                                  </div>
                                  <div className="h-1.5 w-full overflow-hidden rounded-full bg-[#F2F4F7]">
                                    <div
                                      className={`h-full rounded-full transition-all duration-300 ${
                                        atLimit
                                          ? 'bg-red-600'
                                          : percentage >= 80
                                            ? 'bg-amber-500'
                                            : 'bg-[#101828]'
                                      }`}
                                      style={{ width: `${Math.max(percentage, percentage > 0 ? 2 : 0)}%` }}
                                    />
                                  </div>
                                </div>
                              )
                            })}
                          </div>

                          {usageItems.every(item => item.max <= 0) && (
                            <p className="text-[12.5px] leading-5 text-[#667085]">Monthly capacity becomes available when your trial or subscription starts.</p>
                          )}
                          {usageItems.some(item => item.max <= 0) && usageItems.some(item => item.max > 0) && (
                            <p className="mt-2 text-[11.5px] text-[#98A2B3]">
                              AI drafts and replies are not included in this plan.
                            </p>
                          )}
                        </>
                      )}
                    </section>
                    </div>
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
