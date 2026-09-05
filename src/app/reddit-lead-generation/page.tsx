import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check, ShieldCheck } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Reddit Lead Generation for SaaS Teams',
  description: 'Find relevant Reddit conversations, identify buyer intent, and prepare useful replies for review with BuyerWatch.',
  alternates: { canonical: '/reddit-lead-generation' },
  openGraph: {
    title: 'Reddit Lead Generation for SaaS Teams',
    description: 'Find relevant Reddit conversations, identify buyer intent, and prepare useful replies for review with BuyerWatch.',
    url: 'https://www.buyerwatch.co/reddit-lead-generation',
    type: 'article',
  },
}

const steps = [
  ['Monitor the conversations that matter', 'Add keywords, pain points, and communities. BuyerWatch checks configured sources on your plan cadence.'],
  ['Prioritize genuine buying signals', 'Posts are scored against context such as problem awareness, product research, and urgency so you can review the strongest matches first.'],
  ['Draft a helpful response', 'Your product description, tone preferences, and the original thread context guide a draft. You decide what to edit, copy, or post.'],
]

export default function RedditLeadGenerationPage() {
  return (
    <main className="min-h-screen bg-white text-[#0A0A0A]">
      <header className="border-b border-black/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-semibold tracking-tight">BuyerWatch</Link>
          <Link href="/pricing" className="text-sm text-[#555] hover:text-black">View pricing</Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-20 text-center sm:pt-28">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#0A84FF]">Reddit lead generation</p>
        <h1 className="text-4xl font-extrabold tracking-[-0.04em] sm:text-6xl">
          Find demand on Reddit before it disappears.
        </h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#606060]">
          BuyerWatch helps SaaS founders and marketers discover relevant Reddit conversations, understand buying intent, and prepare thoughtful replies without spending every day scrolling.
        </p>
        <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
          <Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#222]">
            Start your 7-day trial <ArrowRight className="h-4 w-4" />
          </Link>
          <Link href="/#how-it-works" className="inline-flex items-center justify-center rounded-full border border-black/10 px-6 py-3.5 text-sm font-semibold hover:bg-black/[0.03]">
            See how it works
          </Link>
        </div>
      </section>

      <section className="border-y border-black/[0.06] bg-[#fafafa]">
        <div className="mx-auto grid max-w-6xl gap-10 px-6 py-16 md:grid-cols-3">
          {steps.map(([title, body], index) => (
            <article key={title}>
              <p className="text-sm font-semibold text-[#0A84FF]">0{index + 1}</p>
              <h2 className="mt-3 text-xl font-bold tracking-tight">{title}</h2>
              <p className="mt-3 text-[15px] leading-7 text-[#666]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-12 px-6 py-20 md:grid-cols-[1.1fr_0.9fr] md:items-start">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.16em] text-[#0A84FF]">Built for useful conversations</p>
          <h2 className="mt-4 text-3xl font-extrabold tracking-[-0.03em]">Lead generation without dropping a generic pitch.</h2>
          <p className="mt-5 text-[16px] leading-8 text-[#666]">
            The goal is not to flood communities with automated comments. BuyerWatch keeps the original thread attached, gives you the evidence behind a match, and makes review the default so your response can add something useful.
          </p>
        </div>
        <div className="rounded-2xl border border-black/10 bg-white p-6 shadow-sm">
          <div className="flex items-start gap-3">
            <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
            <div>
              <h3 className="font-semibold">Review-first by design</h3>
              <p className="mt-2 text-sm leading-6 text-[#666]">You choose what to publish. Optional automation is guarded by plan limits, trust checks, and delivery safeguards.</p>
            </div>
          </div>
          <ul className="mt-6 space-y-3 text-sm text-[#444]">
            {['Original thread context stays attached', 'Intent scores help sort the queue', 'No promise of guaranteed reach or conversions'].map((item) => (
              <li key={item} className="flex gap-2"><Check className="h-4 w-4 shrink-0 text-emerald-600" />{item}</li>
            ))}
          </ul>
        </div>
      </section>

      <section className="bg-[#0A0A0A] px-6 py-16 text-center text-white">
        <h2 className="text-3xl font-extrabold tracking-tight">Turn relevant conversations into your next opportunity.</h2>
        <p className="mx-auto mt-4 max-w-xl text-[#b8b8b8]">Start free, configure your signals, and review the first matches before you commit to a paid plan.</p>
        <Link href="/signup" className="mt-7 inline-flex items-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black hover:bg-[#f0f0f0]">Create your account <ArrowRight className="h-4 w-4" /></Link>
      </section>
    </main>
  )
}
