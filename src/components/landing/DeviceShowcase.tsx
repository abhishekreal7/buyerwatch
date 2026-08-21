'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Sparkles, MessageSquare, CheckCircle2, ShieldCheck, Flame, Send, Check, Search } from 'lucide-react'

export function DeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[1180px] select-none pt-2 pb-10 sm:pb-16 lg:pb-20">
      {/* Soft ambient backdrop glow */}
      <div
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-[380px] w-[80%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#0A84FF]/10 via-[#0A84FF]/3 to-transparent blur-[90px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full">
        {/* ========================================================
            1. MACBOOK PRO (Centerpiece Hero)
            ======================================================== */}
        <div className="relative mx-auto w-full max-w-[960px]">
          {/* Display Lid / Screen Outer Bezel */}
          <div className="relative rounded-t-[18px] border-[1.5px] border-[#383B44] bg-[#0D0E12] p-[6px] shadow-[0_25px_70px_rgba(0,0,0,0.16)] sm:rounded-t-[26px] sm:p-[9px] md:p-[12px]">
            {/* Screen Inner Display */}
            <div className="relative overflow-hidden rounded-t-[12px] bg-[#0A0A0C] sm:rounded-t-[16px]">
              {/* MacBook Top Bezel + Camera Notch */}
              <div className="relative z-20 flex h-7 items-center justify-between border-b border-black/[0.07] bg-[#F4F5F7] px-3 sm:h-8 sm:px-4">
                {/* Left: Traffic Lights */}
                <div className="flex shrink-0 items-center gap-1.5 sm:gap-2" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] ring-1 ring-black/10 sm:h-3 sm:w-3" />
                </div>

                {/* Center: Clean Camera Notch (No text underneath) */}
                <div className="absolute top-0 left-1/2 z-30 flex h-[13px] w-[90px] -translate-x-1/2 items-center justify-center rounded-b-[7px] bg-[#0D0E12] shadow-xs sm:h-[16px] sm:w-[120px] sm:rounded-b-[9px]">
                  <div className="flex items-center gap-2">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#181920] ring-1 ring-white/20 sm:h-2 sm:w-2" />
                    <span className="h-1 w-1 rounded-full bg-[#0E2A1E] ring-1 ring-[#10B981]/40" />
                  </div>
                </div>

                {/* Right: URL & Status pill (Cleanly positioned to the right of notch) */}
                <div className="flex items-center gap-2">
                  <div className="hidden sm:flex items-center gap-1.5 rounded-md border border-black/[0.06] bg-white/90 px-2.5 py-0.5 text-[10.5px] font-medium text-[#525866] shadow-[0_1px_2px_rgba(0,0,0,0.02)]">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                    <span className="font-semibold text-[#1F242F]">buyerwatch.co</span>
                    <span className="text-[#8E95A3]">/dashboard</span>
                  </div>
                  <div className="flex items-center gap-1 text-[#9CA3AF]" aria-hidden="true">
                    <Search className="h-3 w-3 sm:h-3.5 sm:w-3.5" />
                  </div>
                </div>
              </div>

              {/* Dashboard Content Image */}
              <div className="relative w-full bg-white">
                <Image
                  src="/buyerwatch-dashboard-showcase-v8.png"
                  alt="BuyerWatch desktop dashboard with lead discovery feed and intent scoring"
                  width={1917}
                  height={1176}
                  sizes="(max-width: 1024px) 100vw, 960px"
                  priority
                  unoptimized
                  className="block h-auto w-full"
                />
              </div>
            </div>
          </div>

          {/* Display Hinge */}
          <div className="relative mx-auto h-[3px] w-[86%] bg-[#1A1C22] rounded-t-[1px]" />

          {/* Aluminum Laptop Base (Chassis) */}
          <div className="relative -ml-[2.5%] w-[105%]">
            {/* Top Shelf Lip */}
            <div className="relative h-[11px] rounded-b-[4px] border-t border-white/60 bg-gradient-to-b from-[#D8DCE2] via-[#BCC2CA] to-[#9EA4AD] shadow-[0_2px_5px_rgba(0,0,0,0.18)] sm:h-[15px] sm:rounded-b-[7px]">
              {/* Center Thumb Groove */}
              <div className="mx-auto h-[4px] w-[75px] rounded-b-[5px] bg-gradient-to-b from-[#7A7F87] to-[#9298A1] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] sm:h-[6px] sm:w-[115px] sm:rounded-b-[7px]" />
            </div>

            {/* Bottom Edge & Floor Shadow */}
            <div className="mx-auto h-[3px] w-[96%] rounded-b-[10px] bg-[#6B7078]" />
            <div className="mx-auto h-[12px] w-[94%] bg-black/25 blur-[14px]" />
          </div>
        </div>

        {/* ========================================================
            2. iPHONE 16 PRO (Bottom-Left Foreground)
            ======================================================== */}
        <motion.div
          initial={{ opacity: 0, y: 30, x: -12 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -left-1 bottom-[-8px] z-30 w-[165px] sm:left-[2%] sm:bottom-[-16px] sm:w-[205px] md:left-[3%] md:bottom-[-22px] md:w-[235px] lg:left-[4%] lg:bottom-[-26px] lg:w-[255px]"
        >
          {/* Outer Titanium Chassis */}
          <div className="relative rounded-[32px] border-[2px] border-[#363842] bg-[#16171C] p-[4.5px] shadow-[-16px_22px_45px_rgba(0,0,0,0.38),-4px_6px_14px_rgba(0,0,0,0.18)] ring-1 ring-white/20 sm:rounded-[40px] sm:border-[2.5px] sm:p-[6.5px] md:rounded-[44px] md:p-[7.5px]">
            {/* Side Buttons */}
            <div className="absolute -left-[3.5px] top-[60px] h-[18px] w-[2px] rounded-l-xs bg-[#3A3C44] sm:top-[75px] sm:h-[24px]" />
            <div className="absolute -left-[3.5px] top-[86px] h-[28px] w-[2px] rounded-l-xs bg-[#3A3C44] sm:top-[110px] sm:h-[36px]" />
            <div className="absolute -left-[3.5px] top-[120px] h-[28px] w-[2px] rounded-l-xs bg-[#3A3C44] sm:top-[152px] sm:h-[36px]" />
            <div className="absolute -right-[3.5px] top-[80px] h-[38px] w-[2px] rounded-r-xs bg-[#3A3C44] sm:top-[102px] sm:h-[48px]" />

            {/* Mobile Screen */}
            <div className="relative flex flex-col overflow-hidden rounded-[26px] border border-black/10 bg-[#FAFAFA] sm:rounded-[34px] md:rounded-[36px]">
              {/* Status Bar & Dynamic Island */}
              <div className="relative z-20 flex h-[28px] items-center justify-between px-3 pt-1 sm:h-[34px] sm:px-3.5">
                <span className="text-[9.5px] font-bold tracking-tight text-[#111827] sm:text-[11.5px]">
                  9:41
                </span>

                {/* Dynamic Island */}
                <div className="absolute top-[4px] left-1/2 flex h-[15px] w-[60px] -translate-x-1/2 items-center justify-between rounded-full bg-black px-1.5 shadow-sm sm:top-[6px] sm:h-[18px] sm:w-[76px] md:w-[84px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1F2024] ring-1 ring-white/10" />
                  <span className="h-1 w-1 rounded-full bg-[#0A84FF] animate-pulse" />
                </div>

                {/* Battery / Wifi */}
                <div className="flex items-center gap-1 text-[#111827]">
                  <div className="flex h-2 w-3 items-center rounded-[2px] border border-[#111827] p-[0.5px]">
                    <div className="h-full w-full rounded-xs bg-[#10B981]" />
                  </div>
                </div>
              </div>

              {/* Mobile App Header */}
              <div className="flex items-center justify-between border-b border-black/[0.05] bg-white px-2.5 py-1.5 sm:px-3 sm:py-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-4 w-4 items-center justify-center rounded-[5px] bg-[#0A84FF] text-white shadow-xs sm:h-4.5 sm:w-4.5">
                    <Flame className="h-2.5 w-2.5 fill-white" />
                  </div>
                  <span className="text-[10.5px] font-extrabold tracking-tight text-[#0A0A0A] sm:text-[12px]">
                    BuyerWatch
                  </span>
                </div>
                <span className="flex items-center gap-1 rounded-full border border-[#10B981]/25 bg-[#ECFDF5] px-1.5 py-0.2 text-[8px] font-bold text-[#059669] sm:text-[8.5px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                  Live
                </span>
              </div>

              {/* Mobile Feed */}
              <div className="space-y-1.5 p-2 sm:space-y-2 sm:p-2.5">
                {/* Stats summary badge */}
                <div className="flex items-center justify-between rounded-lg bg-white p-1.5 shadow-xs border border-black/[0.04]">
                  <div>
                    <div className="text-[7.5px] font-semibold text-[#6B7280] uppercase tracking-wider">High Intent</div>
                    <div className="text-[11px] font-extrabold text-[#0A0A0A] sm:text-[12.5px]">122 leads</div>
                  </div>
                  <span className="rounded-full bg-[#0A84FF]/10 px-1.5 py-0.2 text-[7.5px] font-bold text-[#0A84FF] sm:text-[8.5px]">
                    +18 today
                  </span>
                </div>

                {/* Feed Card 1 */}
                <div className="rounded-[10px] border border-black/[0.06] bg-white p-2 shadow-xs sm:rounded-[12px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF4500] text-[7px] font-bold text-white">
                        r/
                      </span>
                      <span className="text-[9px] font-bold text-[#1F2937] sm:text-[10px]">r/SaaS</span>
                      <span className="text-[7.5px] text-[#9CA3AF]">• 14m</span>
                    </div>
                    <span className="rounded-full bg-[#ECFDF5] px-1 text-[7.5px] font-bold text-[#059669]">
                      95% Intent
                    </span>
                  </div>

                  <p className="mt-1 text-[9px] font-semibold leading-snug text-[#111827] sm:text-[10px]">
                    Need advice getting first 10-100 users for SaaS...
                  </p>

                  <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-black/[0.04]">
                    <span className="flex items-center gap-0.5 text-[7.5px] font-medium text-[#6B7280]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-[#10B981]" /> Draft ready
                    </span>
                    <span className="flex items-center gap-0.5 rounded-md bg-[#0A84FF] px-1.5 py-0.5 text-[8px] font-bold text-white shadow-xs sm:text-[8.5px]">
                      <Sparkles className="h-2 w-2" />
                      Reply
                    </span>
                  </div>
                </div>

                {/* Feed Card 2 */}
                <div className="rounded-[10px] border border-black/[0.06] bg-white p-2 shadow-xs sm:rounded-[12px]">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF4500] text-[7px] font-bold text-white">
                        r/
                      </span>
                      <span className="text-[9px] font-bold text-[#1F2937] sm:text-[10px]">r/Entrepreneur</span>
                    </div>
                    <span className="rounded-full bg-[#ECFDF5] px-1 text-[7.5px] font-bold text-[#059669]">
                      84%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[8.5px] font-medium leading-tight text-[#4B5563] line-clamp-1">
                    Looking for restaurant management software...
                  </p>
                </div>
              </div>

              {/* Bottom Nav */}
              <div className="mt-auto border-t border-black/[0.06] bg-white/95 px-3 py-1 backdrop-blur-md">
                <div className="flex items-center justify-around text-[#6B7280]">
                  <div className="flex flex-col items-center text-[#0A84FF]">
                    <Flame className="h-3 w-3 fill-[#0A84FF]" />
                    <span className="text-[7px] font-bold">Feed</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <MessageSquare className="h-3 w-3" />
                    <span className="text-[7px] font-medium">Drafts</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <ShieldCheck className="h-3 w-3" />
                    <span className="text-[7px] font-medium">Rules</span>
                  </div>
                </div>
                {/* Home Indicator */}
                <div className="mx-auto mt-1 h-[2.5px] w-14 rounded-full bg-black/80 sm:w-18" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ========================================================
            3. iPAD PRO (Bottom-Right Foreground)
            ======================================================== */}
        <motion.div
          initial={{ opacity: 0, y: 30, x: 12 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -right-1 bottom-[-10px] z-30 w-[185px] sm:right-[2%] sm:bottom-[-18px] sm:w-[235px] md:right-[3%] md:bottom-[-24px] md:w-[275px] lg:right-[4%] lg:bottom-[-28px] lg:w-[295px]"
        >
          {/* Outer Space Gray iPad Chassis */}
          <div className="relative rounded-[22px] border-[2px] border-[#363842] bg-[#16171C] p-[5px] shadow-[16px_22px_45px_rgba(0,0,0,0.38),4px_6px_14px_rgba(0,0,0,0.18)] ring-1 ring-white/20 sm:rounded-[28px] sm:border-[2.5px] sm:p-[6.5px] md:rounded-[32px] md:p-[7.5px]">
            {/* Front Camera Dot */}
            <div className="absolute top-[3.5px] left-1/2 -translate-x-1/2">
              <span className="block h-1 w-1 rounded-full bg-[#2A2B32] ring-1 ring-white/10 sm:h-1.5 sm:w-1.5" />
            </div>

            {/* Inner iPad Screen */}
            <div className="relative flex flex-col overflow-hidden rounded-[16px] border border-black/10 bg-[#F8F9FA] sm:rounded-[20px] md:rounded-[24px]">
              {/* Status Bar */}
              <div className="flex h-5 items-center justify-between border-b border-black/[0.04] bg-white px-2.5 text-[8px] font-bold text-[#111827] sm:h-5.5 sm:px-3 sm:text-[9px]">
                <span>9:41 AM</span>
                <div className="flex items-center gap-1 text-[7.5px] text-[#6B7280]">
                  <span className="font-semibold text-[#0A84FF]">iPadOS 18</span>
                  <div className="flex h-2 w-3 items-center rounded-[2px] border border-[#111827] p-[0.5px]">
                    <div className="h-full w-full rounded-xs bg-[#10B981]" />
                  </div>
                </div>
              </div>

              {/* Tablet Split-View Layout */}
              <div className="flex h-[155px] sm:h-[195px] md:h-[225px] lg:h-[245px]">
                {/* Left Signals Feed Column */}
                <div className="w-[44%] border-r border-black/[0.06] bg-[#FAFAFA] p-1.5 overflow-hidden flex flex-col gap-1 sm:p-2 sm:gap-1.5">
                  <div className="flex items-center justify-between pb-0.5 border-b border-black/[0.05]">
                    <span className="text-[8px] font-extrabold text-[#111827] sm:text-[9px]">Signals</span>
                    <span className="rounded-full bg-[#0A84FF]/10 px-1 text-[7px] font-bold text-[#0A84FF]">
                      320
                    </span>
                  </div>

                  {/* Active Feed item */}
                  <div className="rounded-[6px] border border-[#0A84FF]/40 bg-white p-1 shadow-xs sm:rounded-[8px] sm:p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[7.5px] font-bold text-[#FF4500] sm:text-[8px]">r/SaaS</span>
                      <span className="rounded-full bg-[#ECFDF5] px-0.8 text-[6.5px] font-bold text-[#059669] sm:text-[7px]">95%</span>
                    </div>
                    <p className="mt-0.5 text-[7.5px] font-bold text-[#111827] line-clamp-2 leading-tight sm:text-[8px]">
                      First 10-100 users for SaaS startup
                    </p>
                  </div>

                  {/* Feed item 2 */}
                  <div className="rounded-[6px] border border-black/[0.04] bg-white/70 p-1 sm:rounded-[8px] sm:p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[7.5px] font-bold text-[#FF4500] sm:text-[8px]">r/Entrepreneur</span>
                      <span className="rounded-full bg-[#ECFDF5] px-0.8 text-[6.5px] font-bold text-[#059669] sm:text-[7px]">84%</span>
                    </div>
                    <p className="mt-0.5 text-[7.5px] font-medium text-[#4B5563] line-clamp-1 leading-tight sm:text-[8px]">
                      Restaurant management tools...
                    </p>
                  </div>

                  {/* Feed item 3 */}
                  <div className="rounded-[6px] border border-black/[0.04] bg-white/70 p-1 sm:rounded-[8px] sm:p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[7.5px] font-bold text-[#0A84FF] sm:text-[8px]">Bluesky</span>
                      <span className="rounded-full bg-[#ECFDF5] px-0.8 text-[6.5px] font-bold text-[#059669] sm:text-[7px]">91%</span>
                    </div>
                    <p className="mt-0.5 text-[7.5px] font-medium text-[#4B5563] line-clamp-1 leading-tight sm:text-[8px]">
                      B2B lead generation...
                    </p>
                  </div>
                </div>

                {/* Right AI Reply Column */}
                <div className="flex-1 bg-white p-1.5 flex flex-col justify-between overflow-hidden sm:p-2">
                  <div className="space-y-1 sm:space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-extrabold text-[#111827] sm:text-[9px]">AI Draft Reply</span>
                      <span className="flex items-center gap-0.5 text-[7px] font-bold text-[#059669] sm:text-[7.5px]">
                        <Check className="h-2 w-2 sm:h-2.5 sm:w-2.5" /> Checked
                      </span>
                    </div>

                    {/* Draft text */}
                    <div className="rounded-[6px] border border-[#0A84FF]/20 bg-[#F0F7FF] p-1.5 text-[7.5px] leading-relaxed text-[#1E3A8A] sm:rounded-[8px] sm:p-2 sm:text-[8.5px]">
                      "Hey! For getting initial users, Reddit keyword monitoring worked best for us — specifically jumping into active threads before competitors notice..."
                    </div>

                    {/* Safeguards */}
                    <div className="flex flex-wrap gap-1 text-[6.5px] text-[#4B5563] sm:text-[7px]">
                      <span className="rounded-md bg-[#F3F4F6] px-1 py-0.5 font-medium">✓ Disclosure attached</span>
                      <span className="rounded-md bg-[#F3F4F6] px-1 py-0.5 font-medium">✓ Policy verified</span>
                    </div>
                  </div>

                  {/* Approve button */}
                  <div className="pt-1 border-t border-black/[0.05] flex items-center justify-between">
                    <span className="text-[7px] text-[#9CA3AF]">Auto-delay: 2m</span>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md bg-[#0A84FF] px-1.5 py-0.5 text-[8px] font-bold text-white shadow-xs sm:px-2 sm:text-[8.5px]"
                    >
                      <Send className="h-2 w-2" />
                      Approve & Post
                    </button>
                  </div>
                </div>
              </div>

              {/* Home Indicator */}
              <div className="border-t border-black/[0.04] bg-white py-0.8">
                <div className="mx-auto h-[2.5px] w-20 rounded-full bg-black/80 sm:w-28" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
