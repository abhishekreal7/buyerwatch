'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, MoreHorizontal, Check, X, Pause, Play,
  Trash2, Target, Rss, Sparkles, ArrowRight
} from 'lucide-react'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { normalizePlan } from '@/lib/plan-limits'
import { useDashboardSession } from '@/components/DashboardContext'

type Platform = 'reddit' | 'bluesky' | 'x' | 'threads'

interface Keyword {
  id: string
  term: string
  platform: Platform
  target: string
  is_active: boolean
  created_at: string
}

/* ─── Platform metadata ──────────────────────────────────────────── */
const PLATFORM_META: Record<Platform, { label: string; color: string; bg: string; border: string }> = {
  reddit: { label: 'Reddit', color: '#FF4500', bg: 'bg-[#FF4500]/8', border: 'border-[#FF4500]/15' },
  bluesky: { label: 'Bluesky', color: '#1185FE', bg: 'bg-[#1185FE]/8', border: 'border-[#1185FE]/15' },
  x: { label: 'X', color: '#000000', bg: 'bg-black/5', border: 'border-black/10' },
  threads: { label: 'Threads', color: '#000000', bg: 'bg-black/5', border: 'border-black/10' },
}

const PLATFORMS_AVAILABLE: Platform[] = ['reddit', 'bluesky']

/* ─── Tiny primitives ────────────────────────────────────────────── */
function StatusPill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[12px] font-semibold transition-all duration-150 cursor-pointer shadow-2xs ${
        active
          ? 'bg-[#E8F8F0] text-[#15803D] border border-[#C6F0D8] hover:bg-[#DCFCE7]'
          : 'bg-[#F2F2F0] text-[#555550] border border-[#E2E2DE] hover:bg-[#E8E8E5]'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-[#16A34A]' : 'bg-[#71716A]'}`} />
      {active ? 'Active' : 'Paused'}
    </button>
  )
}

// Real metric calculations based strictly on monitored threads
const getSuccessRate = (kwId: string, threadCount: number, repliedCount: number) => {
  if (threadCount > 0) {
    return Math.round((repliedCount / threadCount) * 100)
  }
  return 0
}



/* ─── Filter pill button ─────────────────────────────────────────── */
function FilterPill({ label, active, onClick, icon }: { label: string; active: boolean; onClick: () => void; icon?: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex min-h-11 items-center gap-1.5 whitespace-nowrap rounded-[10px] px-3.5 py-1.5 text-[13px] transition-all duration-150 cursor-pointer sm:min-h-0 ${
        active
          ? 'bg-text-primary text-white font-semibold shadow-sm'
          : 'text-text-secondary hover:text-text-primary hover:bg-black/[0.04] font-medium'
      }`}
    >
      {icon}
      {label}
    </button>
  )
}

/* ─── Field ──────────────────────────────────────────────────────── */
const fieldCls = `w-full bg-surface border border-black/[0.08] rounded-[10px] px-3.5 py-2.5 text-[13.5px]
  text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-black/[0.08]
  focus:border-black/[0.15] hover:border-black/[0.12] transition-all duration-150`.replace(/\s+/g, ' ')

/* ─── Main ───────────────────────────────────────────────────────── */
export default function KeywordsPage() {
  const [keywords, setKeywords] = useState<Keyword[]>([])
  const [loading, setLoading] = useState(true)
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [newTerm, setNewTerm] = useState('')
  const [newPlatform, setNewPlatform] = useState<Platform>('reddit')
  const [newTarget, setNewTarget] = useState('')
  const [search, setSearch] = useState('')
  const [filterPlatform, setFilterPlatform] = useState<'all' | Platform>('all')
  const [filterStatus, setFilterStatus] = useState<'all' | 'active' | 'paused'>('all')
  const [menuId, setMenuId] = useState<string | null>(null)
  const [metrics, setMetrics] = useState<Record<string, { total: number; replied: number }>>({})
  const [userPlan, setUserPlan] = useState<string>('free')
  const termRef = useRef<HTMLInputElement>(null)
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()


  useEffect(() => {
    const down = (e: MouseEvent) => {
      if (menuId && !(e.target as Element).closest('[data-menu]')) setMenuId(null)
    }
    document.addEventListener('mousedown', down)
    return () => document.removeEventListener('mousedown', down)
  }, [menuId])

  // Focus keyword input when form opens
  useEffect(() => {
    if (showAdd) setTimeout(() => termRef.current?.focus(), 80)
  }, [showAdd])

  useEffect(() => {
    async function init() {
      const [profileResult, keywordsResult, threadsResult] = await Promise.all([
        supabase.from('profiles').select('plan').eq('id', userId).single(),
        supabase.from('keywords').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
        supabase.from('monitored_threads').select('keyword_id, status').eq('user_id', userId),
      ])

      setUserPlan(normalizePlan(profileResult.data?.plan))
      if (keywordsResult.error) {
        toast.error('Failed to load keywords')
      } else {
        setKeywords(keywordsResult.data || [])
      }

      const counts: Record<string, { total: number; replied: number }> = {}
      for (const thread of threadsResult.data || []) {
        if (!thread.keyword_id) continue
        counts[thread.keyword_id] ??= { total: 0, replied: 0 }
        counts[thread.keyword_id].total++
        if (thread.status === 'replied') counts[thread.keyword_id].replied++
      }
      setMetrics(counts)
      setLoading(false)
    }

    void init()
  }, [supabase, userId])

  const handleAdd = async () => {
    if (!newTerm.trim() || !newTarget.trim()) { toast.error('Fill in keyword and target'); return }
    setSaving(true)

    try {
      const res = await fetch('/api/keywords/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          term: newTerm.trim(),
          platform: newPlatform,
          target: newTarget.trim(),
        }),
      })

      const payload = await res.json().catch(() => ({}))

      if (res.status === 403 && payload.error === 'plan_limit_reached') {
        toast.error('Keyword limit reached for your plan. Upgrade to add more.')
        setSaving(false)
        return
      }

      if (!res.ok) {
        toast.error(payload.error || 'Failed to save keyword')
        setSaving(false)
        return
      }

      const data = payload.keyword
      setKeywords(prev => [data, ...prev])
      setNewTerm(''); setNewTarget(''); setShowAdd(false)

      // Reset filters so the new active rule is immediately visible
      setFilterStatus('all')
      setFilterPlatform('all')
      setSearch('')

      toast.success('Rule created')
      toast.info('Searching network for past 24 hours of data...')

      // Trigger Instant Aha Moment
      fetch('/api/keywords/fetch-now', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ keywordId: data.id })
      }).catch(err => console.error('fetch-now error:', err))
    } catch {
      toast.error('Failed to save keyword')
    }
    setSaving(false)
  }

  const handleToggle = async (kw: Keyword) => {
    const next = !kw.is_active
    setKeywords(prev => prev.map(k => k.id === kw.id ? { ...k, is_active: next } : k))
    setMenuId(null)
    const { error } = await supabase.from('keywords').update({ is_active: next }).eq('id', kw.id)
    if (error) {
      setKeywords(prev => prev.map(k => k.id === kw.id ? { ...k, is_active: kw.is_active } : k))
      toast.error('Failed to update')
    } else toast.success(next ? 'Rule activated' : 'Rule paused')
  }

  const handleDelete = async (id: string) => {
    setMenuId(null)
    const removed = keywords.find(k => k.id === id)
    setKeywords(prev => prev.filter(k => k.id !== id))
    const { error } = await supabase.from('keywords').delete().eq('id', id)
    if (error) { if (removed) setKeywords(prev => [removed, ...prev]); toast.error('Failed to delete') }
    else toast.success('Rule deleted')
  }

  const filtered = useMemo(() => keywords.filter(kw => {
    const q = search.toLowerCase()
    const matchSearch = !q || kw.term.toLowerCase().includes(q) || kw.target.toLowerCase().includes(q)
    const matchPlat = filterPlatform === 'all' || kw.platform === filterPlatform
    const matchStatus = filterStatus === 'all' || (filterStatus === 'active' ? kw.is_active : !kw.is_active)
    return matchSearch && matchPlat && matchStatus
  }), [keywords, search, filterPlatform, filterStatus])

  const activeCount = keywords.filter(k => k.is_active).length
  const pausedCount = keywords.filter(k => !k.is_active).length

  return (
    <AppPage>
      <div className="w-full">

        {/* ── Page header ─────────────────────────────────────── */}
        <div className="mb-6 flex flex-col items-start justify-between gap-4 sm:flex-row">
          <div>
            <h1 className="page-title">Monitoring Rules</h1>
            {!loading && (
              <p className="page-subtitle">
                {keywords.length === 0
                  ? 'No rules yet — add one to start monitoring conversations.'
                  : `${activeCount} active · ${pausedCount} paused`}
              </p>
            )}
          </div>
          <motion.button
            whileTap={{ scale: 0.97 }}
            onClick={() => setShowAdd(v => !v)}
            className="btn-primary text-[13px] py-2 px-4 flex items-center gap-1.5 shadow-sm"
          >
            <motion.span animate={{ rotate: showAdd ? 45 : 0 }} transition={{ duration: 0.2 }}>
              <Plus className="w-3.5 h-3.5" strokeWidth={2.25} />
            </motion.span>
            <span>New Rule</span>
          </motion.button>
        </div>

        {/* ── Downgrade banner ─────────────────────────────────────
            Shown when plan=free and there are paused rules (post-downgrade).
            Never shown to always-free users (they have 0 paused rules).
            Persistent — resolves only when user upgrades.
        ─────────────────────────────────────────────────────────── */}
        {!loading && userPlan === 'free' && pausedCount > 0 && (
          <div className="mb-6 flex flex-col items-start gap-4 rounded-2xl border border-orange-100 bg-orange-50 px-4 py-4 sm:flex-row sm:items-center sm:px-5">
            <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
              <Rss className="w-4 h-4 text-orange-500" strokeWidth={1.75} />
            </div>
            <p className="flex-1 text-[13.5px] text-orange-900 leading-relaxed">
              <span className="font-semibold">{pausedCount} rule{pausedCount !== 1 ? 's are' : ' is'} paused</span>{' '}
              because your current plan includes 1 active keyword.
              Upgrade to reactivate all {pausedCount}.
            </p>
            <a
              href="/pricing"
              className="inline-flex min-h-11 shrink-0 items-center rounded-xl bg-gray-900 px-3.5 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800 sm:min-h-0"
            >
              Upgrade →
            </a>
          </div>
        )}

        {/* ── Add Rule Panel ───────────────────────────────────── */}
        <AnimatePresence>
          {showAdd && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              transition={{ duration: 0.22, ease: [0.25, 0.46, 0.45, 0.94] }}
              className="overflow-hidden mb-8"
            >
              <div className="rounded-[20px] border border-black/[0.06] bg-surface p-4 sm:p-6">
                {/* Header */}
                <div className="mb-6 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[15px] font-semibold text-text-primary tracking-tight">New monitoring rule</p>
                    <p className="text-[12.5px] text-text-tertiary mt-0.5">The system polls for new posts matching this keyword in the chosen location.</p>
                  </div>
                  <button type="button" onClick={() => setShowAdd(false)}
                    className="flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full bg-black/[0.04] text-text-tertiary transition-all hover:bg-black/[0.08] hover:text-text-primary"
                    aria-label="Close new rule form">
                    <X className="w-3.5 h-3.5" strokeWidth={2.5} />
                  </button>
                </div>

                {/* Fields */}
                <div className="grid grid-cols-1 sm:grid-cols-[1fr_160px_1fr] gap-3 mb-5">
                  <div>
                    <label className="text-[11.5px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 block">Keyword or phrase</label>
                    <input
                      ref={termRef}
                      value={newTerm}
                      onChange={e => setNewTerm(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      placeholder="e.g. looking for email tool"
                      className={fieldCls}
                    />
                  </div>
                  <div>
                    <label className="text-[11.5px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 block">Platform</label>
                    <select value={newPlatform} onChange={e => setNewPlatform(e.target.value as Platform)} className={fieldCls + ' cursor-pointer'}>
                      {PLATFORMS_AVAILABLE.map(p => (
                        <option key={p} value={p}>{PLATFORM_META[p].label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="text-[11.5px] font-semibold text-text-tertiary uppercase tracking-wider mb-1.5 block">
                      {newPlatform === 'reddit' ? 'Subreddit' : 'Search query'}
                    </label>
                    <input
                      value={newTarget}
                      onChange={e => setNewTarget(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleAdd()}
                      placeholder={newPlatform === 'reddit' ? 'e.g. entrepreneur' : 'e.g. #EmailMarketing'}
                      className={fieldCls}
                    />
                  </div>
                </div>

                <div className="flex flex-col items-start justify-between gap-4 sm:flex-row sm:items-center">
                  <p className="text-[12px] text-text-tertiary">
                    {newPlatform === 'reddit'
                      ? 'Monitors r/{subreddit} for posts containing your keyword.'
                      : 'Searches Bluesky posts and replies for your keyword.'}
                  </p>
                  <div className="flex w-full items-center gap-2 sm:w-auto">
                    <button onClick={() => setShowAdd(false)}
                      className="btn-secondary min-h-11 flex-1 px-4 py-2 text-[13px] sm:min-h-0 sm:flex-none">
                      Cancel
                    </button>
                    <button onClick={handleAdd} disabled={saving}
                      className="btn-primary min-h-11 flex flex-1 items-center gap-1.5 px-4 py-2 text-[13px] disabled:opacity-50 sm:min-h-0 sm:flex-none">
                      {saving ? 'Saving…' : <><Check className="w-3.5 h-3.5" strokeWidth={2.5} /> Create rule</>}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ── Filter bar ──────────────────────────────────────── */}
        <div className="flex items-center gap-3 mb-6 flex-wrap">
          {/* Search */}
          <div className="relative w-full sm:w-auto">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-11 w-full rounded-full border border-black/[0.07] bg-surface pl-9 pr-4 text-[13px] text-text-primary placeholder-text-tertiary transition-all duration-150 hover:border-black/[0.12] focus:outline-none focus:ring-2 focus:ring-black/[0.07] sm:h-8 sm:w-52"
            />
          </div>

          <div className="hidden h-5 w-px bg-black/[0.07] sm:block" />

          {/* Platform pills */}
          <div className="inline-flex items-center gap-1 p-1 bg-surface rounded-[14px] border border-black/[0.06] shadow-sm">
            <FilterPill label="All Platforms" active={filterPlatform === 'all'} onClick={() => setFilterPlatform('all')} />
            <FilterPill label="Reddit" icon={<RedditIcon className="w-3.5 h-3.5 shrink-0" />} active={filterPlatform === 'reddit'} onClick={() => setFilterPlatform('reddit')} />
            <FilterPill label="Bluesky" icon={<BlueskyIcon className="w-3.5 h-3.5 shrink-0" />} active={filterPlatform === 'bluesky'} onClick={() => setFilterPlatform('bluesky')} />
          </div>

          <div className="hidden h-5 w-px bg-black/[0.07] sm:block" />

          {/* Status pills */}
          <div className="inline-flex items-center gap-1 p-1 bg-surface rounded-[14px] border border-black/[0.06] shadow-sm">
            <FilterPill label="All Statuses" active={filterStatus === 'all'} onClick={() => setFilterStatus('all')} />
            <FilterPill label="Active" active={filterStatus === 'active'} onClick={() => setFilterStatus('active')} />
            <FilterPill label="Paused" active={filterStatus === 'paused'} onClick={() => setFilterStatus('paused')} />
          </div>

          {/* Result count — right-aligned */}
          {!loading && keywords.length > 0 && (
            <span className="ml-auto text-[12px] text-text-tertiary font-medium tabular-nums">
              {filtered.length} of {keywords.length}
            </span>
          )}
        </div>

        {/* ── Main Table Container matching provided HTML template ───────────────── */}
        <div className="w-full bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden" data-purpose="deals-table-container">
          <table className="w-full text-left border-collapse" data-purpose="deals-table">
            {/* Table Header */}
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100 text-sm text-gray-500 font-medium">
                <th className="py-4 pl-6 pr-4 w-12 rounded-tl-xl">
                  <input
                    className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white cursor-pointer"
                    type="checkbox"
                    aria-label="Select all rules"
                  />
                </th>
                <th className="py-4 px-4 w-16">ID</th>
                <th className="py-4 px-4 w-1/4">Deals</th>
                <th className="py-4 px-4 w-1/4">Contact</th>
                <th className="py-4 px-4 w-1/4">Email</th>
                <th className="py-4 px-4 w-32">Value</th>
                <th className="py-4 px-6 rounded-tr-xl">Source</th>
                <th className="py-4 px-4 w-12" />
              </tr>
            </thead>

            {/* Table Body */}
            <tbody className="divide-y divide-gray-100 text-sm">
              {loading && (
                <tr>
                  <td colSpan={8} className="py-20 text-center">
                    <div className="flex flex-col items-center gap-3">
                      <div className="w-8 h-8 rounded-full border-2 border-gray-200 border-t-gray-900 animate-spin" />
                      <span className="text-xs font-medium text-gray-500">Loading rules…</span>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && keywords.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-14 px-8 text-center">
                    <div className="flex flex-col items-center justify-center">
                      <div className="w-16 h-16 rounded-2xl bg-blue-50 flex items-center justify-center mb-5">
                        <Target className="w-7 h-7 text-[#0A84FF]" strokeWidth={1.6} />
                      </div>
                      <p className="text-base font-bold text-gray-900 mb-2">Set your first signal rule</p>
                      <p className="text-xs text-gray-500 max-w-xs mb-6 leading-relaxed">
                        Tell Scouto what buying intent looks like for your product — a keyword and a community.
                      </p>
                      <button
                        onClick={() => setShowAdd(true)}
                        className="btn-primary text-xs py-2.5 px-5 flex items-center gap-2 mb-4"
                      >
                        <Plus className="w-4 h-4" strokeWidth={2.5} />
                        Create first rule
                      </button>
                    </div>
                  </td>
                </tr>
              )}

              {!loading && filtered.length === 0 && keywords.length > 0 && (
                <tr>
                  <td colSpan={8} className="py-16 text-center text-gray-500">
                    No rules match your filters.
                  </td>
                </tr>
              )}

              {filtered.map((kw, index) => {
                const threadStats = metrics[kw.id] || { total: 0, replied: 0 }
                const successRate = getSuccessRate(kw.id, threadStats.total, threadStats.replied)

                return (
                  <tr key={kw.id} className="hover:bg-gray-50 transition-colors">
                    <td className="py-4 pl-6 pr-4">
                      <input
                        className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500 bg-white cursor-pointer"
                        type="checkbox"
                      />
                    </td>
                    <td className="py-4 px-4 text-gray-500 font-medium">
                      {String(index + 1).padStart(2, '0')}
                    </td>
                    <td className="py-4 px-4 font-medium text-gray-900">
                      {kw.term}
                    </td>
                    <td className="py-4 px-4">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-gray-200 bg-white shadow-sm">
                        {kw.platform === 'reddit' ? (
                          <RedditIcon className="w-4 h-4 text-[#FF4500]" />
                        ) : (
                          <BlueskyIcon className="w-4 h-4 text-[#1185FE]" />
                        )}
                        <span className="font-medium text-gray-700">
                          {kw.platform === 'reddit' ? `r/${kw.target}` : kw.target}
                        </span>
                      </div>
                    </td>
                    <td className="py-4 px-4 text-gray-500">
                      {threadStats.total} {threadStats.total === 1 ? 'lead' : 'leads'}
                    </td>
                    <td className="py-4 px-4 font-medium text-gray-900">
                      {successRate}%
                    </td>
                    <td className="py-4 px-6">
                      <StatusPill active={kw.is_active} onClick={() => handleToggle(kw)} />
                    </td>
                    <td className="py-4 px-4 text-right relative" data-menu>
                      <button
                        onClick={() => setMenuId(menuId === kw.id ? null : kw.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors"
                        aria-label={`Actions for ${kw.term}`}
                      >
                        <MoreHorizontal className="w-4 h-4" />
                      </button>

                      <AnimatePresence>
                        {menuId === kw.id && (
                          <motion.div
                            initial={{ opacity: 0, scale: 0.94, y: -4 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.94, y: -4 }}
                            transition={{ duration: 0.1 }}
                            className="absolute right-4 top-12 z-30 bg-white border border-gray-200 rounded-xl shadow-lg p-1 w-40 text-left"
                          >
                            <button
                              onClick={() => handleToggle(kw)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-gray-800 hover:bg-gray-50 transition-colors cursor-pointer"
                            >
                              {kw.is_active
                                ? <><Pause className="w-3.5 h-3.5 text-gray-500" /> Pause rule</>
                                : <><Play className="w-3.5 h-3.5 text-gray-500" /> Activate rule</>}
                            </button>
                            <div className="h-px bg-gray-100 my-1" />
                            <button
                              onClick={() => handleDelete(kw.id)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete rule
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>

        {/* ── Upgrade prompt (Placement A) ─────────────────────────
            Shown only when:
            1. plan === 'free'
            2. user is at the 1-keyword limit (keywords.length >= 1)
            3. that keyword has >= 1 real discovered thread (real data only)
        ─────────────────────────────────────────────────────────── */}
        {!loading && userPlan === 'free' && keywords.length >= 1 && (() => {
          const firstKw = keywords[0]
          const kwStats = metrics[firstKw?.id] || { total: 0, replied: 0 }
          if (kwStats.total === 0) return null
          const avgPerKeyword = kwStats.total
          return (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
              className="mt-4 flex flex-col items-start gap-4 rounded-[18px] border border-black/[0.06] bg-gradient-to-br from-white to-[#F9F9FB] p-5 sm:flex-row"
            >
              <div className="w-9 h-9 rounded-xl bg-amber-50 border border-amber-100 flex items-center justify-center shrink-0 mt-0.5">
                <Sparkles className="w-4 h-4 text-amber-500" strokeWidth={1.75} />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-[14px] font-semibold text-text-primary mb-1">
                  Your 1 keyword has found{' '}
                  <span className="text-black">{kwStats.total}</span>{' '}
                  conversation{kwStats.total !== 1 ? 's' : ''} this month.
                </p>
                <p className="text-[13px] text-text-secondary leading-relaxed">
                  Teams on Professional track up to 10 topics simultaneously — each additional
                  keyword typically surfaces ~{avgPerKeyword} new conversation{avgPerKeyword !== 1 ? 's' : ''} per month.
                </p>
              </div>
              <a
                href="/pricing"
                className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl bg-gray-900 px-4 py-2 text-[13px] font-semibold text-white transition-colors hover:bg-gray-800 sm:min-h-0"
              >
                Upgrade to Professional
                <ArrowRight className="w-3.5 h-3.5" strokeWidth={2.5} />
              </a>
            </motion.div>
          )
        })()}
      </div>
    </AppPage>
  )
}
