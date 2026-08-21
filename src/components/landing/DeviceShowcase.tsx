'use client'

import React from 'react'
import Image from 'next/image'

export function DeviceShowcase() {
  return (
    <div className="relative mx-auto w-full max-w-[1020px] select-none pt-2 pb-6 sm:pb-10">
      {/* Ambient background glow */}
      <div
        className="pointer-events-none absolute -top-12 left-1/2 -z-10 h-[450px] w-[85%] -translate-x-1/2 rounded-full bg-gradient-to-b from-[#0A84FF]/14 via-[#0A84FF]/3 to-transparent blur-[120px]"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full">
        {/* ═══════════════════════════════════════════════
            MACBOOK PRO (Standalone Centerpiece)
            ═══════════════════════════════════════════════ */}
        <div className="relative mx-auto w-full max-w-[760px] md:max-w-[860px] lg:max-w-[960px]">
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
                  sizes="(max-width: 1024px) 100vw, 960px"
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
      </div>
    </div>
  )
}
