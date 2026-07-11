'use client'

import { useState, useEffect, useMemo, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Plus, Search, MoreHorizontal, Check, X, Pause, Play,
  Trash2, Target, ChevronDown, Radio, Rss
} from 'lucide-react'
import { RedditIcon, BlueskyIcon } from '@/components/Icons'
import { AppPage } from '@/components/AppPage'
import { createClient } from '@/utils/supabase/client'
import { toast } from 'sonner'

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
      className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10.5px] font-bold uppercase tracking-wider transition-colors duration-150 cursor-pointer border-none"
      style={{
        backgroundColor: active ? '#EAFDF5' : '#F4F5F7',
        color: active ? '#0B8A5A' : '#6B6B6B'
      }}
    >
      <span className="w-1.5 h-1.5 rounded-full" style={{ backgroundColor: active ? '#10B981' : '#8E8E93' }} />
      {active ? 'Active' : 'Paused'}
    </button>
  )
}

// Deterministic hash functions for premium onboarding placeholder values
const getPopularity = (kwId: string, threadCount: number) => {
  if (threadCount > 0) {
    return Math.min(Math.round((threadCount / 15) * 100), 100)
  }
  const charSum = kwId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return (charSum % 60) + 25 // 25% to 85%
}

const getSuccessRate = (kwId: string, threadCount: number, repliedCount: number) => {
  if (threadCount > 0) {
    return Math.round((repliedCount / threadCount) * 100)
  }
  const charSum = kwId.split('').reduce((acc, char) => acc + char.charCodeAt(0), 0)
  return (charSum % 40) + 15 // 15% to 55%
}



/* ─── Filter pill button ─────────────────────────────────────────── */
function FilterPill({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick}
      className={`h-8 px-3.5 rounded-full text-[12.5px] font-semibold transition-all duration-150 cursor-pointer border ${active
          ? 'bg-text-primary text-white border-text-primary shadow-sm'
          : 'bg-white text-text-secondary border-black/[0.08] hover:border-black/[0.14] hover:text-text-primary'
        }`}>
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
  const termRef = useRef<HTMLInputElement>(null)
  const supabase = createClient()

  useEffect(() => { load() }, [])

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
            className="btn-primary text-[13px] py-2.5 px-5 flex items-center gap-2"
          >
            <motion.span animate={{ rotate: showAdd ? 45 : 0 }} transition={{ duration: 0.2 }}>
              <Plus className="w-4 h-4" strokeWidth={2.5} />
            </motion.span>
            New Rule
          </motion.button>
        </div>

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
          <div className="flex items-center gap-1.5">
            <FilterPill label="All Platforms" active={filterPlatform === 'all'} onClick={() => setFilterPlatform('all')} />
            <FilterPill label="Reddit" active={filterPlatform === 'reddit'} onClick={() => setFilterPlatform('reddit')} />
            <FilterPill label="Bluesky" active={filterPlatform === 'bluesky'} onClick={() => setFilterPlatform('bluesky')} />
          </div>

          <div className="w-px h-5 bg-black/[0.07]" />

          {/* Status pills */}
          <div className="flex items-center gap-1.5">
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
          <div className="grid grid-cols-[40px_1fr_100px_44px] md:grid-cols-[40px_1fr_160px_100px_100px_44px] items-center px-5 py-3 bg-surface border-b border-black/[0.05] rounded-t-[17px]">
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary">#</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary">Rule</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary hidden md:block">Popularity</span>
            <span className="text-[10px] font-bold uppercase tracking-[0.08em] text-text-tertiary hidden md:block">Success</span>
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
          {!loading && filtered.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 px-8 text-center">
              <div className="w-12 h-12 rounded-2xl bg-surface border border-black/[0.06] flex items-center justify-center mb-4">
                <Rss className="w-5 h-5 text-text-tertiary" strokeWidth={1.75} />
              </div>
              <p className="text-[14px] font-semibold text-text-primary mb-1">
                {keywords.length === 0 ? 'No monitoring rules yet' : 'No rules match your filters'}
              </p>
              <p className="text-[13px] text-text-tertiary max-w-[280px] mb-5 leading-relaxed">
                {keywords.length === 0
                  ? 'Create a rule to start monitoring Reddit or Bluesky for conversations about your product.'
                  : 'Try adjusting your search or filters.'}
              </p>
              {keywords.length === 0 && (
                <button onClick={() => setShowAdd(true)} className="btn-primary text-[13px] py-2 px-4 flex items-center gap-1.5">
                  <Plus className="w-4 h-4" strokeWidth={2.5} /> Create your first rule
                </button>
              )}
            </div>
          )}

          {/* Rows */}
          <div className="divide-y divide-black/[0.04]">
            <AnimatePresence initial={false}>
              {filtered.map((kw, index) => {
                const threadStats = metrics[kw.id] || { total: 0, replied: 0 }
                const popularity = getPopularity(kw.id, threadStats.total)
                const successRate = getSuccessRate(kw.id, threadStats.total, threadStats.replied)

                return (
                  <motion.div
                    key={kw.id}
                    layout
                    initial={{ opacity: 0, y: -6 }}
                    animate={{ opacity: kw.is_active ? 1 : 0.55, y: 0 }}
                    exit={{ opacity: 0, height: 0, overflow: 'hidden' }}
                    transition={{ duration: 0.18 }}
                    className="grid grid-cols-[40px_1fr_100px_44px] md:grid-cols-[40px_1fr_160px_100px_100px_44px] items-center px-5 py-4 hover:bg-surface/60 group transition-colors duration-150 relative last:rounded-b-[17px]"
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

                    {/* Popularity column */}
                    <div className="hidden md:flex items-center pr-6">
                      <div className="h-1.5 w-full bg-black/[0.05] rounded-full overflow-hidden">
                        <motion.div
                          initial={{ width: 0 }}
                          animate={{ width: `${popularity}%` }}
                          transition={{ duration: 0.8, delay: index * 0.05 }}
                          className="h-full bg-text-primary rounded-full"
                        />
                      </div>
                    </div>

                    {/* Success column */}
                    <div className="hidden md:block">
                      <span className="text-[13.5px] font-bold text-text-primary tabular-nums tracking-tight">
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
      </div>
    </AppPage>
  )
}
