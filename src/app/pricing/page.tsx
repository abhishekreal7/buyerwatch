import Link from 'next/link'
import { Check, ArrowRight } from 'lucide-react'
import { getProviderCapabilities } from '@/lib/env'
import { BrandLogo } from '@/components/BrandLogo'
import { PRICING_PLANS } from '@/lib/pricing-plans'

export const metadata = {
  title: 'Pricing — BuyerWatch',
  description: 'Simple, transparent pricing. Start free, upgrade when you need more signal coverage.',
}

export const dynamic = 'force-dynamic'

export default function PricingPage() {
  const billingEnabled = getProviderCapabilities().billing

  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-black selection:text-white">
      {/* Nav */}
      <nav className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-5 sm:px-6 sm:py-6">
        <Link href="/" className="flex min-h-11 items-center gap-2 hover:opacity-80 transition-opacity">
          <BrandLogo />
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="inline-flex min-h-11 items-center px-1 text-[13px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors">
            Log in
          </Link>
          <Link href="/signup" className="inline-flex min-h-11 items-center text-[13px] font-semibold text-white bg-[#0A0A0A] hover:bg-[#1C1C1E] px-4 py-2 rounded-xl transition-colors">
            Get started free
          </Link>
        </div>
      </nav>

      {/* Header */}
      <div className="px-4 pb-10 pt-12 text-center sm:px-6 sm:pb-12 sm:pt-16">
        <h1 className="mb-4 text-[36px] font-bold leading-tight tracking-tight text-[#0A0A0A] sm:text-[42px]">
          Simple, transparent pricing
        </h1>
        <p className="text-[17px] text-[#666666] max-w-[480px] mx-auto leading-relaxed">
          Start free with your first keyword rule. Upgrade when you need more coverage.
        </p>
      </div>

      {/* Plans */}
      <div className="mx-auto grid max-w-5xl grid-cols-1 gap-6 px-4 pb-20 sm:px-6 md:grid-cols-2 md:pb-24 lg:grid-cols-3">
        {PRICING_PLANS.map((plan) => {
          const paidPlan = plan.name !== 'Free'
          const checkoutAvailable = !paidPlan || billingEnabled
          return (
          <div
            key={plan.name}
            className={`rounded-2xl p-7 flex flex-col border ${
              plan.highlight
                ? 'bg-[#0A0A0A] border-[#0A0A0A] text-white shadow-[0_8px_40px_rgba(0,0,0,0.18)]'
                : 'bg-white border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
            } ${plan.id === 'growth' ? 'md:col-span-2 md:w-[calc(50%-0.75rem)] md:justify-self-center lg:col-span-1 lg:w-auto' : ''}`}
          >
            <div className="mb-6">
              <p className={`text-[12px] font-bold uppercase tracking-widest mb-3 ${plan.highlight ? 'text-white/50' : 'text-[#888888]'}`}>
                {plan.name}
              </p>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-[40px] font-bold tracking-tight">{plan.price}</span>
                <span className={`text-[14px] font-medium ${plan.highlight ? 'text-white/50' : 'text-[#888888]'}`}>
                  {plan.period}
                </span>
              </div>
              <p className={`text-[14px] leading-relaxed ${plan.highlight ? 'text-white/70' : 'text-[#666666]'}`}>
                {plan.description}
              </p>
            </div>

            <ul className="space-y-3 flex-1 mb-8">
              {plan.features.map((f) => (
                <li key={f} className="flex items-start gap-2.5 text-[14px]">
                  <Check
                    className={`w-4 h-4 mt-0.5 shrink-0 ${plan.highlight ? 'text-white/60' : 'text-[#0A84FF]'}`}
                    strokeWidth={2.5}
                  />
                  <span className={plan.highlight ? 'text-white/80' : 'text-[#444444]'}>{f}</span>
                </li>
              ))}
            </ul>

            <Link
              href={checkoutAvailable ? plan.href : '/contact'}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold transition-all duration-200 ${
                plan.highlight
                  ? 'bg-white text-[#0A0A0A] hover:bg-white/90'
                  : 'bg-[#0A0A0A] text-white hover:bg-[#1C1C1E]'
              }`}
            >
              {checkoutAvailable ? plan.cta : `Contact us about ${plan.name}`}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </Link>
          </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="text-center pb-12 text-[13px] text-[#888888]">
        <p>Questions? <Link href="/contact" className="inline-flex min-h-11 items-center align-middle underline underline-offset-4 hover:text-[#0A0A0A] transition-colors">Talk to us</Link></p>
      </div>
    </div>
  )
}
