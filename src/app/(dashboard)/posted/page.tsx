'use client'

import { useEffect, useState, useMemo } from 'react'
import {
  CheckCircle2,
  Clock,
  ExternalLink,
  MessageCircle,
  MessageSquare,
  TrendingUp,
  Search,
  MousePointerClick,
  Send,
  ChevronDown,
  ChevronUp,
} from 'lucide-react'
import { AppPage } from '@/components/AppPage'
import { useDashboardSession } from '@/components/DashboardContext'
import { BlueskyIcon, RedditIcon, XIcon } from '@/components/Icons'
import { PageHeader } from '@/components/PageHeader'
import { createClient } from '@/utils/supabase/client'
import { IntentBadge } from '@/components/IntentBadge'
import { DataLoadError } from '@/components/DataLoadError'
import { toast } from 'sonner'

const PAGE_SIZE = 30

interface PostedReply {
  id: string
  platform: string
  sourceLabel: string
  authorLabel: string
  matchedKeyword: string
  title: string
  body: string
  discoveredAt: string
  sentAt: string
  reply: string
  threadUrl: string | null
  replyUrl: string | null
  clickedAt: string | null
  convertedAt: string | null
  revenueUsd: number
  score: number
}

interface DeliveryActivity {
  threadId: string
  platform: string
  title: string
  subject: string
  state: 'sent' | 'failed' | 'uncertain' | 'cancelled'
  message: string
  actionLabel: string
  actionHref: string
  threadUrl: string | null
  replyUrl: string | null
  updatedAt: string
}

function PlatformIcon({ platform, size = 'sm' }: { platform: string; size?: 'sm' | 'md' }) {
  const cls = size === 'md' ? 'h-[18px] w-[18px]' : 'h-3.5 w-3.5'
  const norm = platform.toLowerCase()
  if (norm === 'reddit') return <RedditIcon className={`${cls} text-[#FF4500]`} />
  if (norm === 'bluesky') return <BlueskyIcon className={`${cls} text-[#1185FE]`} />
  if (norm === 'x') return <XIcon className={`${cls} text-[#0F1419]`} />
  return <MessageCircle className={`${cls} text-gray-500`} />
}

function formatRelativeDate(dateString: string) {
  const date = new Date(dateString)
  const elapsedSeconds = Math.max(0, Math.floor((Date.now() - date.getTime()) / 1000))
  if (elapsedSeconds < 60) return 'Just now'
  if (elapsedSeconds < 3600) { const m = Math.floor(elapsedSeconds / 60); return `${m}m ago` }
  if (elapsedSeconds < 86400) { const h = Math.floor(elapsedSeconds / 3600); return `${h}h ago` }
  if (elapsedSeconds < 604800) { const d = Math.floor(elapsedSeconds / 86400); return `${d}d ago` }
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
}

function formatSentDate(dateString: string) {
  return new Date(dateString).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
}

function formatRedditTarget(value: string) {
  const normalized = value.replace(/^\/?r\//i, '').replace(/^\/+/, '')
  return normalized ? `r/${normalized}` : 'Reddit'
}

function formatAuthor(value: string, platform: string) {
  if (!value || value === 'unknown') return 'Unknown author'
  if (platform.toLowerCase() === 'reddit') return value.startsWith('u/') ? value : `u/${value}`
  return value.startsWith('@') ? value : `@${value}`
}

function parsePostedThreads(data: any[]): PostedReply[] {
  return data.map((thread) => {
    const analytics = Array.isArray(thread.reply_analytics) ? thread.reply_analytics[0] : thread.reply_analytics
    const keyword = Array.isArray(thread.keywords) ? thread.keywords[0] : thread.keywords
    const platform = thread.platform || 'unknown'
    const author = thread.author || 'unknown'
    const title = thread.title?.trim() || thread.text_content?.trim() || 'Original conversation'
    const body = thread.title?.trim() ? thread.text_content?.trim() || '' : ''
    const sendAudits = Array.isArray(thread.send_audit_log)
      ? thread.send_audit_log
      : thread.send_audit_log ? [thread.send_audit_log] : []
    const successfulSend = sendAudits
      .filter((audit: any) => audit.status === 'success')
      .sort((l: any, r: any) => String(r.created_at).localeCompare(String(l.created_at)))[0]
    const attribution = Array.isArray(thread.reply_attribution)
      ? thread.reply_attribution[0]
      : thread.reply_attribution

    return {
      id: thread.id,
      platform,
      sourceLabel: platform.toLowerCase() === 'reddit' ? formatRedditTarget(keyword?.target || '') : formatAuthor(author, platform),
      authorLabel: platform.toLowerCase() === 'reddit' ? formatAuthor(author, platform) : '',
      matchedKeyword: keyword?.term || '',
      title,
      body,
      discoveredAt: formatRelativeDate(thread.source_created_at || thread.created_at),
      sentAt: formatSentDate(analytics?.sent_at || thread.created_at),
      reply: analytics?.edited_text || analytics?.draft_text || 'Reply logged.',
      threadUrl: thread.url || null,
      replyUrl: successfulSend?.permalink || null,
      clickedAt: attribution?.clicked_at || null,
      convertedAt: attribution?.converted_at || null,
      revenueUsd: Number(attribution?.revenue_usd) || 0,
      score: Math.round(Number(thread.intent_score) || 0),
    }
  })
}

// ─── Posted Reply Card ─────────────────────────────────────────────────────────

function PostedReplyCard({ item }: { item: PostedReply }) {
  const [expanded, setExpanded] = useState(true)
  const hasConversion = Boolean(item.convertedAt)
  const hasClick = Boolean(item.clickedAt)
  const hasAttribution = hasConversion || hasClick || item.revenueUsd > 0

  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-xs overflow-hidden transition-all">
      {/* Card header — always visible */}
      <div
        className="flex items-start justify-between gap-3 px-5 py-4 cursor-pointer select-none hover:bg-gray-50/40 transition-colors"
        onClick={() => setExpanded(v => !v)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setExpanded(v => !v) }}
      >
        <div className="flex items-start gap-3 min-w-0">
          <div className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border shadow-2xs ${
            hasConversion
              ? 'border-emerald-200 bg-emerald-50'
              : hasClick
                ? 'border-blue-200 bg-blue-50'
                : 'border-gray-100 bg-[#F9F9F8]'
          }`}>
            <PlatformIcon platform={item.platform} />
          </div>

          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2 mb-1">
              <span className="text-[13.5px] font-bold text-gray-900 leading-tight">{item.sourceLabel}</span>
              {item.authorLabel && (
                <span className="text-[12px] text-gray-400 font-medium">{item.authorLabel}</span>
              )}
              {item.matchedKeyword && (
                <span className="rounded-md bg-[#EFF6FF] border border-blue-100 px-1.5 py-0.5 text-[10.5px] font-semibold text-blue-700 leading-none">
                  {item.matchedKeyword}
                </span>
              )}
            </div>
            <p className="text-[13px] text-gray-700 font-medium leading-snug line-clamp-1">{item.title}</p>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0 pt-0.5">
          {hasAttribution && (
            <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10.5px] font-semibold border ${
              hasConversion
                ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                : 'bg-blue-50 text-blue-700 border-blue-200'
            }`}>
              {hasConversion ? '✓ Converted' : '✓ Clicked'}
            </span>
          )}
          <span className="text-[11px] text-gray-400 font-medium whitespace-nowrap">{item.sentAt}</span>
          <IntentBadge score={item.score} />
          <div className="p-0.5 text-gray-400">
            {expanded
              ? <ChevronUp className="h-4 w-4 shrink-0" />
              : <ChevronDown className="h-4 w-4 shrink-0" />
            }
          </div>
        </div>
      </div>

      {/* Expanded body */}
      {expanded && (
        <div className="border-t border-gray-100">
          {/* Attribution banner */}
          {hasAttribution && (
            <div className="flex items-center gap-2.5 bg-emerald-50 border-b border-emerald-100 px-5 py-2.5">
              <TrendingUp className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
              <span className="text-[12px] font-semibold text-emerald-700">
                {hasConversion && 'Customer converted from this reply'}
                {hasClick && !hasConversion && 'Tracked link was clicked'}
                {item.revenueUsd > 0 && ` · $${item.revenueUsd.toFixed(2)} attributed`}
              </span>
            </div>
          )}

          <div className="px-5 py-4 space-y-4">
            {/* Original Thread — preserved exactly */}
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8C8C85] mb-2">Original thread</p>
              <div className="rounded-[16px] border border-[#E8E8E5] bg-[#F7F7F5] px-4 py-3.5">
                <div className="flex items-center gap-2 mb-2 text-[11px] font-medium text-[#8C8C85]">
                  <PlatformIcon platform={item.platform} />
                  <span>{item.sourceLabel}</span>
                  <span className="opacity-40">·</span>
                  <Clock className="h-3 w-3" />
                  <span>{item.discoveredAt}</span>
                </div>
                {item.title && (
                  <h4 className="text-[14px] font-semibold text-[#1C1C1A] leading-snug mb-1.5">{item.title}</h4>
                )}
                {item.body && item.body !== item.title && (
                  <p className="text-[13px] leading-relaxed text-[#4A4A45] line-clamp-4">{item.body}</p>
                )}
                {item.threadUrl && (
                  <a
                    href={item.threadUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="mt-3 inline-flex items-center gap-1.5 text-[12px] font-semibold text-[#0A84FF] hover:underline"
                  >
                    View on {item.platform} <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>

            {/* Your Reply — preserved exactly */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-[#8C8C85]">Your reply</p>
                <span className="text-[11px] text-[#8C8C85]">Sent {item.sentAt}</span>
              </div>
              <div className="rounded-[16px] border border-emerald-200 bg-[#F2FCF7] px-4 py-3.5">
                <div className="flex items-center gap-2 mb-2.5">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white shadow-sm">
                    <MessageSquare className="h-3 w-3 text-emerald-600" strokeWidth={2.3} />
                  </span>
                  <span className="text-[11px] font-bold uppercase tracking-wider text-[#3A6B50]">BuyerWatch reply</span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-[#1C1C1A]">{item.reply}</p>
              </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-end gap-2 pt-1">
              {item.threadUrl && (
                <a
                  href={item.threadUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 px-3 inline-flex items-center gap-1.5 rounded-md border border-gray-200 bg-white text-[12px] font-medium text-gray-700 hover:bg-gray-50 transition-colors cursor-pointer shadow-2xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-gray-400" />
                  View conversation
                </a>
              )}
              {item.replyUrl && (
                <a
                  href={item.replyUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="h-8 px-3.5 inline-flex items-center gap-1.5 rounded-md bg-gray-900 text-[12px] font-medium text-white hover:bg-gray-700 transition-colors cursor-pointer shadow-xs"
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  View live reply
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, loading }: {
  label: string
  value: number | string
  icon: React.ElementType
  loading: boolean
}) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-5 py-4 shadow-xs flex items-center justify-between gap-4">
      <div>
        <p className="text-[11.5px] font-semibold uppercase tracking-wide text-gray-400 mb-1">{label}</p>
        <p className="text-[26px] font-bold text-gray-900 tabular-nums leading-none">
          {loading ? <span className="text-gray-300">—</span> : value}
        </p>
      </div>
      <div className="h-10 w-10 rounded-xl bg-gray-50 border border-gray-100 flex items-center justify-center shrink-0">
        <Icon className="h-5 w-5 text-gray-400" />
      </div>
    </div>
  )
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function PostedPage() {
  const [posted, setPosted] = useState<PostedReply[]>([])
  const [deliveryActivity, setDeliveryActivity] = useState<DeliveryActivity[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [totalCount, setTotalCount] = useState(0)
  const [loadFailed, setLoadFailed] = useState(false)
  const [loadAttempt, setLoadAttempt] = useState(0)
  const [searchQuery, setSearchQuery] = useState('')
  const [platformFilter, setPlatformFilter] = useState<'all' | 'reddit' | 'bluesky'>('all')
  const [supabase] = useState(createClient)
  const { userId } = useDashboardSession()

  useEffect(() => {
    let cancelled = false

    async function fetchPosted() {
      setLoading(true)
      setLoadFailed(false)

      try {
        const [pageResult, countResult, activityResult] = await Promise.all([
          supabase
            .from('monitored_threads')
            .select('id, platform, author, title, text_content, url, intent_score, source_created_at, created_at, reply_analytics(draft_text, edited_text, sent_at), keywords(term, target), send_audit_log(status, permalink, created_at), reply_attribution(clicked_at, converted_at, revenue_usd)')
            .eq('user_id', userId)
            .eq('status', 'replied')
            .order('created_at', { ascending: false })
            .range(0, PAGE_SIZE - 1),
          supabase
            .from('monitored_threads')
            .select('id', { count: 'exact', head: true })
            .eq('user_id', userId)
            .eq('status', 'replied'),
          fetch('/api/replies/activity', { cache: 'no-store' }),
        ])
        if (pageResult.error) throw pageResult.error
        if (countResult.error) throw countResult.error
        if (cancelled) return

        const parsed = parsePostedThreads(pageResult.data ?? [])
        if (activityResult.ok) {
          const payload = await activityResult.json() as { activity?: DeliveryActivity[] }
          setDeliveryActivity(payload.activity ?? [])
        }
        setPosted(parsed)
        setTotalCount(countResult.count ?? pageResult.data?.length ?? 0)
        setHasMore((pageResult.data?.length ?? 0) === PAGE_SIZE)
      } catch (error) {
        if (cancelled) return
        console.error('[posted] Unable to load posted replies', error)
        setLoadFailed(true)
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    void fetchPosted()
    return () => { cancelled = true }
  }, [loadAttempt, supabase, userId])

  async function loadMorePosted() {
    if (loadingMore || !hasMore) return
    setLoadingMore(true)
    try {
      const from = posted.length
      const { data, error } = await supabase
        .from('monitored_threads')
        .select('id, platform, author, title, text_content, url, intent_score, source_created_at, created_at, reply_analytics(draft_text, edited_text, sent_at), keywords(term, target), send_audit_log(status, permalink, created_at), reply_attribution(clicked_at, converted_at, revenue_usd)')
        .eq('user_id', userId)
        .eq('status', 'replied')
        .order('created_at', { ascending: false })
        .range(from, from + PAGE_SIZE - 1)
      if (error) throw error

      setPosted(current => [...current, ...parsePostedThreads(data ?? [])])
      setHasMore((data?.length ?? 0) === PAGE_SIZE)
    } catch (error) {
      console.error('[posted] Unable to load more posted replies', error)
      toast.error('Unable to load more replies.')
    } finally {
      setLoadingMore(false)
    }
  }

  const filtered = useMemo(() => {
    return posted.filter(item => {
      if (platformFilter !== 'all' && item.platform.toLowerCase() !== platformFilter) return false
      if (!searchQuery.trim()) return true
      const q = searchQuery.toLowerCase()
      return (
        item.title?.toLowerCase().includes(q) ||
        item.body?.toLowerCase().includes(q) ||
        item.sourceLabel?.toLowerCase().includes(q) ||
        item.authorLabel?.toLowerCase().includes(q) ||
        item.matchedKeyword?.toLowerCase().includes(q) ||
        item.reply?.toLowerCase().includes(q)
      )
    })
  }, [posted, searchQuery, platformFilter])

  const totalClicks = useMemo(() => posted.filter(p => Boolean(p.clickedAt)).length, [posted])
  const totalConversions = useMemo(() => posted.filter(p => Boolean(p.convertedAt)).length, [posted])

  return (
    <AppPage>
      <div className="flex w-full flex-col pb-16">
        <PageHeader
          title="Posted Replies"
          action={
            !loading && totalCount > 0 ? (
              <span className="rounded-full border border-gray-200 bg-white px-3 py-1 text-[12px] font-semibold tabular-nums text-gray-600 shadow-2xs">
                {totalCount} {totalCount === 1 ? 'reply' : 'replies'}
              </span>
            ) : undefined
          }
        />

        {loadFailed ? (
          <DataLoadError
            title="Couldn't load replies"
            description="Your posted reply history is still safe. Check your connection and try loading it again."
            onRetry={() => setLoadAttempt(attempt => attempt + 1)}
            className="flex-1"
          />
        ) : (
          <div className="space-y-5 mt-1">
            {/* Stats strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <StatCard label="Sent" value={totalCount} icon={Send} loading={loading} />
              <StatCard label="Clicks" value={totalClicks} icon={MousePointerClick} loading={loading} />
              <StatCard label="Attributed conversions" value={totalConversions} icon={TrendingUp} loading={loading} />
            </div>

            {deliveryActivity.length > 0 && (
              <section aria-labelledby="delivery-activity-heading" className="rounded-xl border border-gray-200 bg-white p-4 shadow-xs">
                <div className="mb-3 flex items-center justify-between">
                  <h2 id="delivery-activity-heading" className="text-sm font-bold text-gray-900">Delivery activity</h2>
                  <span className="text-[11px] text-gray-500">Latest attempts</span>
                </div>
                <div className="divide-y divide-gray-100">
                  {deliveryActivity.slice(0, 8).map(item => {
                    const tone = item.state === 'sent'
                      ? 'bg-emerald-50 text-emerald-700'
                      : item.state === 'uncertain' || item.state === 'failed'
                        ? 'bg-red-50 text-red-700'
                        : item.state === 'cancelled'
                          ? 'bg-amber-50 text-amber-700'
                          : 'bg-blue-50 text-blue-700'
                    return (
                      <div key={item.threadId} className="flex items-start gap-3 py-3">
                        <span className={`mt-0.5 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${tone}`}>{item.state}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-semibold text-gray-900">{item.title}</p>
                          <p className="mt-0.5 text-[11px] leading-4 text-gray-600">{item.message}</p>
                          <p className="mt-1 truncate text-[10px] text-gray-400">{item.subject}</p>
                        </div>
                        <span className="shrink-0 text-[10px] text-gray-400">{formatRelativeDate(item.updatedAt)}</span>
                      </div>
                    )
                  })}
                </div>
              </section>
            )}

            {/* Filter bar */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="relative flex-1 sm:flex-initial">
                <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search replies…"
                  className="h-8.5 w-full sm:w-64 rounded-lg border border-gray-200 bg-white pl-8.5 pr-3 text-[12.5px] text-gray-900 placeholder-gray-400 focus:border-gray-400 focus:outline-none transition-colors shadow-2xs"
                />
              </div>
              <div className="flex items-center gap-1.5">
                {(['all', 'reddit', 'bluesky'] as const).map(p => (
                  <button
                    key={p}
                    type="button"
                    onClick={() => setPlatformFilter(p)}
                    className={`h-8 px-3 rounded-lg text-[12px] font-medium transition-colors cursor-pointer ${
                      platformFilter === p
                        ? 'bg-gray-900 text-white shadow-xs'
                        : 'border border-gray-200 bg-white text-gray-600 hover:bg-gray-50 hover:text-gray-900 shadow-2xs'
                    }`}
                  >
                    {p === 'all' ? 'All' : p === 'reddit' ? 'Reddit' : 'Bluesky'}
                  </button>
                ))}
              </div>
            </div>

            {/* Replies List */}
            <div>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="rounded-xl border border-gray-200 bg-white p-5 animate-pulse space-y-3">
                      <div className="h-4 bg-gray-200 rounded w-1/4" />
                      <div className="h-3 bg-gray-100 rounded w-3/4" />
                    </div>
                  ))}
                </div>
              ) : filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-gray-200 bg-white p-14 text-center">
                  <div className="h-12 w-12 rounded-2xl bg-gray-50 flex items-center justify-center mb-3">
                    <CheckCircle2 className="h-6 w-6 text-gray-300" />
                  </div>
                  <p className="text-[14.5px] font-semibold text-gray-900 mb-1">
                    {searchQuery || platformFilter !== 'all' ? 'No matching replies' : 'No posted replies yet'}
                  </p>
                  <p className="text-[13px] text-gray-400 max-w-xs leading-relaxed">
                    {searchQuery || platformFilter !== 'all'
                      ? 'Adjust your search or filter.'
                      : 'Approved replies will appear here as a live audit log once sent.'}
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {filtered.map((item) => (
                    <PostedReplyCard
                      key={item.id}
                      item={item}
                    />
                  ))}
                </div>
              )}

              {!loading && hasMore && (
                <div className="flex justify-center mt-6">
                  <button
                    type="button"
                    onClick={loadMorePosted}
                    disabled={loadingMore}
                    className="rounded-lg border border-gray-200 bg-white px-5 py-2 text-[12.5px] font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50 shadow-2xs transition-colors cursor-pointer"
                  >
                    {loadingMore ? 'Loading…' : 'Load more'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </AppPage>
  )
}
