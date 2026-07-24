'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, MoreHorizontal, Check, X, Pause, Play,
  Trash2, Target, ChevronDown, Radio, Rss, Sparkles, ArrowRight
} from 'lucide-react'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'
import { normalizePlan } from '@/lib/plan-limits'

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
function PlatformChip({ platform }: { platform: Platform }) {
  let imgSrc = ''
  let label = ''

  if (platform === 'reddit') {
    imgSrc = 'https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png'
    label = 'Reddit'
  } else if (platform === 'bluesky') {
    imgSrc = 'https://bsky.app/static/apple-touch-icon.png'
    label = 'Bluesky'
  } else if (platform === 'x') {
    imgSrc = 'https://abs.twimg.com/favicons/twitter.3.ico'
    label = 'X'
  } else if (platform === 'threads') {
    imgSrc = 'https://static.cdninstagram.com/rsrc.php/v3/y6/r/a0qE7WIVw-q.png'
    label = 'Threads'
  }

  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#F4F5F7] w-fit">
      <img src={imgSrc} alt={label} className="w-[16px] h-[16px] rounded-full shadow-sm object-cover" />
      <span className="font-medium text-text-secondary text-[13px] tracking-tight">{label}</span>
    </div>
  )
}

function StatusPill({ active, onClick }: { active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[12px] font-medium transition-all duration-150 cursor-pointer border ${
        active
          ? 'bg-emerald-50 text-emerald-700 border-emerald-200/80 hover:bg-emerald-100/60 hover:border-emerald-300/80 shadow-2xs'
          : 'bg-gray-100/80 text-gray-600 border-gray-200/80 hover:bg-gray-200/60 hover:text-gray-800'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${active ? 'bg-emerald-500' : 'bg-gray-400'}`} />
      {active ? 'Active' : 'Paused'}
    </button>
  )
}

// Real metric calculations based strictly on monitored threads
const getPopularity = (kwId: string, threadCount: number) => {
  if (threadCount > 0) {
    return Math.min(Math.round((threadCount / 15) * 100), 100)
  }
  return 0
}

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
      onClick={onClick}
      className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-[10px] text-[13px] whitespace-nowrap transition-all duration-150 cursor-pointer ${
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
  const supabase = createClient()


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

  async function load() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data, error } = await supabase.from('keywords').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    if (error) {
      toast.error('Failed to load keywords')
    } else {
      setKeywords(data || [])

      // Fetch thread counts for popularity and success metrics
      const { data: threadsData } = await supabase
        .from('monitored_threads')
        .select('keyword_id, status')
        .eq('user_id', user.id)

      const counts: Record<string, { total: number; replied: number }> = {}
      if (threadsData) {
        threadsData.forEach(t => {
          if (!t.keyword_id) return
          if (!counts[t.keyword_id]) {
            counts[t.keyword_id] = { total: 0, replied: 0 }
          }
          counts[t.keyword_id].total++
          if (t.status === 'replied') {
            counts[t.keyword_id].replied++
          }
        })
      }
      setMetrics(counts)
    }
    setLoading(false)
  }

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => {
    async function init() {
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        const { data: profile } = await supabase.from('profiles').select('plan').eq('id', user.id).single()
        setUserPlan(normalizePlan(profile?.plan))
      }
      await load()
    }
    init()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        <div className="flex items-start justify-between mb-10">
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
          <div className="mb-6 rounded-2xl border border-orange-100 bg-orange-50 px-5 py-4 flex items-center gap-4">
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
              className="shrink-0 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-800 px-3.5 py-2 rounded-xl transition-colors"
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
              <div className="bg-surface border border-black/[0.06] rounded-[20px] p-6">
                {/* Header */}
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <p className="text-[15px] font-semibold text-text-primary tracking-tight">New monitoring rule</p>
                    <p className="text-[12.5px] text-text-tertiary mt-0.5">The system polls for new posts matching this keyword in the chosen location.</p>
                  </div>
                  <button onClick={() => setShowAdd(false)}
                    className="w-7 h-7 rounded-full bg-black/[0.04] hover:bg-black/[0.08] flex items-center justify-center text-text-tertiary hover:text-text-primary transition-all cursor-pointer">
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

                <div className="flex items-center justify-between">
                  <p className="text-[12px] text-text-tertiary">
                    {newPlatform === 'reddit'
                      ? 'Monitors r/{subreddit} for posts containing your keyword.'
                      : 'Searches Bluesky posts and replies for your keyword.'}
                  </p>
                  <div className="flex items-center gap-2">
                    <button onClick={() => setShowAdd(false)}
                      className="btn-secondary text-[13px] py-2 px-4">
                      Cancel
                    </button>
                    <button onClick={handleAdd} disabled={saving}
                      className="btn-primary text-[13px] py-2 px-4 flex items-center gap-1.5 disabled:opacity-50">
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
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-text-tertiary pointer-events-none" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search…"
              className="h-8 pl-9 pr-4 w-52 rounded-full bg-surface border border-black/[0.07] text-[13px] text-text-primary placeholder-text-tertiary focus:outline-none focus:ring-2 focus:ring-black/[0.07] hover:border-black/[0.12] transition-all duration-150"
            />
          </div>

          <div className="w-px h-5 bg-black/[0.07]" />

          {/* Platform pills */}
          <div className="inline-flex items-center gap-1 p-1 bg-surface rounded-[14px] border border-black/[0.06] shadow-sm">
            <FilterPill label="All Platforms" active={filterPlatform === 'all'} onClick={() => setFilterPlatform('all')} />
            <FilterPill label="Reddit" icon={<RedditIcon className="w-3.5 h-3.5 shrink-0" />} active={filterPlatform === 'reddit'} onClick={() => setFilterPlatform('reddit')} />
            <FilterPill label="Bluesky" icon={<BlueskyIcon className="w-3.5 h-3.5 shrink-0" />} active={filterPlatform === 'bluesky'} onClick={() => setFilterPlatform('bluesky')} />
          </div>

          <div className="w-px h-5 bg-black/[0.07]" />

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

        {/* ── Table ───────────────────────────────────────────── */}
        <div className="rounded-[18px] border border-black/[0.06] bg-white">

          {/* Table head */}
          <div className="grid grid-cols-[40px_1fr_100px_44px] md:grid-cols-[40px_1fr_140px_100px_100px_44px] items-center px-5 py-3 bg-surface border-b border-black/[0.05] rounded-t-[17px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary">#</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary">Rule</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary hidden md:block">Leads Found</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary hidden md:block">Reply Rate</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary">Status</span>
            <span />
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <div className="flex flex-col items-center gap-3">
                <div className="w-8 h-8 rounded-full border-2 border-black/[0.08] border-t-text-primary animate-spin" />
                <span className="text-[13px] text-text-tertiary font-medium">Loading rules…</span>
              </div>
            </div>
          )}

          {/* Empty state */}
          {!loading && filtered.length === 0 && keywords.length === 0 && (
            <div className="flex flex-col items-center justify-center py-14 px-8 text-center">
              <div className="w-16 h-16 rounded-2xl bg-[#F0F7FF] flex items-center justify-center mb-5">
                <Target className="w-7 h-7 text-[#0A84FF]" strokeWidth={1.6} />
              </div>
              <p className="text-[17px] font-bold text-text-primary mb-2 tracking-tight">
                Set your first signal rule
              </p>
              <p className="text-[13.5px] text-text-secondary max-w-[320px] mb-6 leading-relaxed">
                Tell Scouto what buying intent looks like for your product — a keyword and a community. We scan every few hours and surface matching conversations.
              </p>
              <button
                onClick={() => setShowAdd(true)}
                className="btn-primary text-[13.5px] py-2.5 px-5 flex items-center gap-2 mb-8"
              >
                <Plus className="w-4 h-4" strokeWidth={2.5} />
                Create first rule
              </button>
              <div className="flex items-center gap-8 pt-6 border-t border-black/5 w-full max-w-sm justify-center">
                <div className="text-center">
                  <p className="text-[20px] font-bold text-text-primary tracking-tight">94%</p>
                  <p className="text-[12px] text-text-tertiary">Intent accuracy</p>
                </div>
                <div className="text-center">
                  <p className="text-[20px] font-bold text-text-primary tracking-tight">&lt;2hrs</p>
                  <p className="text-[12px] text-text-tertiary">Time to first signal</p>
                </div>
                <div className="text-center">
                  <p className="text-[20px] font-bold text-text-primary tracking-tight">Free</p>
                  <p className="text-[12px] text-text-tertiary">No card needed</p>
                </div>
              </div>
            </div>
          )}

          {!loading && filtered.length === 0 && keywords.length > 0 && (
            <div className="flex flex-col items-center justify-center py-16 px-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-surface border border-black/[0.06] flex items-center justify-center mb-4">
                <Search className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
              </div>
              <p className="text-[14px] font-semibold text-text-primary mb-1">No rules match your filters</p>
              <p className="text-[13px] text-text-tertiary max-w-[240px] leading-relaxed">
                Try adjusting your search or filter selection.
              </p>
            </div>
          )}


          {/* Rows */}
          <div className="divide-y divide-black/[0.04]">
            <AnimatePresence initial={false}>
              {filtered.map((kw, index) => {
                const threadStats = metrics[kw.id] || { total: 0, replied: 0 }
                const successRate = getSuccessRate(kw.id, threadStats.total, threadStats.replied)

                return (
                  <motion.div
                    key={kw.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: kw.is_active ? 1 : 0.55, y: 0 }}
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.18 }}
                    className="grid grid-cols-[40px_1fr_100px_44px] md:grid-cols-[40px_1fr_140px_100px_100px_44px] items-center px-5 py-4 hover:bg-surface/60 group transition-colors duration-150 relative last:rounded-b-[17px]"
                  >
                    {/* Index column */}
                    <span className="text-[13px] font-mono text-text-tertiary font-semibold">
                      {String(index + 1).padStart(2, '0')}
                    </span>

                    {/* Name column */}
                    <div className="flex items-center gap-3.5 min-w-0 pr-4">
                      <div className="flex-shrink-0">
                        {kw.platform === 'reddit' ? (
                          <div className="w-8 h-8 rounded-xl bg-[#FF4500]/8 flex items-center justify-center border border-[#FF4500]/15">
                            <img src="https://www.redditstatic.com/desktop2x/img/favicon/apple-icon-57x57.png" alt="Reddit" className="w-[18px] h-[18px] rounded-full object-cover" />
                          </div>
                        ) : (
                          <div className="w-8 h-8 rounded-xl bg-[#1185FE]/8 flex items-center justify-center border border-[#1185FE]/15">
                            <img src="https://bsky.app/static/apple-touch-icon.png" alt="Bluesky" className="w-[18px] h-[18px] rounded-full object-cover" />
                          </div>
                        )}
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-[14px] font-semibold text-text-primary truncate leading-snug">{kw.term}</span>
                        <span className="text-[12px] text-text-secondary truncate font-medium mt-0.5">
                          {kw.platform === 'reddit' ? `r/${kw.target}` : kw.target}
                        </span>
                      </div>
                    </div>

                    {/* Leads Found column with Popularity Bar */}
                    <div className="hidden md:flex flex-col justify-center">
                      <span className={`text-[13px] font-medium tabular-nums ${threadStats.total > 0 ? 'text-text-primary font-semibold' : 'text-text-tertiary'}`}>
                        {threadStats.total} {threadStats.total === 1 ? 'lead' : 'leads'}
                      </span>
                      <div className="w-20 h-1.5 rounded-full bg-black/[0.06] overflow-hidden mt-1" title={`${threadStats.total} leads found`}>
                        <div
                          className={`h-full rounded-full transition-all duration-300 ${threadStats.total > 0 ? 'bg-[#0A84FF]' : 'bg-gray-300 opacity-40'}`}
                          style={{ width: `${Math.min(Math.max(threadStats.total * 20, 8), 100)}%` }}
                        />
                      </div>
                    </div>

                    {/* Reply Rate column */}
                    <div className="hidden md:block">
                      <span className={`text-[13px] tabular-nums tracking-tight ${successRate > 0 ? 'font-bold text-text-primary' : 'font-medium text-text-tertiary'}`}>
                        {successRate}%
                      </span>
                    </div>

                    {/* Status column */}
                    <div>
                      <StatusPill active={kw.is_active} onClick={() => handleToggle(kw)} />
                    </div>

                    {/* Actions */}
                    <div className="flex items-center justify-end" data-menu>
                      <button
                        onClick={() => setMenuId(menuId === kw.id ? null : kw.id)}
                        className="w-8 h-8 rounded-[9px] flex items-center justify-center text-text-tertiary hover:text-text-primary hover:bg-black/[0.05] opacity-0 group-hover:opacity-100 focus:opacity-100 transition-all duration-150 cursor-pointer"
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
                            className="absolute right-4 top-12 z-30 bg-surface border border-black/[0.09] rounded-[12px] shadow-[0_8px_32px_rgba(0,0,0,0.09),0_2px_8px_rgba(0,0,0,0.05)] p-1 w-40"
                          >
                            <button
                              onClick={() => handleToggle(kw)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-medium text-text-primary hover:bg-surface transition-colors cursor-pointer"
                            >
                              {kw.is_active
                                ? <><Pause className="w-3.5 h-3.5 text-text-secondary" /> Pause rule</>
                                : <><Play className="w-3.5 h-3.5 text-text-secondary" /> Activate rule</>}
                            </button>
                            <div className="h-px bg-black/[0.05] my-1" />
                            <button
                              onClick={() => handleDelete(kw.id)}
                              className="w-full flex items-center gap-2.5 px-3 py-2 rounded-[8px] text-[13px] font-medium text-destructive hover:bg-destructive/5 transition-colors cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete rule
                            </button>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </div>
                  </motion.div>
                )
              })}
            </AnimatePresence>
          </div>

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
              className="mt-4 rounded-[18px] border border-black/[0.06] bg-gradient-to-br from-white to-[#F9F9FB] p-5 flex items-start gap-4"
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
                className="shrink-0 flex items-center gap-1.5 text-[13px] font-semibold text-white bg-gray-900 hover:bg-gray-800 px-4 py-2 rounded-xl transition-colors"
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
