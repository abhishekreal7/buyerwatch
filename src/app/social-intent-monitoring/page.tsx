import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowRight, Check } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Social Intent Monitoring for Buyer Conversations',
  description: 'Monitor Reddit, Bluesky, and eligible X conversations, prioritize buyer intent, and prepare useful replies in one review queue with BuyerWatch.',
  alternates: { canonical: '/social-intent-monitoring' },
  openGraph: {
    title: 'Social Intent Monitoring for Buyer Conversations',
    description: 'Monitor relevant conversations across Reddit, Bluesky, and eligible X access in one focused workflow.',
    url: 'https://www.buyerwatch.co/social-intent-monitoring',
    type: 'website',
  },
}

const platforms = [
  ['Reddit', 'Community discovery', 'Find problem-aware threads, recommendations, and buying questions in the communities that matter to your product.'],
  ['Bluesky', 'Public discovery', 'Discover relevant public posts early and move the strongest opportunities into a review-first reply workflow.'],
  ['X / Twitter', 'Controlled rollout', 'Track fast-moving buyer conversations when discovery access is enabled for your workspace.'],
]

export default function SocialIntentMonitoringPage() {
  return (
    <main className="min-h-screen bg-white text-[#0A0A0A]">
      <header className="border-b border-black/[0.06]">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-5">
          <Link href="/" className="font-semibold tracking-tight">BuyerWatch</Link>
          <Link href="/pricing" className="text-sm text-[#555] hover:text-black">View pricing</Link>
        </div>
      </header>

      <section className="mx-auto max-w-4xl px-6 pb-20 pt-20 text-center sm:pt-28">
        <p className="mb-5 text-sm font-semibold uppercase tracking-[0.16em] text-[#0A84FF]">Social intent monitoring</p>
        <h1 className="text-4xl font-extrabold tracking-[-0.04em] sm:text-6xl">One focused queue for the conversations that matter.</h1>
        <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-[#606060]">BuyerWatch brings relevant public conversations from Reddit and Bluesky—and eligible X workspaces—into one place to score, review, and respond thoughtfully.</p>
        <Link href="/signup" className="mt-8 inline-flex items-center gap-2 rounded-full bg-[#0A0A0A] px-6 py-3.5 text-sm font-semibold text-white hover:bg-[#222]">Start with the free plan <ArrowRight className="h-4 w-4" /></Link>
      </section>

      <section className="border-y border-black/[0.06] bg-[#fafafa]">
        <div className="mx-auto grid max-w-6xl gap-4 px-6 py-16 md:grid-cols-3">
          {platforms.map(([name, status, body]) => (
            <article key={name} className="rounded-2xl border border-black/10 bg-white p-7">
              <div className="flex items-center justify-between gap-3"><h2 className="text-xl font-bold">{name}</h2><span className="text-[10px] font-bold uppercase tracking-[0.1em] text-[#777]">{status}</span></div>
              <p className="mt-4 text-[15px] leading-7 text-[#666]">{body}</p>
            </article>
          ))}
        </div>
      </section>

      <section className="mx-auto grid max-w-5xl gap-12 px-6 py-20 md:grid-cols-2 md:items-center">
        <div><h2 className="text-3xl font-extrabold tracking-[-0.03em]">From signal to useful response.</h2><p className="mt-5 text-[16px] leading-8 text-[#666]">Set keywords and buying-signal rules, let BuyerWatch prioritize the strongest matches, then keep the source evidence attached while you review a product-aware draft.</p></div>
        <ul className="space-y-4 rounded-2xl border border-black/10 p-7 text-sm text-[#444]">{['Platform and thread context stays attached', 'Intent scores help sort the queue', 'Review-first workflow protects your voice', 'Plan limits and delivery safeguards remain visible'].map((item) => <li key={item} className="flex gap-3"><Check className="h-4 w-4 shrink-0 text-emerald-600" />{item}</li>)}</ul>
      </section>

      <section className="bg-[#0A0A0A] px-6 py-16 text-center text-white"><h2 className="text-3xl font-extrabold tracking-tight">Meet buyers where they already talk.</h2><p className="mx-auto mt-4 max-w-xl text-[#b8b8b8]">Start with Reddit and Bluesky today. Ask us about X discovery access for your workspace.</p><div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row"><Link href="/signup" className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold text-black">Create your account <ArrowRight className="h-4 w-4" /></Link><Link href="/contact" className="inline-flex items-center justify-center rounded-full border border-white/25 px-6 py-3.5 text-sm font-semibold text-white hover:bg-white/10">Ask about X access</Link></div></section>
    </main>
  )
}
