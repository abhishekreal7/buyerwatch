'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Target, FileText, CheckCircle, ChartNoAxesCombined, Key, Settings, Bell, Search, LogOut, Zap, ZapOff } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Opportunities', href: '/opportunities', icon: Target },
  { name: 'Drafts Ready', href: '/drafts', icon: FileText },
  { name: 'Posted', href: '/posted', icon: CheckCircle },
  { name: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined },
  { name: 'Keywords', href: '/keywords', icon: Key },
  { name: 'Settings', href: '/settings', icon: Settings },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const supabase = createClient()

  const [autoSend, setAutoSend] = useState<boolean | null>(null)
  const [togglingAutoSend, setTogglingAutoSend] = useState(false)
  const [opportunityCount, setOpportunityCount] = useState<number | null>(null)
  const [draftCount, setDraftCount] = useState<number | null>(null)
  const [userInitial, setUserInitial] = useState('')

  useEffect(() => {
    async function loadSidebarData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

      // User initial
      setUserInitial(
        (user.user_metadata?.full_name?.[0] || user.email?.[0] || '?').toUpperCase()
      )

      // Profile — auto-send state
      const { data: profile } = await supabase
        .from('profiles')
        .select('auto_send_enabled')
        .eq('id', user.id)
        .single()
      if (profile) setAutoSend(profile.auto_send_enabled ?? false)

      // Real badge counts
      const [opportunitiesRes, draftsRes] = await Promise.all([
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .in('status', ['pending', 'needs_manual_reply']),
        supabase
          .from('monitored_threads')
          .select('id', { count: 'exact', head: true })
          .eq('user_id', user.id)
          .eq('status', 'drafted'),
      ])
      setOpportunityCount(opportunitiesRes.count ?? 0)
      setDraftCount(draftsRes.count ?? 0)
    }
    loadSidebarData()
  }, [])

  async function handleToggleAutoSend() {
    if (autoSend === null || togglingAutoSend) return
    const next = !autoSend
    setTogglingAutoSend(true)
    setAutoSend(next) // optimistic

    const res = await fetch('/api/settings/autosend', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ auto_send_enabled: next }),
    })

    if (!res.ok) {
      setAutoSend(!next) // revert
      toast.error('Failed to update auto-send setting')
    } else {
      toast.success(next ? 'Auto-send enabled' : 'Auto-send paused')
    }
    setTogglingAutoSend(false)
  }

  const badges: Record<string, number | null> = {
    '/opportunities': opportunityCount,
    '/drafts': draftCount,
  }

  return (
    <div className="min-h-screen bg-background flex selection:bg-accent/20 selection:text-accent">
      <div className="flex-1 flex overflow-hidden relative">
        {/* Sidebar */}
        <aside className="w-[260px] hidden md:flex flex-col bg-[#F8F9FA] border-r border-black/[0.04] shrink-0 relative z-20 py-5">
          {/* Logo */}
          <div className="h-14 flex items-center px-6 shrink-0 mb-4">
            <Link href="/dashboard" className="text-xl font-display font-bold tracking-tight text-text-primary flex items-center gap-2">
              <Target className="w-6 h-6 text-[#0A84FF]" strokeWidth={2.5} />
              Scouto
            </Link>
          </div>

          {/* Nav */}
          <nav className="flex-1 px-4 py-2 space-y-1 overflow-y-auto no-scrollbar">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const badge = badges[item.href]
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex items-center justify-between px-3.5 py-2.5 mb-0.5 rounded-[12px] transition-all duration-300 text-[14px] ${isActive
                    ? 'bg-white text-[#0A84FF] font-[600] shadow-sm'
                    : 'text-text-secondary hover:bg-black/5 hover:text-text-primary font-[500]'
                    }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <item.icon className={`w-[18px] h-[18px] shrink-0 ${isActive ? 'text-[#0A84FF]' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
                    <span className="truncate">{item.name}</span>
                  </div>
                  {badge != null && badge > 0 && (
                    <span className={`text-[11px] font-[600] px-1.5 py-0.5 rounded-full shrink-0 ml-1 tabular-nums ${isActive ? 'bg-[#0A84FF]/10 text-[#0A84FF]' : 'bg-black/[0.06] text-text-secondary'
                      }`}>
                      {badge}
                    </span>
                  )}
                </Link>
              )
            })}
          </nav>

          {/* Footer */}
          <div className="px-4 pt-4 border-t border-black/[0.05] shrink-0 space-y-1">
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="w-full flex items-center gap-3 px-3 py-2.5 rounded-[14px] text-text-secondary hover:bg-black/5 hover:text-text-primary transition-all duration-300 text-[14px] font-medium"
              >
                <LogOut className="w-[18px] h-[18px] shrink-0" strokeWidth={2} />
                <span>Sign out</span>
              </button>
            </form>
          </div>
        </aside>

        {/* Main */}
        <main className="flex-1 flex flex-col min-w-0 bg-white relative">
          {/* Topbar */}
          <header className="h-[72px] flex items-center justify-between px-8 bg-white sticky top-0 z-30 shrink-0 border-b border-black/[0.04]">
            <div className="flex items-center gap-4 flex-1 min-w-0">
              <div className="hidden md:flex relative w-96 max-w-full group">
                <Search className="w-[15px] h-[15px] absolute left-3.5 top-1/2 -translate-y-1/2 text-text-tertiary pointer-events-none" strokeWidth={2.5} />
                <input
                  type="text"
                  placeholder="Search..."
                  className="w-full bg-[#F4F5F7] border border-transparent rounded-full pl-10 pr-4 py-2 text-[14px] text-text-primary placeholder-text-tertiary font-medium focus-signature transition-all duration-300"
                />
              </div>
            </div>

            <div className="flex items-center gap-3">
              {/* Auto-send toggle pill */}
              {autoSend !== null && (
                <button
                  onClick={handleToggleAutoSend}
                  disabled={togglingAutoSend}
                  title={autoSend ? 'Auto-send is active — click to pause' : 'Auto-send is paused — click to resume'}
                  className="flex items-center gap-2.5 px-3 py-1.5 rounded-full bg-surface border border-black/5 hover:border-black/10 hover:bg-gray-50 transition-all duration-200 cursor-pointer shadow-[0_1px_2px_rgba(0,0,0,0.02)]"
                >
                  <span className={`text-[12.5px] font-medium transition-colors ${autoSend ? 'text-gray-900' : 'text-gray-500'}`}>
                    Auto-send
                  </span>
                  <div className={`relative w-[28px] h-[16px] rounded-full transition-colors duration-300 ${autoSend ? 'bg-[#0A84FF]' : 'bg-gray-200'}`}>
                    <div className={`absolute top-[2px] left-[2px] w-[12px] h-[12px] bg-white rounded-full shadow-sm transition-transform duration-300 ${autoSend ? 'translate-x-[12px]' : 'translate-x-0'}`} />
                  </div>
                </button>
              )}

              {/* Bell — no dot until we have a real notification system */}
              <button className="btn-icon" title="Notifications">
                <Bell className="w-[18px] h-[18px]" strokeWidth={2} />
              </button>

              {/* User avatar with real initial */}
              <div className="w-8 h-8 rounded-full bg-[#F4F5F7] border border-black/5 hover:border-black/15 shadow-[0_1px_2px_rgba(0,0,0,0.02)] cursor-pointer transition-colors duration-200 flex items-center justify-center">
                <span className="text-[13px] font-semibold text-text-primary leading-none uppercase">{userInitial}</span>
              </div>
            </div>
          </header>

          {/* Content */}
          <div className="flex-1 overflow-y-auto no-scrollbar pb-[90px] md:pb-0 relative z-10 px-8">
            {children}
          </div>
        </main>

        {/* Mobile Nav */}
        <nav className="md:hidden fixed bottom-0 left-0 right-0 z-50 bg-surface/80 backdrop-blur-[24px] saturate-[1.8] border-t border-black/[0.04] pb-safe shadow-[0_-4px_24px_rgba(0,0,0,0.02)]">
          <div className="flex items-center justify-around px-2 h-[84px] pb-5 pt-2">
            {NAV_ITEMS.filter(i => ['Dashboard', 'Opportunities', 'Drafts Ready', 'Keywords', 'Settings'].includes(i.name)).map((item) => {
              const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
              const badge = badges[item.href]
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  className={`flex flex-col items-center justify-center w-16 gap-1 transition-colors ${isActive ? 'text-accent' : 'text-text-tertiary hover:text-text-primary'
                    }`}
                >
                  <div className="relative">
                    <item.icon className="w-[22px] h-[22px]" strokeWidth={isActive ? 2.5 : 2} />
                    {badge != null && badge > 0 && (
                      <span className="absolute -top-1 -right-2 w-4 h-4 bg-destructive text-white text-[10px] font-bold flex items-center justify-center rounded-full ring-2 ring-surface">
                        {badge > 9 ? '9+' : badge}
                      </span>
                    )}
                  </div>
                  <span className={`text-[10px] tracking-wide ${isActive ? 'font-bold' : 'font-medium'}`}>{item.name.split(' ')[0]}</span>
                </Link>
              )
            })}
          </div>
        </nav>
      </div>
    </div>
  )
}
