import Link from 'next/link'
import { AlertTriangle, ArrowLeft, CheckCircle2 } from 'lucide-react'
import { BrandLogo } from '@/components/BrandLogo'
import { getPublicServiceStatus } from '@/lib/public-service-status'

export const dynamic = 'force-dynamic'

export default async function StatusPage() {
  const service = await getPublicServiceStatus()
  const healthy = service.status === 'operational'
  return (
    <div className="min-h-screen bg-white text-neutral-900">
      <header className="mx-auto flex max-w-4xl items-center justify-between border-b border-neutral-100 px-4 py-5 sm:px-8">
        <Link href="/" className="flex min-h-11 items-center"><BrandLogo size="sm" /></Link>
        <Link href="/" className="flex min-h-11 items-center gap-1 text-sm text-neutral-500 hover:text-neutral-900"><ArrowLeft className="h-4 w-4" /> Home</Link>
      </header>
      <main className="mx-auto max-w-2xl px-4 py-14 sm:px-6">
        <p className="text-sm font-semibold text-blue-600">BuyerWatch status</p>
        <h1 className="mt-2 text-4xl font-extrabold tracking-tight">Service status</h1>
        <div role="status" className={`mt-8 rounded-2xl border p-6 ${healthy ? 'border-emerald-200 bg-emerald-50' : 'border-amber-200 bg-amber-50'}`}>
          <div className="flex items-start gap-3">
            {healthy ? <CheckCircle2 className="h-6 w-6 text-emerald-600" /> : <AlertTriangle className="h-6 w-6 text-amber-600" />}
            <div>
              <h2 className="text-lg font-bold capitalize">{service.status}</h2>
              <p className="mt-1 text-sm leading-6 text-neutral-700">{service.message}</p>
            </div>
          </div>
        </div>
        <div className="mt-6 rounded-2xl border border-neutral-200 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Reddit reply delivery</h2>
              <p className="mt-1 text-sm text-neutral-500">Secure connection and delivery safeguards</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${service.redditDelivery === 'operational' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{service.redditDelivery}</span>
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-neutral-200 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Conversation monitoring</h2>
              <p className="mt-1 text-sm text-neutral-500">Source checks and lead discovery freshness</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${service.conversationMonitoring === 'operational' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{service.conversationMonitoring}</span>
          </div>
        </div>
        <div className="mt-3 rounded-2xl border border-neutral-200 p-5">
          <div className="flex items-center justify-between gap-4">
            <div>
              <h2 className="font-bold">Customer incident notifications</h2>
              <p className="mt-1 text-sm text-neutral-500">In-app and transactional email delivery</p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold capitalize ${service.customerNotifications === 'operational' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{service.customerNotifications.replace('_', ' ')}</span>
          </div>
        </div>
        <p className="mt-6 text-xs text-neutral-400">Last checked {new Date(service.checkedAt).toLocaleString('en-US', { timeZone: 'UTC' })} UTC</p>
        <div className="mt-10 flex flex-wrap gap-4 text-sm font-semibold">
          <Link href="/contact" className="text-blue-600 hover:underline">Contact support</Link>
          <Link href="/service-policy" className="text-blue-600 hover:underline">Service and incident policy</Link>
        </div>
      </main>
    </div>
  )
}
