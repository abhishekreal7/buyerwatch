'use client'

import Link from 'next/link'
import { ArrowUpRight } from 'lucide-react'
import { PRICING_PLANS } from '@/lib/pricing-plans'

interface PricingClientProps {
  billingEnabled: boolean
}

export function PricingClient({ billingEnabled }: PricingClientProps) {
  return (
    <>
      <div className="flex items-center justify-center pb-12">
        <span className="rounded-full border border-[#D8D8D4] bg-white px-3 py-1 text-[13px] font-medium text-[#555]">
          Monthly billing
        </span>
      </div>

      {/* Plans grid */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-4 pb-20 sm:px-6 md:grid-cols-2 md:pb-24 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => {
          const price: string = plan.price
          const paidPlan = price !== '$0' && price !== 'Custom'
          const checkoutAvailable = !paidPlan || billingEnabled
          const isHighlighted = plan.highlight

          return (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-[20px] p-7 transition-shadow duration-300 ${
                isHighlighted
                  ? 'bg-[#0A0A0A] text-white shadow-[0_20px_60px_rgba(0,0,0,0.22)] lg:-mt-4 lg:mb-4'
                  : 'bg-white border border-[#E8E8E8] text-[#0A0A0A] shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)]'
              } ${plan.id === 'growth' ? 'md:col-span-2 md:w-[calc(50%-0.625rem)] md:justify-self-center lg:col-span-1 lg:w-auto' : ''}`}
            >
              {/* Card header */}
              <div className="mb-5">
                <p
                  className={`font-[family-name:var(--font-jakarta)] text-[20px] font-medium tracking-[-0.01em] mb-0.5 ${
                    isHighlighted ? 'text-white' : 'text-[#0A0A0A]'
                  }`}
                >
                  {plan.name}
                </p>
                <p
                  className={`text-[13px] ${
                    isHighlighted ? 'text-white/50' : 'text-[#888]'
                  }`}
                >
                  {plan.id === 'starter'
                    ? 'For getting signal live'
                    : plan.id === 'pro'
                    ? 'For active founders'
                    : 'For growing teams'}
                </p>
              </div>

              {/* Price */}
              <div className="mb-4 flex items-baseline gap-1">
                <span className="text-[46px] font-bold tracking-tight leading-none">
                  {price}
                </span>
                {price !== '$0' && (
                  <span
                    className={`text-[14px] font-medium ${
                      isHighlighted ? 'text-white/50' : 'text-[#888]'
                    }`}
                  >
                    {plan.period}
                  </span>
                )}
                {price === '$0' && (
                  <span
                    className={`text-[14px] font-medium ${
                      isHighlighted ? 'text-white/50' : 'text-[#888]'
                    }`}
                  >
                    forever
                  </span>
                )}
              </div>

              {/* Description */}
              <p
                className={`text-[14px] leading-relaxed mb-6 ${
                  isHighlighted ? 'text-white/70' : 'text-[#555]'
                }`}
              >
                {plan.description}
              </p>

              {/* CTA */}
              <Link
                href={checkoutAvailable ? plan.href : '/contact'}
                id={`pricing-cta-${plan.id}`}
                className={`mb-6 flex w-full items-center justify-center gap-2 rounded-[12px] py-3 text-[14px] font-semibold transition-all duration-200 ${
                  isHighlighted
                    ? 'bg-white text-[#0A0A0A] hover:bg-white/90'
                    : 'bg-[#0A0A0A] text-white hover:bg-[#1C1C1E]'
                }`}
              >
                {checkoutAvailable ? plan.cta : `Contact us about ${plan.name}`}
                <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />
              </Link>

              {/* Divider */}
              <div
                className={`mb-5 h-px w-full ${
                  isHighlighted ? 'bg-white/10' : 'bg-[#EBEBEB]'
                }`}
              />

              {/* Features */}
              <p
                className={`mb-3 text-[12px] font-semibold uppercase tracking-widest ${
                  isHighlighted ? 'text-white/40' : 'text-[#999]'
                }`}
              >
                What&apos;s included
              </p>
              <ul className="flex-1 space-y-3">
                {plan.features.map((f) => (
                  <li key={f} className="flex items-start gap-2.5 text-[14px]">
                    {/* Filled circle check icon */}
                    <span
                      className={`mt-0.5 flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full ${
                        isHighlighted ? 'bg-white/15' : 'bg-[#0A0A0A]'
                      }`}
                    >
                      <svg
                        width="10"
                        height="10"
                        viewBox="0 0 10 10"
                        fill="none"
                        aria-hidden="true"
                      >
                        <path
                          d="M1.5 5L3.8 7.5L8.5 2.5"
                          stroke={isHighlighted ? 'white' : 'white'}
                          strokeWidth="1.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                        />
                      </svg>
                    </span>
                    <span
                      className={
                        isHighlighted ? 'text-white/80' : 'text-[#444]'
                      }
                    >
                      {f}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )
        })}
      </div>
      <p className="mx-auto -mt-12 max-w-2xl px-4 pb-16 text-center text-[12px] leading-relaxed text-[#777]">
        Prices are in USD and exclude applicable taxes. Dodo Payments may convert
        the charge to your local currency and add any disclosed currency-conversion fees at checkout.
      </p>
    </>
  )
}
