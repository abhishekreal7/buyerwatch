'use client'

import { ReactNode, useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { LayoutDashboard, Target, FileText, CheckCircle, ChartNoAxesCombined, Key, Bell, Search, LogOut, User } from 'lucide-react'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

const NAV_ITEMS = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Opportunities', href: '/opportunities', icon: Target },
  { name: 'Drafts Ready', href: '/drafts', icon: FileText },
  { name: 'Posted', href: '/posted', icon: CheckCircle },
  { name: 'Analytics', href: '/analytics', icon: ChartNoAxesCombined },
  { name: 'Keywords', href: '/keywords', icon: Key },
]

export default function DashboardLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const supabase = createClient()

  const [autoSend, setAutoSend] = useState<boolean | null>(null)
  const [togglingAutoSend, setTogglingAutoSend] = useState(false)
  const [opportunityCount, setOpportunityCount] = useState<number | null>(null)
  const [draftCount, setDraftCount] = useState<number | null>(null)

  useEffect(() => {
    async function loadSidebarData() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) return

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
    <div className="min-h-screen bg-background relative selection:bg-accent/20 selection:text-accent">
      {/* Sidebar - Fixed stationary on left of screen */}
      <aside className="w-[260px] h-screen fixed top-0 left-0 bottom-0 hidden md:flex flex-col bg-[#F8F9FA] border-r border-black/[0.04] shrink-0 z-30 py-4">
        {/* Logo */}
        <div className="h-12 flex items-center px-5 shrink-0 mb-2">
          <Link href="/dashboard" className="text-xl font-display font-bold tracking-tight text-text-primary flex items-center gap-2">
            <Target className="w-6 h-6 text-[#0A84FF]" strokeWidth={2.5} />
            Scouto
          </Link>
        </div>

        {/* Nav */}
        <nav className="flex-1 px-3 py-2 space-y-0.5 overflow-y-auto no-scrollbar">
          {NAV_ITEMS.map((item) => {
            const isActive = pathname === item.href || pathname.startsWith(item.href + '/')
            const badge = badges[item.href]
            return (
              <Link
                key={item.name}
                href={item.href}
                className={`flex items-center justify-between px-3 py-2 rounded-[12px] transition-all duration-200 text-[13.5px] ${isActive
                  ? 'bg-white text-[#0A84FF] font-[600] shadow-sm'
                  : 'text-text-secondary hover:bg-black/5 hover:text-text-primary font-[500]'
                  }`}
              >
                <div className="flex items-center gap-2.5 min-w-0">
                  <item.icon className={`w-[17px] h-[17px] shrink-0 ${isActive ? 'text-[#0A84FF]' : ''}`} strokeWidth={isActive ? 2.5 : 2} />
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

        {/* Footer - Pinned User Profile & Sign Out */}
        <div className="p-3 border-t border-black/[0.05] shrink-0">
          <div className="flex items-center justify-between gap-2 p-1.5 rounded-[12px] hover:bg-black/5 transition-colors group">
            <Link href="/settings" className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-full bg-gray-900 text-white flex items-center justify-center shrink-0">
                <User className="w-3.5 h-3.5 text-white" strokeWidth={2} />
              </div>
              <span className="text-[13px] font-medium text-text-primary truncate group-hover:text-blue-600 transition-colors">Settings &amp; Profile</span>
            </Link>
            <form action="/api/auth/signout" method="POST">
              <button
                type="submit"
                className="p-1.5 text-text-tertiary hover:text-red-600 rounded-md transition-colors cursor-pointer"
                title="Sign out"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* Main Container - Offset by fixed sidebar width */}
      <div className="flex-1 md:pl-[260px] flex flex-col min-h-screen">
        {/* Topbar */}
        <header className="h-[72px] flex items-center justify-between px-8 bg-white/90 backdrop-blur-md sticky top-0 z-20 shrink-0 border-b border-black/[0.04]">
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
            {/* Clean Auto-send toggle */}
            {autoSend !== null && (
              <button
                onClick={handleToggleAutoSend}
                disabled={togglingAutoSend}
                title={autoSend ? 'Auto-send is active — click to pause' : 'Auto-send is paused — click to resume'}
                className="flex items-center gap-2.5 px-2 py-1 rounded-lg hover:bg-black/5 transition-colors cursor-pointer"
              >
                <span className="text-[13px] font-medium text-gray-700 select-none">
                  Auto-send
                </span>
                <div className={`relative w-[34px] h-[20px] rounded-full transition-colors duration-200 ${autoSend ? 'bg-emerald-500' : 'bg-gray-200'}`}>
                  <div className={`absolute top-[2px] left-[2px] w-[16px] h-[16px] bg-white rounded-full shadow-sm transition-transform duration-200 ${autoSend ? 'translate-x-[14px]' : 'translate-x-0'}`} />
                </div>
              </button>
            )}

            {/* Bell */}
            <button className="btn-icon" title="Notifications">
              <Bell className="w-[18px] h-[18px]" strokeWidth={2} />
            </button>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 pb-[90px] md:pb-8 relative z-10 px-8 py-6">
          {children}
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
