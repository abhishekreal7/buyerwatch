'use client'

import React from 'react'
import { motion } from 'framer-motion'
import Image from 'next/image'

export function DeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[1100px] select-none pt-4 pb-8 sm:pb-12">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-[450px] w-[85%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#0A84FF]/14 via-[#0A84FF]/3 to-transparent blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full">
        {/* ═══════════════════════════════════════════════
            1. MACBOOK PRO (Centerpiece Background)
            ═══════════════════════════════════════════════ */}
        <div className="relative mx-auto w-full max-w-[680px] md:max-w-[760px] lg:max-w-[830px]">
          {/* Display Lid Outer Bezel */}
          <div className="relative rounded-t-[16px] border-[1.5px] border-[#383B46] bg-[#0E0F14] p-[5px] shadow-[0_30px_90px_rgba(0,0,0,0.7)] ring-1 ring-white/10 sm:rounded-t-[24px] sm:p-[8px] md:p-[11px]">
            {/* Screen Inner Display */}
            <div className="relative overflow-hidden rounded-t-[10px] bg-[#0A0A0E] sm:rounded-t-[15px]">
              {/* macOS Window Titlebar */}
              <div className="relative z-20 flex h-6 items-center justify-between border-b border-black/[0.08] bg-[#F3F4F6] px-2.5 sm:h-7.5 sm:px-3.5">
                {/* Traffic Lights */}
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
                <div className="hidden sm:flex items-center gap-1 rounded-md border border-black/[0.06] bg-white/95 px-2 py-0.5 text-[9.5px] font-medium text-[#4B5563] shadow-xs">
                  <span className="h-1.5 w-1.5 rounded-full bg-[#10B981]" />
                  <span className="font-semibold text-[#111827]">buyerwatch.co</span>
                  <span className="text-[#9CA3AF]">/dashboard</span>
                </div>
              </div>

              {/* Real Desktop Dashboard Screenshot */}
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
              <div className="mx-auto h-[3.5px] w-[65px] rounded-b-[4px] bg-gradient-to-b from-[#7A7F87] to-[#9298A1] shadow-[inset_0_1px_2px_rgba(0,0,0,0.4)] sm:h-[5px] sm:w-[100px] sm:rounded-b-[6px]" />
            </div>
            <div className="mx-auto h-[2.5px] w-[96%] rounded-b-[10px] bg-[#6B7078]" />
            <div className="mx-auto h-[12px] w-[94%] bg-black/40 blur-[14px]" />
          </div>
        </div>

        {/* ═══════════════════════════════════════════════
            2. iPHONE 16 PRO (Slender Vertical 9:19.5 Phone)
            ═══════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 28, x: -10 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -left-2 bottom-[-8px] z-30
            w-[115px] h-[250px]
            sm:left-[1%] sm:bottom-[-12px] sm:w-[140px] sm:h-[305px]
            md:left-[2%] md:bottom-[-16px] md:w-[155px] md:h-[335px]
            lg:left-[3%] lg:bottom-[-18px] lg:w-[170px] lg:h-[370px]"
        >
          {/* Titanium Phone Frame */}
          <div className="relative h-full w-full rounded-[24px] border-[2px] border-[#3C3E4B] bg-[#16171D] p-[4px]
            shadow-[-18px_22px_45px_rgba(0,0,0,0.7),-3px_5px_14px_rgba(0,0,0,0.3)]
            ring-1 ring-white/[0.18]
            sm:rounded-[32px] sm:border-[2.5px] sm:p-[5px]
            lg:rounded-[36px] lg:p-[6px]">
            {/* Side Buttons */}
            <div className="absolute -left-[3px] top-[48px] h-[12px] w-[1.5px] rounded-l-sm bg-[#3A3C44] sm:top-[58px] sm:h-[16px]" />
            <div className="absolute -left-[3px] top-[68px] h-[20px] w-[1.5px] rounded-l-sm bg-[#3A3C44] sm:top-[82px] sm:h-[26px]" />
            <div className="absolute -left-[3px] top-[95px] h-[20px] w-[1.5px] rounded-l-sm bg-[#3A3C44] sm:top-[115px] sm:h-[26px]" />
            <div className="absolute -right-[3px] top-[65px] h-[28px] w-[1.5px] rounded-r-sm bg-[#3A3C44] sm:top-[78px] sm:h-[36px]" />

            {/* Phone Screen Container */}
            <div className="relative h-full w-full overflow-hidden rounded-[20px] bg-white sm:rounded-[26px] lg:rounded-[30px]">
              {/* Dynamic Island */}
              <div className="absolute top-[4px] left-1/2 -translate-x-1/2 z-20 flex h-[9px] w-[38px] items-center justify-center rounded-full bg-black sm:top-[5px] sm:h-[12px] sm:w-[50px]" />

              {/* Real BuyerWatch Phone Screen */}
              <Image
                src="/buyerwatch-phone-real.png"
                alt="BuyerWatch mobile app"
                width={580}
                height={1030}
                priority
                unoptimized
                className="block h-full w-full object-cover object-top"
              />
            </div>
          </div>
        </motion.div>

        {/* ═══════════════════════════════════════════════
            3. iPAD PRO (Wide Portrait 3:4 Tablet)
            ═══════════════════════════════════════════════ */}
        <motion.div
          initial={{ opacity: 0, y: 28, x: 10 }}
          whileInView={{ opacity: 1, y: 0, x: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.55, delay: 0.15, ease: [0.16, 1, 0.3, 1] }}
          className="absolute -right-2 bottom-[-8px] z-30
            w-[185px] h-[245px]
            sm:right-[1%] sm:bottom-[-12px] sm:w-[235px] sm:h-[310px]
            md:right-[2%] md:bottom-[-16px] md:w-[265px] md:h-[350px]
            lg:right-[3%] lg:bottom-[-18px] lg:w-[295px] lg:h-[390px]"
        >
          {/* Space Black iPad Frame */}
          <div className="relative h-full w-full rounded-[16px] border-[2px] border-[#3C3E4B] bg-[#16171D] p-[5px]
            shadow-[18px_22px_45px_rgba(0,0,0,0.7),3px_5px_14px_rgba(0,0,0,0.3)]
            ring-1 ring-white/[0.18]
            sm:rounded-[22px] sm:border-[2.5px] sm:p-[6px]
            lg:rounded-[26px] lg:p-[7px]">
            {/* Front Camera Dot */}
            <div className="absolute top-[3px] left-1/2 -translate-x-1/2 z-20 h-[4px] w-[4px] rounded-full bg-[#2A2B32] ring-1 ring-white/10 sm:h-[5px] sm:w-[5px]" />

            {/* iPad Screen Container */}
            <div className="relative h-full w-full overflow-hidden rounded-[11px] bg-white sm:rounded-[15px] lg:rounded-[18px]">
              {/* Real BuyerWatch iPad Screen */}
              <Image
                src="/buyerwatch-ipad-real.png"
                alt="BuyerWatch tablet app"
                width={985}
                height={1085}
                priority
                unoptimized
                className="block h-full w-full object-cover object-top"
              />
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  )
}
