'use client'

import { motion } from 'framer-motion'
import Image from 'next/image'
import { Sparkles, MessageSquare, CheckCircle2, ShieldCheck, Flame, Send, Check } from 'lucide-react'

export function DeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[1140px] select-none pt-4 pb-8 sm:pb-12 lg:pb-16">
      {/* Background ambient lighting */}
      <div
        className="pointer-events-none absolute -top-16 left-1/2 -z-10 h-[400px] w-[85%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#0A84FF]/10 via-[#0A84FF]/3 to-transparent blur-[100px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full">
        {/* ========================================================
            1. MACBOOK PRO (Center / Background)
            ======================================================== */}
        <div className="relative mx-auto w-full max-w-[880px] lg:max-w-[920px]">
          {/* Display Lid / Screen Casing */}
          <div className="relative rounded-t-[18px] border-[1.5px] border-[#363942] bg-[#0C0D11] p-[6px] shadow-[0_24px_60px_rgba(0,0,0,0.22)] sm:rounded-t-[26px] sm:p-[10px] md:p-[12px]">
            {/* Screen Inner Display Bezel */}
            <div className="relative overflow-hidden rounded-t-[12px] bg-[#0A0A0C] sm:rounded-t-[16px]">
              {/* MacBook Camera Notch */}
              <div className="absolute top-0 left-1/2 z-30 flex h-[13px] w-[88px] -translate-x-1/2 items-center justify-center rounded-b-[8px] bg-[#0C0D11] shadow-sm sm:h-[17px] sm:w-[120px] sm:rounded-b-[10px]">
                <div className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#181920] ring-1 ring-white/15 sm:h-2 sm:w-2" />
                  <span className="h-1 w-1 rounded-full bg-[#0E2A1E] ring-1 ring-[#10B981]/40" />
                </div>
              </div>

              {/* Safari / macOS Top App Bar */}
              <div className="relative z-20 flex h-7 items-center justify-between border-b border-black/[0.08] bg-[#F2F3F5] px-3 sm:h-8 sm:px-4">
                {/* Traffic lights */}
                <div className="flex shrink-0 items-center gap-1.5" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F56] ring-1 ring-black/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#FFBD2E] ring-1 ring-black/10" />
                  <span className="h-2.5 w-2.5 rounded-full bg-[#27C93F] ring-1 ring-black/10" />
                </div>

                {/* URL / Title Bar */}
                <div className="mx-auto flex min-w-0 max-w-[280px] items-center gap-2 rounded-[6px] border border-black/[0.06] bg-white/95 px-3 py-0.5 text-[10px] font-medium text-[#5B6370] shadow-[0_1px_2px_rgba(0,0,0,0.03)] sm:text-[11px]">
                  <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[#10B981]" />
                  <span className="truncate font-semibold tracking-tight text-[#374151]">buyerwatch.co</span>
                  <span className="text-[#9CA3AF]">/dashboard</span>
                </div>

                {/* Right placeholders */}
                <div className="flex shrink-0 items-center gap-1.5 text-[#9CA3AF]" aria-hidden="true">
                  <span className="h-2.5 w-2.5 rounded bg-black/5" />
                  <span className="h-2.5 w-2.5 rounded bg-black/5" />
                </div>
              </div>

              {/* Dashboard Content Image */}
              <div className="relative w-full bg-white">
                <Image
                  src="/buyerwatch-dashboard-showcase-v8.png"
                  alt="BuyerWatch desktop dashboard with lead discovery feed and intent scoring"
                  width={1917}
                  height={1176}
                  sizes="(max-width: 768px) 100vw, 920px"
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
          <div className="relative -ml-[2%] w-[104%]">
            {/* Top Shelf Lip */}
            <div className="relative h-[10px] rounded-b-[4px] border-t border-white/50 bg-gradient-to-b from-[#D8DCE1] via-[#BAC0C7] to-[#9DA3AB] shadow-[0_2px_4px_rgba(0,0,0,0.18)] sm:h-[14px] sm:rounded-b-[6px]">
              {/* Center Thumb Groove */}
              <div className="mx-auto h-[4px] w-[70px] rounded-b-[5px] bg-gradient-to-b from-[#787D85] to-[#949AA2] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)] sm:h-[5.5px] sm:w-[110px] sm:rounded-b-[7px]" />
            </div>

            {/* Bottom Edge & Floor Shadow */}
            <div className="mx-auto h-[2.5px] w-[96%] rounded-b-[10px] bg-[#6E737B]" />
            <div className="mx-auto h-[10px] w-[94%] bg-black/30 blur-[12px]" />
          </div>
        </div>

        {/* ========================================================
            2. iPHONE 16 PRO (Bottom-Left Foreground)
            ======================================================== */}
        <motion.div
          initial={{ opacity: 0, y: 35, x: -10 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -left-2 bottom-[-10px] z-30 w-[185px] sm:-left-3 sm:bottom-[-16px] sm:w-[225px] md:-left-4 md:bottom-[-22px] md:w-[260px] lg:-left-2 lg:bottom-[-26px] lg:w-[285px]"
        >
          {/* Outer Titanium Chassis */}
          <div className="relative rounded-[34px] border-[2.5px] border-[#363842] bg-[#16171C] p-[5px] shadow-[-16px_22px_45px_rgba(0,0,0,0.45),-4px_6px_16px_rgba(0,0,0,0.2)] ring-1 ring-white/20 sm:rounded-[42px] sm:border-[3px] sm:p-[7px] md:rounded-[46px] md:p-[8px]">
            {/* Side Buttons */}
            <div className="absolute -left-[4px] top-[65px] h-[20px] w-[2.5px] rounded-l-xs bg-[#3A3C44] sm:top-[85px] sm:h-[26px]" />
            <div className="absolute -left-[4px] top-[95px] h-[32px] w-[2.5px] rounded-l-xs bg-[#3A3C44] sm:top-[122px] sm:h-[42px]" />
            <div className="absolute -left-[4px] top-[135px] h-[32px] w-[2.5px] rounded-l-xs bg-[#3A3C44] sm:top-[172px] sm:h-[42px]" />
            <div className="absolute -right-[4px] top-[90px] h-[44px] w-[2.5px] rounded-r-xs bg-[#3A3C44] sm:top-[115px] sm:h-[54px]" />

            {/* Mobile Screen Container */}
            <div className="relative flex flex-col overflow-hidden rounded-[28px] border border-black/10 bg-[#F9FAFB] sm:rounded-[36px] md:rounded-[38px]">
              {/* Status Bar & Dynamic Island */}
              <div className="relative z-20 flex h-[30px] items-center justify-between px-3.5 pt-1 sm:h-[38px] sm:px-4">
                <span className="text-[10px] font-bold tracking-tight text-[#111827] sm:text-[12px]">
                  9:41
                </span>

                {/* Dynamic Island */}
                <div className="absolute top-[5px] left-1/2 flex h-[16px] w-[66px] -translate-x-1/2 items-center justify-between rounded-full bg-black px-1.5 shadow-sm sm:top-[7px] sm:h-[20px] sm:w-[84px] md:w-[94px]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#1F2024] ring-1 ring-white/10" />
                  <span className="h-1 w-1 rounded-full bg-[#0A84FF] animate-pulse" />
                </div>

                {/* Battery / Wifi */}
                <div className="flex items-center gap-1 text-[#111827]">
                  <div className="flex h-2 w-3.5 items-center rounded-[2px] border border-[#111827] p-[1px]">
                    <div className="h-full w-full rounded-xs bg-[#10B981]" />
                  </div>
                </div>
              </div>

              {/* Mobile App Header */}
              <div className="flex items-center justify-between border-b border-black/[0.05] bg-white px-3 py-1.5 sm:px-3.5 sm:py-2">
                <div className="flex items-center gap-1.5">
                  <div className="flex h-4.5 w-4.5 items-center justify-center rounded-md bg-[#0A84FF] text-white shadow-xs">
                    <Flame className="h-2.5 w-2.5 fill-white" />
                  </div>
                  <span className="text-[11px] font-extrabold tracking-tight text-[#0A0A0A] sm:text-[12px]">
                    BuyerWatch
                  </span>
                </div>
                <span className="flex items-center gap-1 rounded-full border border-[#10B981]/25 bg-[#ECFDF5] px-1.5 py-0.5 text-[8.5px] font-bold text-[#059669]">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10B981] animate-pulse" />
                  Live
                </span>
              </div>

              {/* Mobile Feed */}
              <div className="space-y-1.5 p-2 sm:space-y-2 sm:p-2.5">
                {/* Stats summary badge */}
                <div className="flex items-center justify-between rounded-lg bg-white p-1.5 shadow-xs border border-black/[0.04]">
                  <div>
                    <div className="text-[8px] font-semibold text-[#6B7280] uppercase tracking-wider">High Intent</div>
                    <div className="text-[11px] font-extrabold text-[#0A0A0A] sm:text-[13px]">122 leads</div>
                  </div>
                  <span className="rounded-full bg-[#0A84FF]/10 px-1.5 py-0.5 text-[8px] font-bold text-[#0A84FF]">
                    +18 today
                  </span>
                </div>

                {/* Feed Card 1 */}
                <div className="rounded-[12px] border border-black/[0.06] bg-white p-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF4500] text-[7px] font-bold text-white">
                        r/
                      </span>
                      <span className="text-[9.5px] font-bold text-[#1F2937]">r/SaaS</span>
                      <span className="text-[8px] text-[#9CA3AF]">• 14m</span>
                    </div>
                    <span className="rounded-full bg-[#ECFDF5] px-1 py-0.2 text-[8px] font-bold text-[#059669]">
                      95% Intent
                    </span>
                  </div>

                  <p className="mt-1 text-[9.5px] font-semibold leading-snug text-[#111827]">
                    Need advice getting first 10-100 users for my SaaS startup...
                  </p>

                  <div className="mt-1.5 flex items-center justify-between pt-1 border-t border-black/[0.04]">
                    <span className="flex items-center gap-0.5 text-[8px] font-medium text-[#6B7280]">
                      <CheckCircle2 className="h-2.5 w-2.5 text-[#10B981]" /> Draft ready
                    </span>
                    <span className="flex items-center gap-0.5 rounded-md bg-[#0A84FF] px-1.5 py-0.5 text-[8.5px] font-bold text-white shadow-xs">
                      <Sparkles className="h-2 w-2" />
                      Reply
                    </span>
                  </div>
                </div>

                {/* Feed Card 2 */}
                <div className="rounded-[12px] border border-black/[0.06] bg-white p-2 shadow-xs">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-1">
                      <span className="flex h-3 w-3 items-center justify-center rounded-full bg-[#FF4500] text-[7px] font-bold text-white">
                        r/
                      </span>
                      <span className="text-[9.5px] font-bold text-[#1F2937]">r/Entrepreneur</span>
                    </div>
                    <span className="rounded-full bg-[#ECFDF5] px-1 py-0.2 text-[8px] font-bold text-[#059669]">
                      84%
                    </span>
                  </div>
                  <p className="mt-0.5 text-[9px] font-medium leading-tight text-[#4B5563] line-clamp-1">
                    Looking for restaurant management software that actually connects...
                  </p>
                </div>
              </div>

              {/* Bottom Nav */}
              <div className="mt-auto border-t border-black/[0.06] bg-white/95 px-3 py-1 backdrop-blur-md">
                <div className="flex items-center justify-around text-[#6B7280]">
                  <div className="flex flex-col items-center text-[#0A84FF]">
                    <Flame className="h-3 w-3 fill-[#0A84FF]" />
                    <span className="text-[7.5px] font-bold">Feed</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <MessageSquare className="h-3 w-3" />
                    <span className="text-[7.5px] font-medium">Drafts</span>
                  </div>
                  <div className="flex flex-col items-center">
                    <ShieldCheck className="h-3 w-3" />
                    <span className="text-[7.5px] font-medium">Rules</span>
                  </div>
                </div>
                {/* Home bar */}
                <div className="mx-auto mt-1 h-[3px] w-16 rounded-full bg-black/80 sm:w-20" />
              </div>
            </div>
          </div>
        </motion.div>

        {/* ========================================================
            3. iPAD PRO (Bottom-Right Foreground)
            ======================================================== */}
        <motion.div
          initial={{ opacity: 0, y: 35, x: 10 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -right-2 bottom-[-14px] z-30 w-[215px] sm:-right-3 sm:bottom-[-20px] sm:w-[270px] md:-right-4 md:bottom-[-26px] md:w-[320px] lg:-right-2 lg:bottom-[-30px] lg:w-[355px]"
        >
          {/* Outer Space Gray iPad Chassis */}
          <div className="relative rounded-[24px] border-[2.5px] border-[#363842] bg-[#16171C] p-[6px] shadow-[18px_24px_50px_rgba(0,0,0,0.45),4px_6px_16px_rgba(0,0,0,0.2)] ring-1 ring-white/20 sm:rounded-[30px] sm:border-[3px] sm:p-[8px] md:rounded-[34px] md:p-[9px]">
            {/* Front Camera Dot at Top */}
            <div className="absolute top-[4px] left-1/2 -translate-x-1/2">
              <span className="block h-1 w-1 rounded-full bg-[#2A2B32] ring-1 ring-white/10 sm:h-1.5 sm:w-1.5" />
            </div>

            {/* Inner iPad Screen Container */}
            <div className="relative flex flex-col overflow-hidden rounded-[18px] border border-black/10 bg-[#F8F9FA] sm:rounded-[22px] md:rounded-[25px]">
              {/* iPad Status Bar */}
              <div className="flex h-5 items-center justify-between border-b border-black/[0.04] bg-white px-3 text-[8.5px] font-bold text-[#111827] sm:h-6 sm:px-4 sm:text-[9.5px]">
                <span>9:41 AM</span>
                <div className="flex items-center gap-1 text-[8px] text-[#6B7280]">
                  <span className="font-semibold text-[#0A84FF]">iPadOS 18</span>
                  <div className="flex h-2 w-3.5 items-center rounded-[2px] border border-[#111827] p-[1px]">
                    <div className="h-full w-full rounded-xs bg-[#10B981]" />
                  </div>
                </div>
              </div>

              {/* iPad App Layout: Split Feed & Draft Review */}
              <div className="flex h-[180px] sm:h-[220px] md:h-[250px] lg:h-[275px]">
                {/* Left Feed Column */}
                <div className="w-[45%] border-r border-black/[0.06] bg-[#FAFAFA] p-1.5 sm:p-2 overflow-hidden flex flex-col gap-1.5">
                  <div className="flex items-center justify-between pb-1 border-b border-black/[0.05]">
                    <span className="text-[8.5px] font-extrabold text-[#111827] sm:text-[9.5px]">Signals</span>
                    <span className="rounded-full bg-[#0A84FF]/10 px-1 py-0.2 text-[7.5px] font-bold text-[#0A84FF]">
                      320 Found
                    </span>
                  </div>

                  {/* Feed item 1 (Active / Selected) */}
                  <div className="rounded-[8px] border border-[#0A84FF]/40 bg-white p-1.5 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold text-[#FF4500]">r/SaaS</span>
                      <span className="rounded-full bg-[#ECFDF5] px-1 text-[7px] font-bold text-[#059669]">95%</span>
                    </div>
                    <p className="mt-0.5 text-[8px] font-bold text-[#111827] line-clamp-2 leading-tight">
                      First 10-100 users for SaaS startup
                    </p>
                  </div>

                  {/* Feed item 2 */}
                  <div className="rounded-[8px] border border-black/[0.04] bg-white/70 p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold text-[#FF4500]">r/Entrepreneur</span>
                      <span className="rounded-full bg-[#ECFDF5] px-1 text-[7px] font-bold text-[#059669]">84%</span>
                    </div>
                    <p className="mt-0.5 text-[8px] font-medium text-[#4B5563] line-clamp-1 leading-tight">
                      Restaurant management tools...
                    </p>
                  </div>

                  {/* Feed item 3 */}
                  <div className="rounded-[8px] border border-black/[0.04] bg-white/70 p-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8px] font-bold text-[#0A84FF]">Bluesky</span>
                      <span className="rounded-full bg-[#ECFDF5] px-1 text-[7px] font-bold text-[#059669]">91%</span>
                    </div>
                    <p className="mt-0.5 text-[8px] font-medium text-[#4B5563] line-clamp-1 leading-tight">
                      B2B lead generation tactics...
                    </p>
                  </div>
                </div>

                {/* Right Draft Reply Column */}
                <div className="flex-1 bg-white p-2 sm:p-2.5 flex flex-col justify-between overflow-hidden">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-[8.5px] font-extrabold text-[#111827] sm:text-[9.5px]">AI Draft Reply</span>
                      <span className="flex items-center gap-0.5 text-[7.5px] font-bold text-[#059669]">
                        <Check className="h-2.5 w-2.5" /> Policy Checked
                      </span>
                    </div>

                    {/* Draft Reply Box */}
                    <div className="rounded-[8px] border border-[#0A84FF]/20 bg-[#F0F7FF] p-2 text-[8px] sm:text-[9px] leading-relaxed text-[#1E3A8A]">
                      "Hey! For getting initial users, Reddit keyword monitoring worked best for us — specifically jumping into active threads before competitors notice..."
                    </div>

                    {/* Verification badges */}
                    <div className="flex flex-wrap gap-1 text-[7px] sm:text-[7.5px] text-[#4B5563]">
                      <span className="rounded-md bg-[#F3F4F6] px-1.5 py-0.5 font-medium">✓ Disclosure included</span>
                      <span className="rounded-md bg-[#F3F4F6] px-1.5 py-0.5 font-medium">✓ No promotional spam</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="pt-1.5 border-t border-black/[0.05] flex items-center justify-between">
                    <span className="text-[7.5px] text-[#9CA3AF]">Auto-delay: 2m</span>
                    <button
                      type="button"
                      className="flex items-center gap-1 rounded-md bg-[#0A84FF] px-2 py-0.5 text-[8.5px] font-bold text-white shadow-xs"
                    >
                      <Send className="h-2 w-2" />
                      Approve & Post
                    </button>
                  </div>
                </div>
              </div>

              {/* iPad Home Indicator Bar */}
              <div className="border-t border-black/[0.04] bg-white py-1">
                <div className="mx-auto h-[3px] w-24 rounded-full bg-black/80 sm:w-32" />
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
