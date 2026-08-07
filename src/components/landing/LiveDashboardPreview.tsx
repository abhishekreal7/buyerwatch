import {
  Bell,
  ChevronRight,
  FileText,
  LayoutDashboard,
  MessageCircle,
  Search,
  Send,
  Settings,
  Sparkles,
  Target,
} from 'lucide-react'

import { BrandLogo } from '@/components/BrandLogo'
import { RedditIcon } from '@/components/Icons'

type PreviewPostProps = {
  age: string
  excerpt: string
  matchedSignal: string
  score: number
  title: string
}

function PreviewPost({ age, excerpt, matchedSignal, score, title }: PreviewPostProps) {
  return (
    <article className="rounded-[16px] border border-[#DCE5EE] bg-white p-4 shadow-[0_5px_16px_rgba(19,43,67,0.04)] sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-[11px] font-semibold text-[#536473] sm:text-[12px]">
          <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[#FFF1EA] text-[#FF4500]">
            <RedditIcon className="h-3.5 w-3.5" />
          </span>
          <span className="truncate text-[#263746]">r/SaaS</span>
          <span aria-hidden="true" className="text-[#A9B5BF]">•</span>
          <span className="shrink-0 text-[#7A8996]">{age}</span>
        </div>
        <span className="hidden shrink-0 items-center gap-1 text-[11px] font-semibold text-[#5E6C78] sm:inline-flex">
          Open post <ChevronRight className="h-3.5 w-3.5" />
        </span>
      </div>

      <h3 className="mt-3 text-[14px] font-bold leading-[1.35] tracking-[-0.025em] text-[#111D28] sm:text-[16px]">
        {title}
      </h3>
      <p className="mt-1.5 line-clamp-2 text-[12px] leading-[1.55] text-[#5B6B79] sm:text-[13px]">
        {excerpt}
      </p>

      <div className="mt-3 flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[#DDF9EB] px-2.5 py-1 text-[10px] font-bold text-[#087A45] sm:text-[11px]">
          <span className="h-1.5 w-1.5 rounded-full bg-[#0BCB70]" />
          {score} · Buying intent
        </span>
        <span className="text-[10px] font-medium text-[#7B8995] sm:text-[11px]">Matched: “{matchedSignal}”</span>
        <span className="hidden rounded-full bg-[#F1F5F8] px-2 py-1 text-[10px] font-semibold text-[#627180] lg:inline-flex">
          Policy checked
        </span>
      </div>
    </article>
  )
}

const navigation = [
  { icon: LayoutDashboard, label: 'Dashboard', active: true },
  { icon: FileText, label: 'Drafts ready', badge: '8' },
  { icon: Target, label: 'Opportunities' },
  { icon: Send, label: 'Posted' },
]

export function LiveDashboardPreview() {
  return (
    <section
      aria-label="BuyerWatch workspace preview"
      className="overflow-hidden rounded-[22px] border border-[#D7E0E8] bg-[#F7F9FB] text-[#111D28] shadow-[0_22px_65px_rgba(36,57,79,0.14)] sm:rounded-[26px]"
    >
      <div className="grid min-h-[590px] grid-cols-1 lg:grid-cols-[188px_minmax(0,1fr)]">
        <aside className="hidden flex-col border-r border-[#E4EAF0] bg-white p-4 lg:flex">
          <div className="px-1 pt-1">
            <BrandLogo size="sm" />
          </div>

          <nav className="mt-8 space-y-1" aria-label="Workspace navigation">
            {navigation.map(({ icon: Icon, label, active, badge }) => (
              <div
                key={label}
                className={`flex h-9 items-center gap-2.5 rounded-[10px] px-2.5 text-[12px] font-semibold ${
                  active ? 'bg-[#EEF4FA] text-[#132030]' : 'text-[#657482]'
                }`}
              >
                <Icon className="h-4 w-4" strokeWidth={active ? 2.2 : 1.9} />
                <span>{label}</span>
                {badge && <span className="ml-auto text-[10px] font-bold text-[#0A84FF]">{badge}</span>}
              </div>
            ))}
          </nav>

          <div className="mt-auto border-t border-[#EDF1F4] pt-4">
            <div className="flex items-center gap-2.5 px-2.5 text-[12px] font-semibold text-[#657482]">
              <Settings className="h-4 w-4" />
              Settings
            </div>
            <div className="mt-5 rounded-[12px] border border-[#E5EBF0] bg-[#FBFCFD] p-3">
              <p className="text-[10px] font-bold uppercase tracking-[0.08em] text-[#83919D]">Signal plan</p>
              <p className="mt-1 text-[12px] font-bold text-[#263746]">172 signals left</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-[#E5EBF0]">
                <div className="h-full w-[46%] rounded-full bg-[#0A84FF]" />
              </div>
            </div>
          </div>
        </aside>

        <div className="min-w-0">
          <header className="flex h-14 items-center justify-between gap-3 border-b border-[#E4EAF0] bg-white px-4 sm:px-5">
            <div className="flex min-w-0 items-center gap-2.5 lg:hidden">
              <BrandLogo compact size="sm" />
              <span className="text-[13px] font-bold text-[#263746]">BuyerWatch</span>
            </div>
            <div className="hidden min-w-0 flex-1 items-center lg:flex">
              <div className="flex h-8 w-full max-w-[250px] items-center gap-2 rounded-[10px] bg-[#F4F6F8] px-3 text-[11px] font-medium text-[#94A0AA]">
                <Search className="h-3.5 w-3.5" />
                Search conversations…
              </div>
            </div>
            <div className="ml-auto flex items-center gap-2">
              <span className="hidden items-center gap-1.5 rounded-full border border-[#DCE5EE] bg-white px-2.5 py-1.5 text-[10px] font-semibold text-[#556573] sm:inline-flex">
                <span className="h-1.5 w-1.5 rounded-full bg-[#0BCB70]" />
                Monitoring live
              </span>
              <span className="inline-flex h-8 w-8 items-center justify-center rounded-[10px] border border-[#E1E8EE] text-[#647482]">
                <Bell className="h-3.5 w-3.5" />
              </span>
            </div>
          </header>

          <div className="p-4 sm:p-5 lg:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-[18px] font-extrabold tracking-[-0.04em] text-[#111D28] sm:text-[22px]">Overview</p>
                <p className="mt-0.5 text-[11px] font-medium text-[#788895] sm:text-[12px]">High-intent buyer conversations, ready to review.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[#EAF5FF] px-2.5 py-1.5 text-[10px] font-bold text-[#0878E8] sm:text-[11px]">
                <Sparkles className="h-3.5 w-3.5" />
                3 new today
              </span>
            </div>

            <div className="mt-4 grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {[
                { label: 'Conversations found', value: '48', detail: 'Last 7 days' },
                { label: 'High intent', value: '12', detail: 'Worth a reply', accent: true },
                { label: 'Drafts ready', value: '8', detail: 'Review now' },
                { label: 'Replies sent', value: '14', detail: 'This week' },
              ].map(({ label, value, detail, accent }) => (
                <div key={label} className="rounded-[13px] border border-[#E1E8EE] bg-white p-3 sm:p-3.5">
                  <p className="text-[9px] font-bold uppercase tracking-[0.045em] text-[#748391] sm:text-[10px]">{label}</p>
                  <div className="mt-2 flex items-end justify-between gap-2">
                    <span className="text-[20px] font-extrabold leading-none tracking-[-0.05em] text-[#132030] sm:text-[24px]">{value}</span>
                    <span className={`text-right text-[9px] font-bold sm:text-[10px] ${accent ? 'text-[#058B56]' : 'text-[#7A8996]'}`}>{detail}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-5 flex items-center justify-between gap-3 border-b border-[#E4EAF0] pb-3">
              <div className="flex max-w-full items-center gap-1 overflow-hidden rounded-[10px] bg-[#EEF2F5] p-1 text-[10px] font-bold sm:text-[11px]">
                <span className="rounded-[7px] bg-white px-2.5 py-1.5 text-[#152230] shadow-[0_1px_2px_rgba(24,39,50,0.08)]">All</span>
                <span className="whitespace-nowrap px-2 py-1.5 text-[#647482]">High intent <b className="ml-0.5 text-[#0A84FF]">12</b></span>
                <span className="hidden whitespace-nowrap px-2 py-1.5 text-[#647482] sm:inline">Dismissed</span>
              </div>
              <span className="hidden text-[10px] font-semibold text-[#687886] sm:block">Ranked by buyer intent</span>
            </div>

            <div className="mt-4 space-y-3">
              <PreviewPost
                age="12m ago"
                score={96}
                matchedSignal="first customers"
                title="Need advice on getting the first 10–100 users for my SaaS startup"
                excerpt="Building is fine, but distribution is not. I have tried social posts without traction—what actually brings early B2B SaaS customers?"
              />
              <PreviewPost
                age="28m ago"
                score={93}
                matchedSignal="customer acquisition"
                title="Where do I find agencies managing YouTube for business clients?"
                excerpt="I sent tailored outreach and got silence. I need a repeatable way to reach businesses using YouTube to acquire customers before I pivot."
              />
            </div>

            <div className="mt-4 flex items-center justify-between rounded-[12px] border border-[#D9E8F5] bg-[#F1F8FF] px-3 py-2.5 text-[10px] sm:text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-semibold text-[#2B516E]">
                <MessageCircle className="h-3.5 w-3.5 text-[#0A84FF]" />
                Replies stay in your review queue until you approve them.
              </span>
              <span className="hidden font-bold text-[#0878E8] sm:block">Open drafts</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
