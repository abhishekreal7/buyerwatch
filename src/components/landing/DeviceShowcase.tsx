'use client'

import React from 'react'
import { FaReddit } from 'react-icons/fa6'
import { Sparkles, Copy, ExternalLink, X, RefreshCw, ShieldAlert, ChevronDown, Clock } from 'lucide-react'

export function DeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[1060px] select-none pt-2 pb-6 sm:pb-10">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-[480px] w-[88%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#0A84FF]/14 via-[#0A84FF]/4 to-transparent blur-[130px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full">
        {/* ═══════════════════════════════════════════════
            MACBOOK PRO FRAME
            ═══════════════════════════════════════════════ */}
        <div className="relative mx-auto w-full">
          {/* Display Lid Outer Bezel */}
          <div className="relative rounded-t-[18px] border-[1.5px] border-[#383B46] bg-[#0E0F14] p-[5px] shadow-[0_32px_100px_rgba(0,0,0,0.75)] ring-1 ring-white/10 sm:rounded-t-[24px] sm:p-[8px] md:p-[11px]">

            {/* Screen Inner Display */}
            <div className="relative overflow-hidden rounded-t-[12px] sm:rounded-t-[16px]">

              {/* ── macOS Chrome Bar ── */}
              <div className="relative z-20 flex h-8 items-center justify-between border-b border-[#E0E0DC] bg-[#EEEDE9] px-3.5 sm:h-9 sm:px-4">
                {/* Traffic Lights */}
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  <span className="h-[11px] w-[11px] rounded-full bg-[#FF5F56] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                  <span className="h-[11px] w-[11px] rounded-full bg-[#FFBD2E] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                  <span className="h-[11px] w-[11px] rounded-full bg-[#27C93F] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                </div>
                {/* Camera Notch */}
                <div className="absolute top-0 left-1/2 z-30 flex h-[13px] w-[82px] -translate-x-1/2 items-center justify-center rounded-b-[6px] bg-[#0E0F14] sm:h-[16px] sm:w-[112px]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-[#1A1B22] ring-1 ring-white/20 sm:h-[5px] sm:w-[5px]" />
                    <span className="h-1 w-1 rounded-full bg-[#0E2A1E] ring-1 ring-[#10B981]/50" />
                  </div>
                </div>
                {/* URL bar */}
                <div className="flex items-center gap-1.5 rounded-md border border-[#D0CFC9] bg-white/90 px-2.5 py-[3px] text-[11px] text-[#6B7280] shadow-xs">
                  <span className="h-[6px] w-[6px] rounded-full bg-[#10B981]" />
                  <span className="font-semibold text-[#111827]">buyerwatch.co</span>
                  <span className="text-[#9CA3AF]">/inbox</span>
                </div>
              </div>

              {/* ═══════════════════════════════════════════════
                  HIGH-FIDELITY APP WINDOW
                  Inspired by Neurix / Parley / Ravenpath quality
                  ═══════════════════════════════════════════════ */}
              <div className="flex min-h-[360px] sm:min-h-[420px] md:min-h-[480px] bg-[#F7F6F3] text-[#1A1A1A]">

                {/* ── LEFT PANEL: Live Signals ── */}
                <div className="flex w-[240px] shrink-0 flex-col border-r border-[#E3E2DE] bg-[#F7F6F3]">

                  {/* Left Header */}
                  <div className="px-4 pt-4 pb-3">
                    <div className="text-[13px] font-bold text-[#111827] leading-tight">Live signals</div>
                    <div className="mt-0.5 text-[11.5px] text-[#6B7280] leading-snug">
                      Reddit conversations BuyerWatch is monitoring
                    </div>
                  </div>

                  {/* Signal Count Badge */}
                  <div className="mx-4 mb-3 flex items-center justify-between rounded-md border border-[#E3E2DE] bg-white px-2.5 py-1.5 shadow-xs">
                    <div className="flex items-center gap-1.5">
                      <span className="h-2 w-2 rounded-full bg-[#10B981] animate-pulse" />
                      <span className="text-[11.5px] font-semibold text-[#111827]">8 replies to prepare</span>
                    </div>
                    <div className="rounded border border-[#E3E2DE] px-1 py-0.2 text-[10px] text-[#6B7280]">
                      <Clock className="inline h-2.5 w-2.5 mr-0.5" />
                      Now
                    </div>
                  </div>

                  {/* Signal Cards */}
                  <div className="flex flex-col gap-0 overflow-hidden">

                    {/* Card 1 — Active/Selected */}
                    <div className="border-l-[2.5px] border-[#FF4500] bg-white mx-0 px-3.5 py-3 border-b border-[#E3E2DE]">
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[12px] font-bold text-[#111827] leading-tight line-clamp-1">
                          Zapmail? PrimeForge?…
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="rounded-full bg-[#F3F4F6] px-1.5 py-0.2 text-[10px] font-semibold text-[#374151]">
                          66 · Researching
                        </span>
                      </div>
                      <div className="text-[10.5px] text-[#6B7280] leading-tight line-clamp-2 mb-1.5">
                        Zapmail? PrimeForge? InboxKit? Im running cold email for my SaaS on google workspace...
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-[#9CA3AF]">
                          <FaReddit className="h-3 w-3 text-[#FF4500]" />
                          r/SaaS · 2d ago
                        </div>
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#059669]">
                          <Sparkles className="h-2.5 w-2.5" />
                          Draft ready
                        </span>
                      </div>
                    </div>

                    {/* Card 2 */}
                    <div className="px-3.5 py-3 border-b border-[#E3E2DE] hover:bg-white/60 transition-colors">
                      <div className="text-[12px] font-semibold text-[#111827] leading-tight line-clamp-1 mb-1">
                        Best email provider for cold…
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="rounded-full bg-[#F3F4F6] px-1.5 py-0.2 text-[10px] font-semibold text-[#374151]">79 · Researching</span>
                      </div>
                      <div className="text-[10.5px] text-[#6B7280] leading-tight line-clamp-1 mb-1.5">
                        Best email provider for cold outreach? Hey, I&apos;m looking for some advice on email providers...
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1 text-[10px] text-[#9CA3AF]">
                          <FaReddit className="h-3 w-3 text-[#FF4500]" />
                          r/SaaS · 7d ago
                        </div>
                        <span className="flex items-center gap-0.5 text-[10px] font-semibold text-[#059669]">
                          <Sparkles className="h-2.5 w-2.5" />
                          Draft ready
                        </span>
                      </div>
                    </div>

                    {/* Card 3 */}
                    <div className="px-3.5 py-3 border-b border-[#E3E2DE] hover:bg-white/60 transition-colors">
                      <div className="text-[12px] font-semibold text-[#111827] leading-tight line-clamp-1 mb-1">
                        We sent 1000 loom videos
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="rounded-full bg-[#ECFDF5] px-1.5 py-0.2 text-[10px] font-bold text-[#059669]">94 · Buying intent</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[#9CA3AF]">
                        <FaReddit className="h-3 w-3 text-[#FF4500]" />
                        r/SaaS · 7d ago
                      </div>
                    </div>

                    {/* Card 4 */}
                    <div className="px-3.5 py-3 hover:bg-white/60 transition-colors">
                      <div className="text-[12px] font-semibold text-[#111827] leading-tight line-clamp-1 mb-1">
                        You can automate your GTM…
                      </div>
                      <div className="flex items-center gap-1.5 mb-1.5">
                        <span className="rounded-full bg-[#F3F4F6] px-1.5 py-0.2 text-[10px] font-semibold text-[#374151]">66 · Researching</span>
                      </div>
                      <div className="flex items-center gap-1 text-[10px] text-[#9CA3AF]">
                        <FaReddit className="h-3 w-3 text-[#FF4500]" />
                        r/SaaS · 8d ago
                      </div>
                    </div>
                  </div>
                </div>

                {/* ── RIGHT PANEL: Signal Detail ── */}
                <div className="flex flex-1 flex-col overflow-hidden bg-white">

                  {/* Detail Header */}
                  <div className="flex h-12 items-center justify-between border-b border-[#E8E7E3] px-4">
                    <div className="flex items-center gap-2">
                      <FaReddit className="h-4 w-4 text-[#FF4500]" />
                      <span className="text-[13px] font-bold text-[#111827]">r/SaaS</span>
                      <span className="rounded-full border border-[#E3E2DE] px-2 py-0.2 text-[10.5px] font-semibold text-[#374151]">
                        66 · Researching
                      </span>
                      <span className="hidden sm:block text-[11px] text-[#9CA3AF]">by BothAd1744 · 2d ago</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" className="flex items-center gap-1 text-[11.5px] font-medium text-[#0A84FF] hover:text-[#0070DF]">
                        Open post
                        <ExternalLink className="h-3 w-3" />
                      </button>
                      <button type="button" className="text-[#9CA3AF] hover:text-[#4B5563]">
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </div>

                  {/* Scrollable body */}
                  <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">

                    {/* Original Post Box */}
                    <div className="rounded-xl border border-[#E8E7E3] bg-[#FAFAF8] p-3.5">
                      <div className="flex items-center justify-between mb-2">
                        <span className="text-[10.5px] font-bold uppercase tracking-wider text-[#9CA3AF]">
                          Original Post
                        </span>
                        <button type="button" className="flex items-center gap-1 text-[11px] text-[#6B7280] hover:text-[#374151]">
                          <Copy className="h-3 w-3" />
                          Copy
                        </button>
                      </div>
                      <h3 className="text-[14px] font-bold text-[#111827] leading-snug mb-2">
                        Zapmail? PrimeForge? InboxKit?
                      </h3>
                      <p className="text-[12px] text-[#4B5563] leading-relaxed">
                        Im running cold email for my SaaS on google workspace mailboxes I set up myself a while back.
                        It;s been fine but managing it is a pain, every new domain is me back in dns records doing
                        spf/dkim/dmarc by hand and then warmup...
                      </p>
                      <button type="button" className="mt-1.5 flex items-center gap-0.5 text-[11.5px] font-medium text-[#0A84FF]">
                        Show full post
                        <ChevronDown className="h-3 w-3" />
                      </button>
                      {/* Matched rule pill */}
                      <div className="mt-2.5 flex items-center gap-1.5 text-[11px] text-[#4B5563]">
                        <span className="text-[#9CA3AF]">Matched rule:</span>
                        <span className="rounded border border-[#E3E2DE] bg-white px-2 py-0.2 font-semibold">
                          &ldquo;cold email&rdquo;
                        </span>
                      </div>
                    </div>

                    {/* Policy Check */}
                    <div className="flex items-center gap-2 rounded-lg border border-[#E8E7E3] bg-[#FAFAF8] px-3.5 py-2.5">
                      <ShieldAlert className="h-4 w-4 shrink-0 text-[#9CA3AF]" />
                      <span className="flex-1 text-[11.5px] text-[#6B7280]">
                        r/saas: Rules could not be verified
                      </span>
                      <button type="button" className="flex items-center gap-0.5 text-[11.5px] font-medium text-[#0A84FF]">
                        Open rules
                        <ExternalLink className="h-3 w-3" />
                      </button>
                    </div>

                    {/* AI Draft Reply */}
                    <div className="rounded-xl border border-[#E8E7E3] bg-white p-3.5 shadow-xs">
                      <div className="flex items-center justify-between mb-3">
                        <div className="flex items-center gap-1.5">
                          <Sparkles className="h-4 w-4 text-[#0A84FF]" />
                          <span className="text-[13px] font-bold text-[#111827]">AI Generated Reply Draft</span>
                        </div>
                        <button type="button" className="flex items-center gap-1 text-[11.5px] font-medium text-[#6B7280] hover:text-[#374151]">
                          <RefreshCw className="h-3 w-3" />
                          Regenerate
                        </button>
                      </div>
                      <p className="text-[12.5px] text-[#1F2937] leading-relaxed">
                        The DNS management is real overhead, but deliverability on managed providers depends less on
                        the provider itself and more on whether you can still control sender reputation at the domain
                        level. The platforms you&apos;re...
                      </p>
                    </div>
                  </div>

                  {/* Bottom Action Bar */}
                  <div className="flex items-center gap-2.5 border-t border-[#E8E7E3] px-4 py-3">
                    <button
                      type="button"
                      className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-[#FF4500] px-4 py-2 text-[13px] font-bold text-white shadow-xs hover:bg-[#E03D00] transition-colors"
                    >
                      <FaReddit className="h-4 w-4" />
                      Copy &amp; Open Reddit
                    </button>
                    <button
                      type="button"
                      className="flex items-center gap-1.5 rounded-lg border border-[#E3E2DE] bg-white px-3 py-2 text-[12.5px] font-semibold text-[#374151] hover:bg-[#F7F6F3] transition-colors"
                    >
                      <Copy className="h-3.5 w-3.5" />
                      Copy text
                    </button>
                    <button type="button" className="rounded-lg border border-[#E3E2DE] p-2 text-[#9CA3AF] hover:bg-[#F7F6F3]">
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
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
