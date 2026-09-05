'use client'

import { type ReactNode, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  PresentationChartLineIcon,
  PuzzlePieceIcon,
  CubeIcon,
  FolderIcon,
  Cog6ToothIcon,
  QuestionMarkCircleIcon,
  CreditCardIcon,
} from '@heroicons/react/24/solid'
import {
  AlertTriangle,
  Bell,
  LogOut,
  Menu,
  Search,
  X,
} from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { normalizePlan, type PlanTier } from '@/lib/plan-limits'
import {
  getCurrentUsageMonth,
  getPlanLimitsWithAddons,
  sumMonthlyAddonCredits,
} from '@/lib/billing-addons'
import { BrandLogo } from '@/components/BrandLogo'
import { DashboardSessionProvider } from '@/components/DashboardContext'
import { clearSupabaseReadCache } from '@/utils/supabase/read-cache'
import { signOutAction } from '@/app/actions/auth'
import { ConversationSearchProvider, useConversationSearch } from '@/lib/conversation-search'
import { ACTIONABLE_INTENT_THRESHOLD } from '@/lib/intent'

export type DashboardBootstrap = {
  autoSend: boolean
  plan: PlanTier
  credits: { used: number; limit: number }
  user?: {
    name?: string
    email?: string
    avatarUrl?: string
  }
}

function CustomDashboardIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="235 135 542 538"
      className={className}
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* Top-left: rounded square */}
      <rect x="300" y="200" width="190" height="190" rx="38" ry="38" fill="currentColor" />

      {/* Top-right: circle */}
      <circle cx="617" cy="295" r="95" fill="currentColor" />

      {/* Bottom-left: rounded square */}
      <rect x="300" y="418" width="190" height="190" rx="38" ry="38" fill="currentColor" />

      {/* Bottom-right: rounded square */}
      <rect x="522" y="418" width="190" height="190" rx="38" ry="38" fill="currentColor" />
    </svg>
  )
}

/** Specific icons for specified items */
const MAIN_NAV_ITEMS = [
  {
    name: 'Dashboard',
    href: '/dashboard',
    icon: CustomDashboardIcon,
  },
  {
    name: 'Opportunities',
    href: '/opportunities',
    icon: CubeIcon,
  },
  {
    name: 'Analytics',
    href: '/analytics',
    icon: PresentationChartLineIcon,
  },
  {
    name: 'Keywords',
    href: '/keywords',
    icon: PuzzlePieceIcon,
  },
  {
    name: 'Posted',
    href: '/posted',
    icon: FolderIcon,
  },
]

const MOBILE_NAV_ITEMS = MAIN_NAV_ITEMS.filter((item) =>
  ['Opportunities', 'Analytics', 'Keywords'].includes(item.name)
)

type DashboardLayoutProps = {
  children: ReactNode
  userId: string
  initialData: DashboardBootstrap
}

type ServiceIncident = {
  id: string
  severity: 'info' | 'warning' | 'critical'
  status: 'open' | 'resolved'
  title: string
  message: string
  actionPath: string | null
  startedAt: string
}

export default function DashboardLayout(props: DashboardLayoutProps) {
  return (
    <ConversationSearchProvider>
      <DashboardShell {...props} />
    </ConversationSearchProvider>
  )
}

function DashboardShell({
  children,
  userId,
  initialData,
}: DashboardLayoutProps) {
  const pathname = usePathname()
  const router = useRouter()
  const [supabase] = useState(createClient)

  const [autoSend, setAutoSend] = useState<boolean | null>(initialData.autoSend)
  const [togglingAutoSend, setTogglingAutoSend] = useState(false)
  const [plan, setPlan] = useState<PlanTier>(initialData.plan)
  const [credits, setCredits] = useState<{ used: number; limit: number } | null>(initialData.credits)
  const [opportunityCount, setOpportunityCount] = useState<number | null>(null)
  const [keywordCount, setKeywordCount] = useState<number | null>(null)
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false)
  const [redditConnectionAttention, setRedditConnectionAttention] = useState<
    'reauth_required' | 'error' | null
  >(null)
  const [serviceIncidents, setServiceIncidents] = useState<ServiceIncident[]>([])
  const [notificationsOpen, setNotificationsOpen] = useState(false)
  const { conversationSearch, setConversationSearch } = useConversationSearch()
  const searchInputRef = useRef<HTMLInputElement>(null)
  const showConversationSearch = pathname === '/dashboard'

  useEffect(() => {
    const focusSearch = () => searchInputRef.current?.focus()
    window.addEventListener('buyerwatch:focus-conversation-search', focusSearch)
    return () => {
      window.removeEventListener('buyerwatch:focus-conversation-search', focusSearch)
    }
  }, [])

  useEffect(() => {
    if (pathname !== '/dashboard') setConversationSearch('')
  }, [pathname])

  useEffect(() => {
    async function loadSidebarData() {
      try {
        const usageMonth = getCurrentUsageMonth()
        const [profileResult, opportunityCountResult, keywordCountResult, addonCreditsResult] = await Promise.all([
          supabase
            .from('profiles')
            .select('auto_send_enabled, plan, draft_count, draft_month')
            .eq('id', userId)
            .single(),
          supabase
            .from('monitored_threads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .in('status', ['pending', 'drafted', 'needs_manual_reply'])
            .not('intent_score', 'is', null)
            .gte('intent_score', ACTIONABLE_INTENT_THRESHOLD),
          supabase
            .from('keywords')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('is_active', true),
          supabase
            .from('billing_addon_credits')
            .select('addon_type, credits')
            .eq('user_id', userId)
            .eq('usage_month', usageMonth),
        ])

        const sidebarError = [
          profileResult,
          opportunityCountResult,
          keywordCountResult,
          addonCreditsResult,
        ].find(result => result.error)?.error
        if (sidebarError) {
          console.error('[dashboard-layout] Unable to refresh sidebar metrics', sidebarError)
        }

        const profile = profileResult.error ? null : profileResult.data
        if (profile && !addonCreditsResult.error) {
          const normalizedPlan = normalizePlan(profile.plan)
          const addonCredits = sumMonthlyAddonCredits(addonCreditsResult.data)
          const limit = getPlanLimitsWithAddons(normalizedPlan, addonCredits).aiDraftsPerMonth
          const currentMonth = usageMonth
          const used = profile.draft_month === currentMonth
            ? Math.max(profile.draft_count ?? 0, 0)
            : 0
          setAutoSend(profile.auto_send_enabled ?? false)
          setPlan(normalizedPlan)
          setCredits({ used, limit })
        }

        if (!opportunityCountResult.error) setOpportunityCount(opportunityCountResult.count ?? 0)
        if (!keywordCountResult.error) setKeywordCount(keywordCountResult.count ?? 0)
      } catch (error) {
        console.error('[dashboard-layout] Unable to refresh sidebar metrics', error)
      }
    }

    void loadSidebarData()
    const refreshCredits = () => void loadSidebarData()
    const refreshInterval = window.setInterval(loadSidebarData, 60_000)
    window.addEventListener('buyerwatch:credits-changed', refreshCredits)
    return () => {
      window.clearInterval(refreshInterval)
      window.removeEventListener('buyerwatch:credits-changed', refreshCredits)
    }
  }, [supabase, userId])

  useEffect(() => {
    async function loadConnectionHealth() {
      try {
        const [response, incidentsResponse] = await Promise.all([
          fetch('/api/settings/connections', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          }),
          fetch('/api/incidents', {
            cache: 'no-store',
            headers: { Accept: 'application/json' },
          }),
        ])
        if (response.ok) {
          const payload = await response.json() as {
          connections?: Array<{ platform?: string; status?: string }>
          }
          const reddit = payload.connections?.find(connection => connection.platform === 'reddit')
          setRedditConnectionAttention(
            reddit?.status === 'reauth_required' || reddit?.status === 'error'
              ? reddit.status
              : null,
          )
        }
        if (incidentsResponse.ok) {
          const payload = await incidentsResponse.json() as { incidents?: ServiceIncident[] }
          setServiceIncidents(payload.incidents ?? [])
        }
      } catch {
        // A transient status request must not disrupt dashboard navigation.
      }
    }

    void loadConnectionHealth()
    const refresh = () => void loadConnectionHealth()
    const interval = window.setInterval(loadConnectionHealth, 60_000)
    window.addEventListener('buyerwatch:connections-changed', refresh)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('buyerwatch:connections-changed', refresh)
    }
  }, [])

  useEffect(() => {
    setMobileMenuOpen(false)
  }, [pathname])

  function prepareRoute(href: string) {
    router.prefetch(href)
  }

  async function handleToggleAutoSend() {
    if (autoSend === null || togglingAutoSend) return
    const next = !autoSend

    if (next) {
      router.push('/settings?section=connections')
      toast.info('Review the earned automation controls before activating it.')
      return
    }

    setTogglingAutoSend(true)
    setAutoSend(next)

    try {
      const res = await fetch('/api/settings/autosend', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ auto_send_enabled: next }),
      })
      if (!res.ok) throw new Error('autosend_update_failed')
      clearSupabaseReadCache()
      toast.success(next ? 'Auto-send enabled' : 'Auto-send paused')
      window.dispatchEvent(new CustomEvent('buyerwatch:auto-send-changed', { detail: next }))
    } catch (error) {
      console.error('[dashboard-layout] Unable to update auto-send', error)
      setAutoSend(!next)
      toast.error('Failed to update auto-send setting')
    } finally {
      setTogglingAutoSend(false)
    }
  }

  const creditsRemaining = credits ? Math.max(credits.limit - credits.used, 0) : null
  const creditsPercent = credits && credits.limit > 0
    ? Math.max(0, Math.min(100, ((credits.limit - credits.used) / credits.limit) * 100))
    : 0
  const openIncidents = serviceIncidents.filter(incident => incident.status === 'open')
  const primaryIncident = [...openIncidents].sort((left, right) => {
    const priority = { critical: 0, warning: 1, info: 2 }
    return priority[left.severity] - priority[right.severity]
      || right.startedAt.localeCompare(left.startedAt)
  })[0]

  return (
    <DashboardSessionProvider userId={userId}>
      <div className="h-dvh w-full overflow-hidden bg-[#F7F7F7] p-0 lg:pt-2.5 lg:pl-2.5 lg:pb-0 lg:pr-0 flex gap-0 lg:gap-2.5 text-gray-900 font-sans selection:bg-accent/20 selection:text-accent">

        {/* Desktop Sidebar sitting directly on background */}
        <aside className="hidden w-[205px] shrink-0 flex-col bg-[#F7F7F7] px-2 pb-2.5 h-full lg:flex select-none">
          <div className="flex flex-col h-full">
            {/* Logo Header */}
            <div className="mb-2 flex h-9 shrink-0 items-center px-3.5">
              <Link
                href="/dashboard"
                className="flex items-center transition-opacity hover:opacity-80"
              >
                <BrandLogo size="sm" />
              </Link>
            </div>

            {/* Main Navigation Items */}
            <nav className="space-y-1" aria-label="Primary navigation">
              {MAIN_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || (item.href !== '/dashboard' && pathname.startsWith(item.href + '/'))
                const IconComp = item.icon as any
                // Get count badge data if available
                let badgeCount: number | undefined = undefined
                if (item.name === 'Opportunities' && opportunityCount !== null) {
                  badgeCount = opportunityCount
                } else if (item.name === 'Keywords' && keywordCount !== null) {
                  badgeCount = keywordCount
                }

                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch
                    onMouseEnter={() => prepareRoute(item.href)}
                    onFocus={() => prepareRoute(item.href)}
                    onTouchStart={() => prepareRoute(item.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={
                      isActive
                        ? 'group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm'
                        : 'group flex items-center gap-3 px-3 py-2 rounded-lg text-[#3A3A3A] font-normal text-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors'
                    }
                  >
                    <IconComp className={`h-5 w-5 shrink-0 transition-colors ${isActive ? 'text-zinc-900' : 'text-[#9E9E9E] group-hover:text-[#3A3A3A]'}`} />
                    <span>{item.name}</span>

                    {/* Metadata Badge */}
                    {badgeCount !== undefined && (
                      <span className="ml-auto text-xs text-zinc-400">{badgeCount}</span>
                    )}

                  </Link>
                )
              })}
            </nav>

            {/* Bottom Group (Settings + Plan & usage + Help Center + Profile Card) */}
            <div className="mt-auto flex flex-col gap-3 pt-4">
              <div className="space-y-1">
                {/* Settings Nav Item */}
                <Link
                  href="/settings"
                  prefetch
                  onMouseEnter={() => prepareRoute('/settings')}
                  aria-current={pathname.startsWith('/settings') && !pathname.includes('section=plan') ? 'page' : undefined}
                  className={
                    pathname.startsWith('/settings') && !pathname.includes('section=plan')
                      ? 'group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm'
                      : 'group flex items-center gap-3 px-3 py-2 rounded-lg text-[#3A3A3A] font-normal text-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors'
                  }
                >
                  <Cog6ToothIcon className={`h-5 w-5 shrink-0 transition-colors ${pathname.startsWith('/settings') && !pathname.includes('section=plan') ? 'text-zinc-900' : 'text-[#9E9E9E] group-hover:text-[#3A3A3A]'}`} />
                  <span>Settings</span>
                </Link>

                {/* Plan & usage Nav Item */}
                <Link
                  href="/settings?section=plan"
                  prefetch
                  onMouseEnter={() => prepareRoute('/settings?section=plan')}
                  aria-current={pathname.includes('section=plan') ? 'page' : undefined}
                  className={
                    pathname.includes('section=plan')
                      ? 'group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm'
                      : 'group flex items-center gap-3 px-3 py-2 rounded-lg text-[#3A3A3A] font-normal text-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors'
                  }
                >
                  <CreditCardIcon className={`h-5 w-5 shrink-0 transition-colors ${pathname.includes('section=plan') ? 'text-zinc-900' : 'text-[#9E9E9E] group-hover:text-[#3A3A3A]'}`} />
                  <span>Plan &amp; usage</span>
                </Link>

                {/* Help center */}
                <Link
                  href="/contact"
                  aria-current={pathname.startsWith('/contact') ? 'page' : undefined}
                  className={
                    pathname.startsWith('/contact')
                      ? 'group flex items-center gap-3 px-3 py-2 rounded-lg bg-zinc-100 text-zinc-900 font-medium text-sm'
                      : 'group flex items-center gap-3 px-3 py-2 rounded-lg text-[#3A3A3A] font-normal text-sm hover:bg-zinc-50 hover:text-zinc-900 transition-colors'
                  }
                >
                  <QuestionMarkCircleIcon className={`h-5 w-5 shrink-0 transition-colors ${pathname.startsWith('/contact') ? 'text-zinc-900' : 'text-[#9E9E9E] group-hover:text-[#3A3A3A]'}`} />
                  <span>Help center</span>
                </Link>
              </div>

              {/* Restyled Profile Card */}
              <div className="rounded-xl border border-zinc-200 p-3">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <img
                      src={initialData.user?.avatarUrl || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80'}
                      alt={initialData.user?.name || 'User'}
                      className="h-8 w-8 shrink-0 rounded-full object-cover border border-zinc-200"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-xs font-medium text-zinc-900 leading-tight">
                        {initialData.user?.name || 'User'}
                      </p>
                      <p className="truncate text-[11px] text-zinc-500 capitalize">
                        {plan} Plan
                      </p>
                    </div>
                  </div>
                  <form action={signOutAction} className="shrink-0">
                    <button
                      type="submit"
                      className="flex h-7 w-7 items-center justify-center rounded-lg text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700 cursor-pointer"
                      title="Sign out"
                      aria-label="Sign out"
                    >
                      <LogOut className="h-4 w-4" />
                    </button>
                  </form>
                </div>
              </div>
            </div>
          </div>
        </aside>

        {/* Main Content App Panel */}
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden bg-white rounded-none lg:rounded-tl-2xl border-0 lg:border-t lg:border-l border-[#E2E2DE] shadow-[0_1px_3px_rgba(0,0,0,0.03)]">
          {/* Header Bar */}
          <header className="flex h-14 shrink-0 items-center justify-between bg-white px-4 lg:px-6">
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-900 lg:hidden"
                aria-label="Open sidebar"
              >
                <Menu className="h-5 w-5" />
              </button>
              {showConversationSearch && (
              <div className="relative hidden w-64 sm:block">
                <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={conversationSearch}
                  onChange={(e) => setConversationSearch(e.target.value)}
                  placeholder="Search conversations…"
                  className="h-9 w-full rounded-xl bg-[#F4F4F2] pl-9 pr-3 text-xs text-gray-900 placeholder-gray-400 transition-colors focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#0A84FF]/25"
                />
              </div>
              )}
            </div>

            <div className="flex items-center gap-2">
              {autoSend !== null && (
                <button
                  type="button"
                  onClick={handleToggleAutoSend}
                  disabled={togglingAutoSend}
                  title={autoSend ? 'Auto-send is active — click to pause' : 'Auto-send is paused — click to resume'}
                  className="flex h-11 cursor-pointer items-center gap-2 rounded-[9px] border border-[#E2E2DF] bg-[#FAFAF9] px-2.5 transition-colors hover:bg-[#F5F5F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/25 sm:h-8"
                  aria-pressed={autoSend}
                >
                  <span className="hidden select-none text-[11px] font-medium text-[#555552] sm:inline">
                    Auto-send
                  </span>
                  <div className={`relative h-4 w-7 rounded-full transition-colors duration-200 ${autoSend ? 'bg-emerald-500' : 'bg-[#D1D1CD]'}`}>
                    <div className={`absolute left-[2px] top-[2px] h-3 w-3 rounded-full bg-white shadow-sm transition-transform duration-200 ${autoSend ? 'translate-x-3' : 'translate-x-0'}`} />
                  </div>
                </button>
              )}

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setNotificationsOpen(open => !open)}
                  className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-[9px] border border-[#E2E2DF] bg-[#FAFAF9] text-[#666662] transition-colors hover:bg-[#F5F5F3] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/25 sm:h-8 sm:w-8"
                  title="Notifications"
                  aria-label={`${openIncidents.length} open service notifications`}
                  aria-expanded={notificationsOpen}
                  aria-controls="service-notifications"
                >
                  <Bell className="h-3.5 w-3.5" strokeWidth={1.8} />
                  {openIncidents.length > 0 && (
                    <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-600 px-1 text-center text-[9px] font-bold leading-4 text-white">
                      {Math.min(openIncidents.length, 9)}
                    </span>
                  )}
                </button>
                {notificationsOpen && (
                  <div id="service-notifications" className="absolute right-0 top-11 z-50 w-[min(22rem,calc(100vw-2rem))] rounded-xl border border-gray-200 bg-white p-2 shadow-xl">
                    <div className="flex items-center justify-between px-2 py-1.5">
                      <p className="text-xs font-bold text-gray-900">Service notifications</p>
                      <Link href="/status" className="text-[11px] font-semibold text-blue-600 hover:underline">Status</Link>
                    </div>
                    {openIncidents.length === 0 ? (
                      <p className="px-2 py-4 text-xs text-gray-500">No open service incidents.</p>
                    ) : openIncidents.slice(0, 5).map(incident => (
                      <Link key={incident.id} href={incident.actionPath ?? '/status'} onClick={() => setNotificationsOpen(false)} className="block rounded-lg px-2 py-2.5 hover:bg-gray-50">
                        <p className="text-xs font-semibold text-gray-900">{incident.title}</p>
                        <p className="mt-1 text-[11px] leading-4 text-gray-600">{incident.message}</p>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Content Container */}
          <div className="scrollbar-gutter-stable relative z-10 w-full flex-1 min-h-0 overflow-y-auto px-4 py-5 pb-[104px] sm:px-6 sm:py-6 lg:px-8 lg:pb-8">
            {(primaryIncident || redditConnectionAttention) && (
              <div
                role="alert"
                className={`mb-3 flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2 text-xs ${
                  primaryIncident?.severity === 'critical' ? 'border-red-200 bg-red-50 text-red-950' : 'border-amber-200 bg-amber-50/90 text-amber-950'
                }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <AlertTriangle className={`h-4 w-4 shrink-0 ${primaryIncident?.severity === 'critical' ? 'text-red-600' : 'text-amber-600'}`} aria-hidden="true" />
                  <span className="font-semibold shrink-0">{primaryIncident?.title ?? 'Reddit automation is paused'}:</span>
                  <span className={`truncate text-xs ${primaryIncident?.severity === 'critical' ? 'text-red-800' : 'text-amber-800'}`}>
                    {primaryIncident?.message ?? 'The saved Reddit session needs attention. Reconnect once to resume future automation safely.'}
                  </span>
                </div>
                <Link
                  href={primaryIncident?.actionPath ?? '/settings?section=connections'}
                  className="shrink-0 rounded-lg border border-current/20 bg-white px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-white/80 shadow-2xs"
                >
                  {primaryIncident?.actionPath === '/status' ? 'View status' : 'Review'}
                </Link>
              </div>
            )}
            {children}
          </div>

          {/* Mobile Nav Drawer */}
          <nav className="fixed inset-x-0 bottom-0 z-50 border-t border-black/[0.06] bg-white/95 pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.04)] backdrop-blur-xl lg:hidden" aria-label="Mobile navigation">
            <div className="flex items-center justify-around px-2 h-[64px] pt-1">
              {MOBILE_NAV_ITEMS.map((item) => {
                const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
                const IconComp = item.icon as any
                return (
                  <Link
                    key={item.name}
                    href={item.href}
                    prefetch
                    onMouseEnter={() => prepareRoute(item.href)}
                    onFocus={() => prepareRoute(item.href)}
                    onTouchStart={() => prepareRoute(item.href)}
                    aria-current={isActive ? 'page' : undefined}
                    className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${
                      isActive ? 'text-[#0A84FF]' : 'text-gray-400 hover:text-gray-700'
                    }`}
                  >
                    <div className="relative grid h-5 w-5 place-items-center">
                      <IconComp className="h-4.5 w-4.5 text-current" />
                    </div>
                    <span className={`text-[10px] ${isActive ? 'font-bold' : 'font-medium'}`}>{item.name.split(' ')[0]}</span>
                  </Link>
                )
              })}
              <button
                type="button"
                onClick={() => setMobileMenuOpen((open) => !open)}
                aria-expanded={mobileMenuOpen}
                aria-controls="mobile-more-menu"
                className={`flex min-h-12 min-w-14 flex-col items-center justify-center gap-1 rounded-xl transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#0A84FF]/30 ${
                  mobileMenuOpen || ['/dashboard', '/posted', '/settings'].some((href) => pathname.startsWith(href))
                    ? 'text-[#0A84FF]'
                    : 'text-gray-400 hover:text-gray-700'
                }`}
              >
                {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                <span className="text-[10px] font-medium">More</span>
              </button>
            </div>
          </nav>

          {mobileMenuOpen && (
            <>
              <button
                type="button"
                className="fixed inset-0 z-40 bg-black/15 lg:hidden"
                onClick={() => setMobileMenuOpen(false)}
                aria-label="Close navigation menu"
              />
              <div
                id="mobile-more-menu"
                className="fixed inset-x-3 bottom-[76px] z-50 overflow-hidden rounded-2xl border border-black/10 bg-white p-2 shadow-[0_20px_60px_rgba(0,0,0,0.16)] lg:hidden"
              >
                {[
                  { name: 'Dashboard', href: '/dashboard', icon: CustomDashboardIcon, isHeroicon: true },
                  { name: 'Posted replies', href: '/posted', icon: FolderIcon, isHeroicon: true },
                  { name: 'Plan & usage', href: '/settings?section=plan', icon: CreditCardIcon, isHeroicon: true },
                  { name: 'Settings', href: '/settings', icon: Cog6ToothIcon, isHeroicon: true },
                ].map((item) => {
                  const isActive = pathname === item.href || pathname.startsWith(`${item.href}/`)
                  const IconComp = item.icon as any
                  return (
                    <Link
                      key={item.href}
                      href={item.href}
                      prefetch
                      onMouseEnter={() => prepareRoute(item.href)}
                      onFocus={() => prepareRoute(item.href)}
                      onTouchStart={() => prepareRoute(item.href)}
                      aria-current={isActive ? 'page' : undefined}
                      className={`flex min-h-12 items-center gap-3 rounded-xl px-3 text-sm font-semibold ${
                        isActive ? 'bg-blue-50 text-[#0A84FF]' : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {item.isHeroicon ? (
                        <IconComp className="h-4.5 w-4.5" />
                      ) : (
                        <IconComp size={18} strokeWidth={2} />
                      )}
                      {item.name}
                    </Link>
                  )
                })}
                <form action={signOutAction} className="border-t border-gray-100 pt-2">
                  <button
                    type="submit"
                    className="flex min-h-12 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="h-4.5 w-4.5" strokeWidth={2} />
                    Sign out
                  </button>
                </form>
              </div>
            </>
          )}
        </div>
      </div>
    </DashboardSessionProvider>
  )
}
