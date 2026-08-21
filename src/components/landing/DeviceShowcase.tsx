'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'
import { Sparkles, MessageSquare, CheckCircle2, ShieldCheck, Flame, Send, Check } from 'lucide-react'

export function DeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[1100px] select-none pt-4 pb-8 sm:pb-12">
      {/* Subtle ambient lighting */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-[450px] w-[85%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#0A84FF]/14 via-[#0A84FF]/3 to-transparent blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full">
        {/* ========================================================
            1. MACBOOK PRO (Centerpiece Background)
            ======================================================== */}
        <div className="relative mx-auto w-full max-w-[680px] md:max-w-[760px] lg:max-w-[830px]">
          {/* Display Lid Outer Bezel */}
          <div className="relative rounded-t-[16px] border-[1.5px] border-[#383B46] bg-[#0E0F14] p-[5px] shadow-[0_30px_90px_rgba(0,0,0,0.7)] ring-1 ring-white/10 sm:rounded-t-[24px] sm:p-[8px] md:p-[11px]">
            {/* Screen Inner Display */}
            <div className="relative overflow-hidden rounded-t-[10px] bg-[#0A0A0E] sm:rounded-t-[15px]">
              {/* Top Notch & macOS Window Bar */}
              <div className="relative z-20 flex h-6 items-center justify-between border-b border-black/[0.08] bg-[#F3F4F6] px-2.5 sm:h-7.5 sm:px-3.5">
                {/* macOS Traffic Lights */}
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  <span className="h-2 w-2 rounded-full bg-[#FF5F56] ring-1 ring-black/10 sm:h-2.5 sm:w-2.5" />
                  <span className="h-2 w-2 rounded-full bg-[#FFBD2E] ring-1 ring-black/10 sm:h-2.5 sm:w-2.5" />
                  <span className="h-2 w-2 rounded-full bg-[#27C93F] ring-1 ring-black/10 sm:h-2.5 sm:w-2.5" />
                </div>

                {/* Camera Notch */}
                <div className="absolute top-0 left-1/2 z-30 flex h-[11px] w-[75px] -translate-x-1/2 items-center justify-center rounded-b-[6px] bg-[#0E0F14] shadow-xs sm:h-[15px] sm:w-[105px] sm:rounded-b-[8px]">
                  <div className="flex items-center gap-1.5">
                    <span className="h-1 w-1 rounded-full bg-[#1A1B22] ring-1 ring-white/20 sm:h-1.5 sm:w-1.5" />
                    <span className="h-1 w-1 rounded-full bg-[#0E2A1E] ring-1 ring-[#10B981]/50" />
                  </div>
                </div>

                {/* URL Badge */}
                <div className="flex items-center gap-1.5">
                  <div className="hidden sm:flex items-center gap-1 rounded-md border border-black/[0.06] bg-white/95 px-2 py-0.5 text-[9.5px] font-medium text-[#4B5563] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    <span className="font-semibold text-[#111827]">buyerwatch.co</span>
                    <span className="text-[#9CA3AF]">/dashboard</span>
                  </div>
                </div>
              </div>

              {/* Dashboard Content Image */}
              <div className="relative w-full bg-white">
                <Image
                  src="/buyerwatch-dashboard-showcase-v8.png"
                  alt="BuyerWatch desktop dashboard"
                  width={1917}
                  height={1176}
                  sizes="(max-width: 1024px) 100vw, 830px"
                  priority
                  unoptimized
                  className="block h-auto w-full"
                />
              </div>
            </div>
          </div>

          {/* Display Hinge */}
          <div className="relative mx-auto h-[3px] w-[86%] bg-[#1E2028] rounded-t-[1px]" />

          {/* Laptop Base (Aluminum Unibody) */}
          <div className="relative -ml-[2.5%] w-[105%]">
            <div className="relative h-[10px] rounded-b-[4px] border-t border-white/60 bg-gradient-to-b from-[#E0E4EA] via-[#C2C7CF] to-[#A1A7B0] shadow-[0_2px_5px_rgba(0,0,0,0.3)] sm:h-[13px] sm:rounded-b-[6px]">
              {/* Center Thumb Groove */}
              <div className="mx-auto h-[3.5px] w-[65px] rounded-b-[4px] bg-gradient-to-b from-[#7A7F87] to-[#9298A1] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] sm:h-[5px] sm:w-[100px] sm:rounded-b-[6px]" />
            </div>
            <div className="mx-auto h-[2.5px] w-[96%] rounded-b-[10px] bg-[#6B7078]" />
            <div className="mx-auto h-[12px] w-[94%] bg-black/40 blur-[14px]" />
          </div>
        </div>

        {/* ========================================================
            2. iPHONE 16 PRO (Slender Vertical Phone: 9:19.5 Aspect Ratio)
            ======================================================== */}
        <motion.div
          initial={{ opacity: 0, y: 25, x: -8 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -left-1 bottom-[-10px] z-30 w-[125px] h-[265px] sm:left-[1%] sm:bottom-[-16px] sm:w-[150px] sm:h-[320px] md:left-[2%] md:bottom-[-20px] md:w-[168px] md:h-[360px] lg:left-[3%] lg:bottom-[-22px] lg:w-[182px] lg:h-[390px]"
        >
          {/* Titanium Phone Body */}
          <div className="relative h-full w-full rounded-[26px] border-[2px] border-[#383A46] bg-[#16171D] p-[4px] shadow-[-20px_25px_50px_rgba(0,0,0,0.7),-4px_6px_16px_rgba(0,0,0,0.35)] ring-1 ring-white/20 sm:rounded-[34px] sm:border-[2.5px] sm:p-[5.5px] lg:rounded-[38px] lg:p-[6.5px]">
            {/* Side Buttons */}
            <div className="absolute -left-[3.5px] top-[50px] h-[14px] w-[1.5px] rounded-l-xs bg-[#3A3C44] sm:top-[65px] sm:h-[20px]" />
            <div className="absolute -left-[3.5px] top-[72px] h-[22px] w-[1.5px] rounded-l-xs bg-[#3A3C44] sm:top-[92px] sm:h-[30px]" />
            <div className="absolute -left-[3.5px] top-[100px] h-[22px] w-[1.5px] rounded-l-xs bg-[#3A3C44] sm:top-[128px] sm:h-[30px]" />
            <div className="absolute -right-[3.5px] top-[68px] h-[30px] w-[1.5px] rounded-r-xs bg-[#3A3C44] sm:top-[88px] sm:h-[40px]" />

            {/* Inner Phone Screen */}
            <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[21px] border border-black/10 bg-[#FAFAFA] sm:rounded-[28px] lg:rounded-[31px]">
              {/* Status Bar */}
              <div>
                <div className="relative z-20 flex h-[22px] items-center justify-between px-2.5 pt-0.5 sm:h-[26px] sm:px-3">
                  <span className="text-[8px] font-bold tracking-tight text-[#111827] sm:text-[9.5px]">9:41</span>
                  {/* Dynamic Island */}
                  <div className="absolute top-[3px] left-1/2 flex h-[11px] w-[46px] -translate-x-1/2 items-center justify-between rounded-full bg-black px-1 shadow-xs sm:top-[4px] sm:h-[13px] sm:w-[58px] lg:w-[64px]">
                    <span className="h-1 w-1 rounded-full bg-[#1F2024] ring-1 ring-white/10" />
                    <span className="h-0.5 w-0.5 rounded-full bg-[#0A84FF] animate-pulse" />
                  </div>
                  <div className="flex items-center gap-0.5 text-[#111827]">
                    <div className="flex h-1.5 w-2.5 items-center rounded-[1.5px] border border-[#111827] p-[0.3px]">
                      <div className="h-full w-full rounded-2xs bg-[#10B981]" />
                    </div>
                  </div>
                </div>

                {/* App Header */}
                <div className="flex items-center justify-between border-b border-black/[0.05] bg-white px-2 py-1 sm:px-2.5 sm:py-1.5">
                  <div className="flex items-center gap-1">
                    <div className="flex h-3.5 w-3.5 items-center justify-center rounded-[4px] bg-[#0A84FF] text-white shadow-2xs">
                      <Flame className="h-2 w-2 fill-white" />
                    </div>
                    <span className="text-[8.5px] font-extrabold tracking-tight text-[#0A0A0A] sm:text-[10px]">
                      BuyerWatch
                    </span>
                  </div>
                  <span className="flex items-center gap-0.5 rounded-full border border-[#10B981]/25 bg-[#ECFDF5] px-1 py-0.1 text-[6.5px] font-bold text-[#059669] sm:text-[7.5px]">
                    <span className="h-1 w-1 rounded-full bg-[#10B981] animate-pulse" />
                    Live
                  </span>
                </div>

                {/* Phone Feed Cards */}
                <div className="space-y-1.5 p-1.5 sm:space-y-2 sm:p-2">
                  {/* High Intent Summary */}
                  <div className="flex items-center justify-between rounded-md bg-white p-1 shadow-2xs border border-black/[0.04]">
                    <div>
                      <div className="text-[6.5px] font-semibold text-[#6B7280] uppercase tracking-wider">High Intent</div>
                      <div className="text-[9px] font-extrabold text-[#0A0A0A] sm:text-[10.5px]">122 leads</div>
                    </div>
                    <span className="rounded-full bg-[#0A84FF]/10 px-1 py-0.1 text-[6.5px] font-bold text-[#0A84FF] sm:text-[7.5px]">
                      +18 today
                    </span>
                  </div>

                  {/* Feed Card 1 */}
                  <div className="rounded-[8px] border border-black/[0.06] bg-white p-1.5 shadow-2xs sm:p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#FF4500] text-[5.5px] font-bold text-white">r/</span>
                        <span className="text-[7.5px] font-bold text-[#1F2937] sm:text-[8.5px]">r/SaaS</span>
                      </div>
                      <span className="rounded-full bg-[#ECFDF5] px-1 text-[6.5px] font-bold text-[#059669]">95% Intent</span>
                    </div>
                    <p className="mt-0.5 text-[7px] font-semibold leading-tight text-[#111827] line-clamp-2 sm:text-[8px]">
                      Need advice getting first 10-100 users for SaaS startup...
                    </p>
                    <div className="mt-1 flex items-center justify-between pt-1 border-t border-black/[0.04]">
                      <span className="flex items-center gap-0.5 text-[6.5px] font-medium text-[#6B7280]">
                        <CheckCircle2 className="h-2 w-2 text-[#10B981]" /> Draft ready
                      </span>
                      <span className="flex items-center gap-0.5 rounded bg-[#0A84FF] px-1 py-0.2 text-[6.5px] font-bold text-white shadow-2xs sm:text-[7.5px]">
                        <Sparkles className="h-1.5 w-1.5" /> Reply
                      </span>
                    </div>
                  </div>

                  {/* Feed Card 2 */}
                  <div className="rounded-[8px] border border-black/[0.06] bg-white p-1.5 shadow-2xs sm:p-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-0.5">
                        <span className="flex h-2.5 w-2.5 items-center justify-center rounded-full bg-[#FF4500] text-[5.5px] font-bold text-white">r/</span>
                        <span className="text-[7.5px] font-bold text-[#1F2937] sm:text-[8.5px]">r/Entrepreneur</span>
                      </div>
                      <span className="rounded-full bg-[#ECFDF5] px-1 text-[6.5px] font-bold text-[#059669]">84%</span>
                    </div>
                    <p className="mt-0.5 text-[6.5px] font-medium leading-tight text-[#4B5563] line-clamp-1 sm:text-[7.5px]">
                      Looking for restaurant management software...
                    </p>
                  </div>
                </div>
              </div>

              {/* Bottom Dock & Home Bar */}
              <div className="mt-auto border-t border-black/[0.06] bg-white/95 px-2 py-0.5 backdrop-blur-md">
                <div className="flex items-center justify-around text-[#6B7280]">
                  <div className="flex flex-col items-center text-[#0A84FF]">
                    <Flame className="h-2.5 w-2.5 fill-[#0A84FF]" />
                    <span className="text-[6px] font-bold">Feed</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <MessageSquare className="h-2.5 w-2.5" />
                    <span className="text-[6px] font-medium">Drafts</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <ShieldCheck className="h-2.5 w-2.5" />
                    <span className="text-[6px] font-medium">Rules</span>
                  </div>
                </div>
                <div className="mx-auto mt-0.5 h-[2px] w-10 rounded-full bg-black/80 sm:w-14" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ========================================================
            3. iPAD PRO (Portrait Tablet: 3:4 Aspect Ratio, Taller & Wider)
            ======================================================== */}
        <motion.div
          initial={{ opacity: 0, y: 25, x: 8 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -right-1 bottom-[-10px] z-30 w-[195px] h-[265px] sm:right-[1%] sm:bottom-[-16px] sm:w-[245px] sm:h-[335px] md:right-[2%] md:bottom-[-20px] md:w-[285px] md:h-[385px] lg:right-[3%] lg:bottom-[-22px] lg:w-[315px] lg:h-[425px]"
        >
          {/* Space Gray iPad Body */}
          <div className="relative h-full w-full rounded-[18px] border-[2px] border-[#383A46] bg-[#16171D] p-[5px] shadow-[20px_25px_50px_rgba(0,0,0,0.7),4px_6px_16px_rgba(0,0,0,0.35)] ring-1 ring-white/20 sm:rounded-[24px] sm:border-[2.5px] sm:p-[6.5px] lg:rounded-[28px] lg:p-[7.5px]">
            {/* Front Camera Dot */}
            <div className="absolute top-[3px] left-1/2 -translate-x-1/2">
              <span className="block h-1 w-1 rounded-full bg-[#2A2B32] ring-1 ring-white/10 sm:h-1.5 sm:w-1.5" />
            </div>

            {/* Inner Tablet Screen */}
            <div className="relative flex h-full w-full flex-col justify-between overflow-hidden rounded-[13px] border border-black/10 bg-[#F8F9FA] sm:rounded-[18px] lg:rounded-[21px]">
              {/* Tablet Status Bar */}
              <div className="flex h-4.5 items-center justify-between border-b border-black/[0.04] bg-white px-2.5 text-[7px] font-bold text-[#111827] sm:h-5.5 sm:px-3 sm:text-[8.5px]">
                <span>9:41 AM</span>
                <div className="flex items-center gap-1 text-[6.5px] text-[#6B7280] sm:text-[7.5px]">
                  <span className="font-semibold text-[#0A84FF]">iPadOS 18</span>
                  <div className="flex h-1.5 w-2.5 items-center rounded-[1.5px] border border-[#111827] p-[0.3px]">
                    <div className="h-full w-full rounded-2xs bg-[#10B981]" />
                  </div>
                </div>
              </div>

              {/* Tablet Split View (Takes Full Height) */}
              <div className="flex flex-1 overflow-hidden">
                {/* Left: Signals List Column */}
                <div className="w-[42%] border-r border-black/[0.06] bg-[#FAFAFA] p-1.5 overflow-hidden flex flex-col gap-1 sm:p-2 sm:gap-1.5">
                  <div className="flex items-center justify-between pb-0.5 border-b border-black/[0.05]">
                    <span className="text-[7.5px] font-extrabold text-[#111827] sm:text-[8.5px]">Signals</span>
                    <span className="rounded-full bg-[#0A84FF]/10 px-1 text-[6px] font-bold text-[#0A84FF] sm:text-[7px]">320</span>
                  </div>

                  {/* Card 1 */}
                  <div className="rounded-[5px] border border-[#0A84FF]/40 bg-white p-1 shadow-2xs sm:rounded-[7px] sm:p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[6.5px] font-bold text-[#FF4500] sm:text-[7.5px]">r/SaaS</span>
                      <span className="rounded-full bg-[#ECFDF5] px-0.8 text-[6px] font-bold text-[#059669] sm:text-[6.5px]">95%</span>
                    </div>
                    <p className="mt-0.5 text-[6.5px] font-bold text-[#111827] line-clamp-2 leading-tight sm:text-[7.5px]">
                      First 10-100 users for SaaS startup
                    </p>
                  </div>

                  {/* Card 2 */}
                  <div className="rounded-[5px] border border-black/[0.04] bg-white/70 p-1 sm:rounded-[7px] sm:p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[6.5px] font-bold text-[#FF4500] sm:text-[7.5px]">r/Entrepreneur</span>
                      <span className="rounded-full bg-[#ECFDF5] px-0.8 text-[6px] font-bold text-[#059669] sm:text-[6.5px]">84%</span>
                    </div>
                    <p className="mt-0.5 text-[6.5px] font-medium text-[#4B5563] line-clamp-2 leading-tight sm:text-[7.5px]">
                      Restaurant management tools...
                    </p>
                  </div>

                  {/* Card 3 */}
                  <div className="rounded-[5px] border border-black/[0.04] bg-white/70 p-1 sm:rounded-[7px] sm:p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[6.5px] font-bold text-[#0A84FF] sm:text-[7.5px]">Bluesky</span>
                      <span className="rounded-full bg-[#ECFDF5] px-0.8 text-[6px] font-bold text-[#059669] sm:text-[6.5px]">91%</span>
                    </div>
                    <p className="mt-0.5 text-[6.5px] font-medium text-[#4B5563] line-clamp-2 leading-tight sm:text-[7.5px]">
                      B2B lead generation tactics...
                    </p>
                  </div>
                </div>

                {/* Right: AI Draft Reply Workspace */}
                <div className="flex-1 bg-white p-1.5 flex flex-col justify-between overflow-hidden sm:p-2.5">
                  <div className="space-y-1 sm:space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[7.5px] font-extrabold text-[#111827] sm:text-[9px]">AI Draft Reply</span>
                      <span className="flex items-center gap-0.5 text-[6px] font-bold text-[#059669] sm:text-[7.5px]">
                        <Check className="h-2 w-2 sm:h-2.5 sm:w-2.5" /> Verified
                      </span>
                    </div>

                    {/* Draft Reply Bubble */}
                    <div className="rounded-[6px] border border-[#0A84FF]/20 bg-[#F0F7FF] p-1.5 text-[6.5px] leading-relaxed text-[#1E3A8A] sm:rounded-[8px] sm:p-2 sm:text-[8px]">
                      "Hey! For getting initial users, Reddit keyword monitoring worked best for us — jumping into active threads before competitors notice..."
                    </div>

                    {/* Verification checks */}
                    <div className="flex flex-wrap gap-1 text-[5.5px] text-[#4B5563] sm:text-[7px]">
                      <span className="rounded bg-[#F3F4F6] px-1 py-0.2 font-medium">✓ Disclosure attached</span>
                      <span className="rounded bg-[#F3F4F6] px-1 py-0.2 font-medium">✓ Policy verified</span>
                    </div>
                  </div>

                  {/* Action row */}
                  <div className="pt-1 border-t border-black/[0.05] flex items-center justify-between">
                    <span className="text-[6px] text-[#9CA3AF] sm:text-[7px]">Auto-delay: 2m</span>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded bg-[#0A84FF] px-1.5 py-0.5 text-[7px] font-bold text-white shadow-2xs sm:px-2.5 sm:py-1 sm:text-[8.5px]"
                    >
                      <Send className="h-2 w-2" />
                      Approve & Post
                    </button>
                  </div>
                </div>
              </div>

              {/* Bottom Home Indicator */}
              <div className="border-t border-black/[0.04] bg-white py-0.5">
                <div className="mx-auto h-[2px] w-16 rounded-full bg-black/80 sm:w-24" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
