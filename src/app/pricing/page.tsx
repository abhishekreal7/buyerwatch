import Link from 'next/link'
import { Target, Check, ArrowRight } from 'lucide-react'

export const metadata = {
  title: 'Pricing — Scouto',
  description: 'Simple, transparent pricing. Start free, upgrade when you need more signal coverage.',
}

const PLANS = [
  {
    name: 'Free',
    price: '$0',
    period: 'forever',
    description: 'Try Scouto and get your first real buying signal.',
    features: [
      '1 keyword monitoring rule',
      'Up to 50 signals discovered/month',
      '40 AI-drafted replies/month',
      'Manual send workflow',
      'Reddit & Bluesky',
    ],
    cta: 'Get started free',
    href: '/signup',
    highlight: false,
  },
  {
    name: 'Professional',
    price: '$49',
    period: '/month',
    description: 'For founders actively working a social selling motion.',
    features: [
      '10 keyword monitoring rules',
      'Up to 1,000 signals/month',
      '400 AI-drafted replies/month',
      'Auto-send (confidence-gated)',
      'Subreddit targeting',
      'Slack notifications',
      'Reply attribution tracking',
    ],
    cta: 'Upgrade to Professional',
    href: '/dashboard',
    highlight: true,
  },
  {
    name: 'Growth',
    price: '$149',
    period: '/month',
    description: 'For teams running multi-channel signal monitoring at scale.',
    features: [
      '50 keyword monitoring rules',
      'Up to 5,000 signals/month',
      '2,000 AI-drafted replies/month',
      'Auto-send (confidence-gated)',
      'All platforms',
      'Priority support',
    ],
    cta: 'Upgrade to Growth',
    href: '/dashboard',
    highlight: false,
  },
]

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-[#FAFAFA] font-sans selection:bg-black selection:text-white">
      {/* Nav */}
      <nav className="w-full max-w-6xl mx-auto px-6 py-6 flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
          <Target className="w-6 h-6 text-[#0A84FF]" strokeWidth={2.5} />
          <span className="text-lg font-bold tracking-tight text-[#0A0A0A]">Scouto</span>
        </Link>
        <div className="flex items-center gap-4">
          <Link href="/login" className="text-[13px] font-medium text-[#666666] hover:text-[#0A0A0A] transition-colors">
            Log in
          </Link>
          <Link href="/signup" className="text-[13px] font-semibold text-white bg-[#0A0A0A] hover:bg-[#1C1C1E] px-4 py-2 rounded-xl transition-colors">
            Get started free
          </Link>
        </div>
      </nav>

      {/* Header */}
      <div className="text-center pt-16 pb-12 px-6">
        <h1 className="text-[42px] font-bold tracking-tight text-[#0A0A0A] mb-4 leading-tight">
          Simple, transparent pricing
        </h1>
        <p className="text-[17px] text-[#666666] max-w-[480px] mx-auto leading-relaxed">
          Start free with your first keyword rule. Upgrade when you need more coverage.
        </p>
      </div>

      {/* Plans */}
      <div className="max-w-5xl mx-auto px-6 pb-24 grid grid-cols-1 md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <div
            key={plan.name}
            className={`rounded-2xl p-7 flex flex-col border ${
              plan.highlight
                ? 'bg-[#0A0A0A] border-[#0A0A0A] text-white shadow-[0_8px_40px_rgba(0,0,0,0.18)]'
                : 'bg-white border-black/[0.08] shadow-[0_1px_3px_rgba(0,0,0,0.04)]'
            }`}
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
              href={plan.href}
              className={`w-full flex items-center justify-center gap-2 py-3 rounded-xl text-[14px] font-semibold transition-all duration-200 ${
                plan.highlight
                  ? 'bg-white text-[#0A0A0A] hover:bg-white/90'
                  : 'bg-[#0A0A0A] text-white hover:bg-[#1C1C1E]'
              }`}
            >
              {plan.cta}
              <ArrowRight className="w-4 h-4" strokeWidth={2.5} />
            </Link>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div className="text-center pb-12 text-[13px] text-[#888888]">
        <p>Questions? <Link href="/contact" className="underline underline-offset-4 hover:text-[#0A0A0A] transition-colors">Talk to us</Link></p>
      </div>
    </div>
  )
}
