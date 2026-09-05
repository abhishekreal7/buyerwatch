'use client'

import Link from 'next/link'
import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'
import { toast } from 'sonner'
import { PRICING_PLANS } from '@/lib/pricing-plans'
import type { PlanTier } from '@/lib/plan-limits'
import { isStarterPromotionActive, STARTER_PROMOTION } from '@/lib/starter-promotion'

interface PricingClientProps {
  billingEnabled: boolean
  currentPlan: PlanTier | null
  currentCadence: 'monthly' | 'annual' | null
  isAuthenticated: boolean
}

type PaidPlan = (typeof PRICING_PLANS)[number]['id']

export function PricingClient({ billingEnabled, currentPlan, currentCadence, isAuthenticated }: PricingClientProps) {
  const [annual, setAnnual] = useState(currentCadence === 'annual')
  const [openingPlan, setOpeningPlan] = useState<PaidPlan | null>(null)
  const starterPromotionActive = isStarterPromotionActive()

  async function openCheckout(plan: PaidPlan) {
    if (openingPlan) return
    setOpeningPlan(plan)

    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ plan, billing: annual ? 'annual' : 'monthly' }),
      })
      const payload = await response.json().catch(() => null)

      if (!response.ok || !payload?.url) {
        const messages: Record<string, string> = {
          Unauthorized: 'Your session could not be verified. Refresh the page and try again.',
          plan_already_active: 'That plan is already active.',
          billing_subscription_requires_attention: 'Resolve the existing subscription in billing settings before changing plans.',
          billing_subscription_product_unknown: 'Your current subscription needs support review before it can be changed.',
          billing_not_configured: 'Billing is temporarily unavailable.',
        }
        throw new Error(messages[payload?.error] || 'Could not open checkout. Please try again.')
      }

      window.location.assign(payload.url)
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not open checkout. Please try again.')
      setOpeningPlan(null)
    }
  }

  return (
    <>
      <div className="flex items-center justify-center gap-3 pb-12">
        <span className={`text-[14px] font-medium ${annual ? 'text-[#999]' : 'text-[#0A0A0A]'}`}>Monthly</span>
        <button
          type="button"
          role="switch"
          aria-checked={annual}
          aria-label="Use annual billing"
          onClick={() => setAnnual(value => !value)}
          className="relative h-7 w-[52px] rounded-full bg-[#D4D4D4] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-black focus-visible:ring-offset-2"
        >
          <span className={`absolute top-[3px] h-[22px] w-[22px] rounded-full bg-white shadow-sm transition-[left] ${annual ? 'left-[27px]' : 'left-[3px]'}`} />
        </button>
        <span className={`text-[14px] font-medium ${annual ? 'text-[#0A0A0A]' : 'text-[#999]'}`}>Annual</span>
        <span className="rounded-full bg-[#0A0A0A] px-2.5 py-1 text-[11px] font-semibold text-white">Save 20%+</span>
      </div>

      {/* Plans grid */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-5 px-4 pb-20 sm:px-6 md:grid-cols-2 md:pb-24 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => {
          const hasStarterPromotion = plan.id === 'starter' && !annual && starterPromotionActive
          const price: string = hasStarterPromotion
            ? `$${STARTER_PROMOTION.introductoryMonthlyPriceUsd}`
            : annual ? plan.annualPrice : plan.price
          const checkoutAvailable = billingEnabled
          const isHighlighted = plan.highlight
          const selectedCadence = annual ? 'annual' : 'monthly'
          const isCurrentPlan = currentPlan === plan.id
            && (currentCadence === null || currentCadence === selectedCadence)
          const isOpening = openingPlan === plan.id
          const features = plan.features
          const acquisitionCta = plan.id === 'starter' && annual
            ? 'Choose Starter'
            : hasStarterPromotion ? 'Start for $19' : plan.cta
          const cta = currentPlan
            ? currentPlan === plan.id
              ? `Switch to ${annual ? 'annual' : 'monthly'} billing`
              : `Switch to ${plan.name}`
            : acquisitionCta

          return (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-[20px] p-7 transition-shadow duration-300 ${
                isHighlighted
                  ? 'bg-[#0A0A0A] text-white shadow-[0_20px_60px_rgba(0,0,0,0.22)] lg:-mt-4 lg:mb-4'
                  : 'bg-white border border-[#E8E8E8] text-[#0A0A0A] shadow-[0_2px_12px_rgba(0,0,0,0.06)] hover:shadow-[0_4px_20px_rgba(0,0,0,0.1)]'
              } ${plan.id === 'growth' ? 'md:col-span-2 md:w-[calc(50%-0.625rem)] md:justify-self-center lg:col-span-1 lg:w-auto' : ''}`}
            >
              {isCurrentPlan && (
                <span
                  className={`absolute right-5 top-5 rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-[0.12em] ${
                    isHighlighted ? 'bg-white text-black' : 'bg-black text-white'
                  }`}
                >
                  Current plan
                </span>
              )}
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
                {hasStarterPromotion && (
                  <span className={`mr-1 text-[20px] font-semibold line-through ${isHighlighted ? 'text-white/45' : 'text-[#999]'}`}>
                    ${STARTER_PROMOTION.standardMonthlyPriceUsd}
                  </span>
                )}
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
              </div>
              <p className={`-mt-2 mb-4 min-h-5 text-[12px] ${isHighlighted ? 'text-white/50' : 'text-[#777]'}`}>
                {plan.id === 'starter'
                  ? annual
                    ? `Card required · 7-day free trial · Then billed ${plan.annualTotal} once per year`
                    : hasStarterPromotion
                      ? 'Card required · 7-day free trial · Then $19 for the first month, then $39/month'
                      : 'Card required · 7-day free trial · Then billed monthly'
                  : annual
                    ? `Billed ${plan.annualTotal} once per year`
                    : 'Billed monthly'}
              </p>

              {/* Description */}
              <p
                className={`text-[14px] leading-relaxed mb-6 ${
                  isHighlighted ? 'text-white/70' : 'text-[#555]'
                }`}
              >
                {plan.description}
              </p>

              {/* CTA */}
              {isAuthenticated && checkoutAvailable && !isCurrentPlan ? (
                <button
                  type="button"
                  id={`pricing-cta-${plan.id}`}
                  onClick={() => void openCheckout(plan.id)}
                  disabled={Boolean(openingPlan)}
                  className={`mb-6 flex w-full items-center justify-center gap-2 rounded-[12px] py-3 text-[14px] font-semibold transition-all duration-200 disabled:cursor-wait disabled:opacity-65 ${
                    isHighlighted
                      ? 'bg-white text-[#0A0A0A] hover:bg-white/90'
                      : 'bg-[#0A0A0A] text-white hover:bg-[#1C1C1E]'
                  }`}
                >
                  {isOpening ? 'Opening secure checkout…' : cta}
                  {!isOpening && <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />}
                </button>
              ) : (
                <Link
                  href={isCurrentPlan
                    ? '/settings?section=plan'
                    : checkoutAvailable
                      ? annual
                        ? `/signup?plan=${plan.id}&billing=annual`
                        : plan.href
                      : '/contact'}
                  id={`pricing-cta-${plan.id}`}
                  className={`mb-6 flex w-full items-center justify-center gap-2 rounded-[12px] py-3 text-[14px] font-semibold transition-all duration-200 ${
                    isHighlighted
                      ? 'bg-white text-[#0A0A0A] hover:bg-white/90'
                      : 'bg-[#0A0A0A] text-white hover:bg-[#1C1C1E]'
                  }`}
                >
                  {isCurrentPlan
                    ? `Current plan${currentCadence ? ` · ${currentCadence === 'annual' ? 'Annual' : 'Monthly'}` : ''}`
                    : checkoutAvailable ? cta : `Contact us about ${plan.name}`}
                  {!isCurrentPlan && <ArrowUpRight className="h-4 w-4" strokeWidth={2.5} />}
                </Link>
              )}

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
                {features.map((f) => (
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
