'use client'

import React from 'react'
import {
  Flame,
  MessageSquare,
  CheckCircle2,
  ShieldCheck,
  Send,
  Sparkles,
  SlidersHorizontal,
  ChevronDown,
  Clock,
  Radio,
  Search,
  ArrowUpRight,
  Zap,
} from 'lucide-react'
import { FaReddit } from 'react-icons/fa6'

export function DeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[1060px] select-none pt-2 pb-6 sm:pb-10">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-[480px] w-[88%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#0A84FF]/16 via-[#0A84FF]/4 to-transparent blur-[130px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full">
        {/* ═══════════════════════════════════════════════
            MACBOOK PRO (Centerpiece Window)
            ═══════════════════════════════════════════════ */}
        <div className="relative mx-auto w-full">
          {/* Display Lid Outer Bezel */}
          <div className="relative rounded-t-[18px] border-[1.5px] border-[#383B46] bg-[#0E0F14] p-[5px] shadow-[0_30px_95px_rgba(0,0,0,0.75)] ring-1 ring-white/10 sm:rounded-t-[24px] sm:p-[8px] md:p-[11px]">
            {/* Screen Inner Display */}
            <div className="relative overflow-hidden rounded-t-[12px] bg-[#FAF9F6] sm:rounded-t-[16px]">
              {/* macOS Window Titlebar */}
              <div className="relative z-20 flex h-8 items-center justify-between border-b border-black/[0.08] bg-[#EDEDEB] px-3.5 sm:h-9 sm:px-4">
                {/* Traffic Lights */}
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                </div>

                {/* Camera Notch */}
                <div className="absolute top-0 left-1/2 z-30 flex h-[12px] w-[80px] -translate-x-1/2 items-center justify-center rounded-b-[6px] bg-[#0E0F14] shadow-xs sm:h-[16px] sm:w-[110px] sm:rounded-b-[8px]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-[#1A1B22] ring-1 ring-white/20 sm:h-1.5 sm:w-1.5" />
                    <span className="h-1 w-1 rounded-full bg-[#0E2A1E] ring-1 ring-[#10B981]/50" />
                  </div>
                </div>

                {/* URL Badge */}
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1.5 rounded-md border border-black/[0.06] bg-white/95 px-2.5 py-0.5 text-[11px] font-medium text-[#4B5563] shadow-xs">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                    <span className="font-semibold text-[#111827]">buyerwatch.co</span>
                    <span className="text-[#9CA3AF]">/inbox</span>
                  </div>
                </div>
              </div>

              {/* ═══════════════════════════════════════════════
                  HIGH-FIDELITY VECTOR APP WINDOW (Ravenpath/Parley style)
                  ═══════════════════════════════════════════════ */}
              <div className="grid grid-cols-1 md:grid-cols-[230px_1fr] bg-white text-left antialiased">
                {/* ── LEFT SIDEBAR ── */}
                <aside className="hidden md:flex flex-col justify-between border-r border-[#E8EAE6] bg-[#F7F7F5] p-3.5 text-[#374151]">
                  <div>
                    {/* Workspace Selector */}
                    <div className="flex items-center justify-between rounded-lg border border-black/[0.06] bg-white px-2.5 py-2 shadow-xs">
                      <div className="flex items-center gap-2">
                        <div className="flex h-6 w-6 items-center justify-center rounded-md bg-[#0A84FF] text-white shadow-xs">
                          <Flame className="h-3.5 w-3.5 fill-white" />
                        </div>
                        <div>
                          <div className="text-[12.5px] font-bold text-[#111827] leading-tight">BuyerWatch</div>
                          <div className="text-[10px] text-[#6B7280]">Real-time leads</div>
                        </div>
                      </div>
                      <ChevronDown className="h-3.5 w-3.5 text-[#9CA3AF]" />
                    </div>

                    {/* Navigation Groups */}
                    <div className="mt-4 space-y-4">
                      {/* Group 1: Workspace */}
                      <div>
                        <div className="px-2 text-[10px] font-bold tracking-wider text-[#9CA3AF] uppercase">
                          Workspace
                        </div>
                        <div className="mt-1.5 space-y-0.5">
                          <div className="flex items-center justify-between rounded-md bg-[#111827] px-2.5 py-1.5 text-[12.5px] font-semibold text-white shadow-xs">
                            <div className="flex items-center gap-2">
                              <Radio className="h-3.5 w-3.5 text-[#62B4FF]" />
                              <span>Inbox</span>
                            </div>
                            <span className="rounded-full bg-white/20 px-1.5 py-0.2 text-[10px] font-bold text-white">
                              8
                            </span>
                          </div>

                          <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-[#4B5563] hover:bg-black/[0.04] transition-colors">
                            <div className="flex items-center gap-2">
                              <MessageSquare className="h-3.5 w-3.5 text-[#6B7280]" />
                              <span>Drafts ready</span>
                            </div>
                            <span className="text-[11px] text-[#9CA3AF]">12</span>
                          </div>

                          <div className="flex items-center justify-between rounded-md px-2.5 py-1.5 text-[12.5px] font-medium text-[#4B5563] hover:bg-black/[0.04] transition-colors">
                            <div className="flex items-center gap-2">
                              <Search className="h-3.5 w-3.5 text-[#6B7280]" />
                              <span>Keywords</span>
                            </div>
                            <span className="text-[11px] text-[#9CA3AF]">24</span>
                          </div>
                        </div>
                      </div>

                      {/* Group 2: Sources */}
                      <div>
                        <div className="px-2 text-[10px] font-bold tracking-wider text-[#9CA3AF] uppercase">
                          Monitored Sources
                        </div>
                        <div className="mt-1.5 space-y-0.5 text-[12px]">
                          <div className="flex items-center justify-between rounded-md px-2.5 py-1 text-[#4B5563]">
                            <div className="flex items-center gap-2">
                              <FaReddit className="h-3.5 w-3.5 text-[#FF4500]" />
                              <span>Reddit</span>
                            </div>
                            <span className="text-[10px] font-semibold text-[#059669]">Active</span>
                          </div>

                          <div className="flex items-center justify-between rounded-md px-2.5 py-1 text-[#4B5563]">
                            <div className="flex items-center gap-2">
                              <div className="h-3.5 w-3.5 rounded-full bg-[#0085FF]/15 text-[#0085FF] flex items-center justify-center text-[8px] font-black">
                                🦋
                              </div>
                              <span>Bluesky</span>
                            </div>
                            <span className="text-[10px] font-semibold text-[#059669]">Active</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sidebar Footer */}
                  <div className="rounded-lg border border-black/[0.05] bg-white p-2 text-[11px] shadow-2xs">
                    <div className="flex items-center justify-between font-semibold text-[#111827]">
                      <span>Auto-pilot</span>
                      <span className="rounded-full bg-[#ECFDF5] px-1.5 py-0.2 text-[9.5px] font-bold text-[#059669]">
                        ON
                      </span>
                    </div>
                    <p className="mt-0.5 text-[9.5px] text-[#6B7280] leading-tight">
                      Policy guardrails enforced before each reply.
                    </p>
                  </div>
                </aside>

                {/* ── RIGHT MAIN PANEL ── */}
                <main className="p-3.5 sm:p-5 md:p-6 bg-white overflow-hidden flex flex-col justify-between min-h-[420px] sm:min-h-[460px]">
                  <div>
                    {/* Header Row */}
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#ECEEEA] pb-3 sm:pb-3.5">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="text-[13px] font-medium text-[#6B7280]">Inbox /</span>
                          <h3 className="text-[16px] sm:text-[18px] md:text-[20px] font-extrabold tracking-tight text-[#0A0A0A]">
                            Approval needed
                          </h3>
                        </div>
                        <p className="mt-0.5 text-[11.5px] text-[#6B7280]">
                          8 high-intent buyer conversations detected in the last hour.
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="inline-flex items-center gap-1 rounded-full border border-[#10B981]/30 bg-[#ECFDF5] px-2.5 py-1 text-[11px] font-bold text-[#059669]">
                          <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                          Live scanner
                        </span>
                        <div className="hidden sm:flex items-center gap-1 rounded-md border border-black/[0.08] px-2 py-1 text-[11px] font-medium text-[#4B5563]">
                          <SlidersHorizontal className="h-3 w-3" />
                          <span>Intent ≥ 80%</span>
                        </div>
                      </div>
                    </div>

                    {/* Urgent Alert Banner (Ravenpath-inspired style) */}
                    <div className="mt-3.5 flex items-center justify-between rounded-xl border border-[#FDE68A] bg-[#FFFBEB] p-2.5 sm:p-3 shadow-2xs">
                      <div className="flex items-center gap-2.5">
                        <div className="flex h-7 w-7 sm:h-8 sm:w-8 shrink-0 items-center justify-center rounded-lg bg-[#F59E0B] text-white shadow-xs">
                          <Zap className="h-4 w-4 fill-white" />
                        </div>
                        <div>
                          <div className="text-[12px] sm:text-[13px] font-extrabold text-[#78350F]">
                            Send 8 approved Reddit & Bluesky replies?
                          </div>
                          <div className="text-[10px] sm:text-[11px] text-[#92400E]">
                            8 tailored AI drafts ready · avg intent score <strong className="font-bold">95%</strong> · safety policies verified
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        className="hidden sm:inline-flex items-center gap-1 rounded-lg bg-[#111827] px-3 py-1.5 text-[11px] font-bold text-white shadow-xs hover:bg-black transition-colors"
                      >
                        <Sparkles className="h-3 w-3 text-[#FBBF24]" />
                        Approve all
                      </button>
                    </div>

                    {/* High Intent Lead Rows */}
                    <div className="mt-3.5 space-y-2.5">
                      {/* Lead Item 1 (Focused High Intent) */}
                      <div className="rounded-xl border border-[#0A84FF]/30 bg-[#F8FAFC] p-3 sm:p-3.5 shadow-xs ring-1 ring-[#0A84FF]/15 transition-all">
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="flex items-center gap-1 rounded-md bg-[#FF4500]/10 px-2 py-0.5 text-[11px] font-bold text-[#FF4500]">
                              <FaReddit className="h-3 w-3" />
                              r/SaaS
                            </span>
                            <span className="text-[11px] text-[#9CA3AF]">• 14m ago</span>
                            <span className="rounded-full bg-[#ECFDF5] px-2 py-0.2 text-[10.5px] font-extrabold text-[#059669]">
                              98% Buying Intent
                            </span>
                          </div>

                          <span className="hidden sm:flex items-center gap-1 text-[10.5px] font-semibold text-[#059669]">
                            <ShieldCheck className="h-3.5 w-3.5 text-[#10B981]" />
                            Subreddit rules safe
                          </span>
                        </div>

                        {/* Title & snippet */}
                        <div className="mt-1.5">
                          <h4 className="text-[13px] sm:text-[14px] font-bold text-[#0F172A] leading-snug">
                            Need advice on getting the first 10–100 users for our SaaS startup
                          </h4>
                          <p className="mt-0.5 text-[11px] sm:text-[12px] text-[#475569] leading-relaxed line-clamp-1">
                            "Building a B2B sales tool. We've tried cold outreach with low conversion. What channels actually drive early adopters?"
                          </p>
                        </div>

                        {/* AI Draft preview box */}
                        <div className="mt-2.5 rounded-lg border border-[#0A84FF]/20 bg-white p-2.5 shadow-2xs">
                          <div className="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-[#0A84FF]">
                            <span className="flex items-center gap-1">
                              <Sparkles className="h-3 w-3" />
                              AI Draft Reply (Context-aware)
                            </span>
                            <span className="text-[#64748B] font-medium lowercase">FTC disclosure attached</span>
                          </div>
                          <p className="mt-1 text-[11px] sm:text-[12px] text-[#1E293B] leading-relaxed italic">
                            "Hey! For early SaaS users, monitoring active Reddit discussions in r/SaaS with automated keyword alerts had a 4x higher reply rate than cold email..."
                          </p>

                          <div className="mt-2 flex items-center justify-between pt-2 border-t border-black/[0.04]">
                            <div className="flex items-center gap-2 text-[10px] text-[#64748B]">
                              <span className="flex items-center gap-0.5">
                                <Clock className="h-3 w-3" /> Auto-delay 3m
                              </span>
                              <span>•</span>
                              <span>Natural voice</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                className="rounded px-2 py-0.5 text-[11px] font-semibold text-[#64748B] hover:bg-black/[0.04]"
                              >
                                Edit draft
                              </button>
                              <button
                                type="button"
                                className="flex items-center gap-1 rounded-md bg-[#0A84FF] px-2.5 py-1 text-[11px] font-bold text-white shadow-xs hover:bg-[#0070DF]"
                              >
                                <Send className="h-3 w-3" />
                                Approve & Post
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Lead Item 2 */}
                      <div className="rounded-xl border border-[#ECEEEA] bg-white p-3 shadow-2xs hover:border-[#CBD5E1] transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="flex items-center gap-1 rounded-md bg-[#FF4500]/10 px-2 py-0.5 text-[11px] font-bold text-[#FF4500]">
                              <FaReddit className="h-3 w-3" />
                              r/Entrepreneur
                            </span>
                            <span className="text-[11px] text-[#9CA3AF]">• 42m ago</span>
                            <span className="rounded-full bg-[#ECFDF5] px-2 py-0.2 text-[10.5px] font-extrabold text-[#059669]">
                              94% Buying Intent
                            </span>
                          </div>

                          <span className="flex items-center gap-1 rounded bg-[#F1F5F9] px-2 py-0.5 text-[10px] font-bold text-[#475569]">
                            <CheckCircle2 className="h-3 w-3 text-[#10B981]" /> Draft ready
                          </span>
                        </div>

                        <div className="mt-1">
                          <h4 className="text-[13px] font-bold text-[#0F172A] leading-snug">
                            Labor is taking up 37% of our sales — looking for better operational software
                          </h4>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Bottom Action Footer */}
                  <div className="mt-4 flex items-center justify-between border-t border-[#ECEEEA] pt-3 text-[12px]">
                    <span className="text-[#64748B] text-[11.5px]">
                      Showing 2 of 8 priority signals &bull; <span className="text-[#0A84FF] font-semibold cursor-pointer hover:underline">+6 more in queue</span>
                    </span>

                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg bg-[#111827] px-4 py-1.5 text-[12px] font-bold text-white shadow-xs hover:bg-black transition-colors"
                    >
                      <span>Approve & publish all (8)</span>
                      <ArrowUpRight className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </main>
              </div>
            </div>
          </div>

          {/* Display Hinge */}
          <div className="relative mx-auto h-[3.5px] w-[86%] bg-[#1E2028] rounded-t-[1px]" />

          {/* Laptop Base (Aluminum Unibody) */}
          <div className="relative -ml-[2.5%] w-[105%]">
            <div className="relative h-[11px] rounded-b-[4px] border-t border-white/60 bg-gradient-to-b from-[#E0E4EA] via-[#C2C7CF] to-[#A1A7B0] shadow-[0_2px_5px_rgba(0,0,0,0.3)] sm:h-[14px] sm:rounded-b-[6px]">
              <div className="mx-auto h-[4px] w-[70px] rounded-b-[4px] bg-gradient-to-b from-[#7A7F87] to-[#9298A1] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] sm:h-[5.5px] sm:w-[110px] sm:rounded-b-[6px]" />
            </div>
            <div className="mx-auto h-[2.5px] w-[96%] rounded-b-[10px] bg-[#6B7078]" />
            <div className="mx-auto h-[14px] w-[94%] bg-black/40 blur-[15px]" />
          </div>
        </div>
      </div>
    </div>
  )
}
