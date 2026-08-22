import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { SUPPORT_EMAIL } from '@/lib/public-config'

export default function ServicePolicyPage() {
  return (
    <div className="min-h-screen bg-white text-neutral-900 pb-20">
      <header className="mx-auto flex max-w-5xl items-center justify-between border-b border-neutral-100 px-4 py-5 sm:px-8">
        <Link href="/" className="flex min-h-11 items-center"><BrandLogo size="sm" /></Link>
        <Link href="/" className="flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ArrowLeft className="h-4 w-4" /> Home</Link>
      </header>
      <main className="mx-auto max-w-3xl px-4 pt-12 sm:px-6">
        <h1 className="text-4xl font-extrabold tracking-tight">Service and incident policy</h1>
        <p className="mt-2 text-sm text-neutral-400">Last updated: August 22, 2026</p>
        <div className="mt-10 space-y-8 text-[15px] leading-7 text-neutral-600">
          <section><h2 className="text-xl font-bold text-neutral-900">Safe delivery behavior</h2><p className="mt-3">If BuyerWatch cannot verify that Reddit delivery is safe, it pauses delivery. An uncertain attempt is never retried automatically. The delivery history shows whether an attempt is queued, sending, sent, failed, uncertain, or cancelled.</p></section>
          <section><h2 className="text-xl font-bold text-neutral-900">Incident communication</h2><p className="mt-3">Affected customers receive an in-app notice and an email to their account address. Global delivery incidents are published on the <Link href="/status" className="font-semibold text-blue-600 hover:underline">status page</Link>. Delivery resumes automatically only after a transient health check recovers; safety-critical incidents require manual verification.</p></section>
          <section><h2 className="text-xl font-bold text-neutral-900">Support and billing review</h2><p className="mt-3">For a delivery incident, email <a href={`mailto:${SUPPORT_EMAIL}?subject=Delivery%20incident`} className="font-semibold text-blue-600 hover:underline">{SUPPORT_EMAIL}</a> with the subject “Delivery incident.” If you were charged while a core paid service was materially unavailable because of a BuyerWatch system failure, contact us within 30 days. We will review the affected period and provide an appropriate prorated credit or refund where justified or legally required. This does not limit statutory consumer rights.</p></section>
          <section><h2 className="text-xl font-bold text-neutral-900">What we need</h2><p className="mt-3">Include the account email, approximate time, Reddit thread URL if available, and what the delivery history shows. Never email your Reddit password, 2FA secret, cookies, or API keys.</p></section>
        </div>
      </main>
    </div>
  )
}
