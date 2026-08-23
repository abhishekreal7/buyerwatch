'use client'

import { useEffect, useId, useState } from 'react'
import { Sparkles, X } from 'lucide-react'
import { toast } from 'sonner'
import {
  getBillingAddonPacks,
  type BillingAddonPackId,
  type BillingAddonType,
} from '@/lib/billing-addons'

type CreditPackPickerProps = {
  initialType?: BillingAddonType
  triggerLabel?: string
  className?: string
}

/** A single, deliberate selection surface for one-time capacity purchases. */
export function CreditPackPicker({
  initialType = 'signals',
  triggerLabel = 'Add credits',
  className = '',
}: CreditPackPickerProps) {
  const dialogTitleId = useId()
  const [open, setOpen] = useState(false)
  const [type, setType] = useState<BillingAddonType>(initialType)
  const [openingPack, setOpeningPack] = useState<BillingAddonPackId | null>(null)

  useEffect(() => {
    if (!open) return
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open])

  async function openCheckout(packId: BillingAddonPackId) {
    if (openingPack) return
    setOpeningPack(packId)
    try {
      const response = await fetch('/api/billing/checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Idempotency-Key': crypto.randomUUID(),
        },
        body: JSON.stringify({ addon: type, addonPack: packId }),
      })
      const payload = await response.json().catch(() => null)
      if (!response.ok || !payload?.url) {
        throw new Error(payload?.error || 'checkout_failed')
      }
      window.location.href = payload.url
    } catch (error) {
      setOpeningPack(null)
      const message = error instanceof Error ? error.message : ''
      toast.error(message === 'addon_billing_not_configured'
        ? 'Credit packs are temporarily unavailable. No charge was created.'
        : 'Could not open secure checkout. Please try again.')
    }
  }

  const packs = getBillingAddonPacks(type)
  const unitLabel = type === 'signals' ? 'signals' : 'AI drafts'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={className}>
        {triggerLabel}
      </button>

      {open && (
        <div className="fixed inset-0 z-[80] flex items-center justify-center p-4" role="presentation">
          <button
            type="button"
            className="absolute inset-0 bg-black/35 backdrop-blur-[2px]"
            onClick={() => setOpen(false)}
            aria-label="Close credit pack selection"
          />
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            className="relative z-10 w-full max-w-[560px] overflow-hidden rounded-3xl border border-black/[0.08] bg-white shadow-[0_28px_90px_rgba(0,0,0,0.24)]"
          >
            <div className="flex items-start justify-between border-b border-black/[0.06] px-5 py-5 sm:px-6">
              <div>
                <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-blue-50 text-[#0A84FF]">
                  <Sparkles className="h-5 w-5" strokeWidth={2} />
                </div>
                <h2 id={dialogTitleId} className="text-lg font-bold tracking-tight text-gray-950">Add monthly capacity</h2>
                <p className="mt-1 text-sm text-[#667085]">Choose only what you need. Credits reset with your next plan cycle.</p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="flex h-10 w-10 items-center justify-center rounded-full text-gray-400 transition hover:bg-gray-100 hover:text-gray-700"
                aria-label="Close credit pack selection"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="px-5 pt-5 sm:px-6">
              <div className="grid grid-cols-2 rounded-xl bg-gray-100 p-1" role="tablist" aria-label="Capacity type">
                {(['signals', 'drafts'] as const).map((nextType) => (
                  <button
                    key={nextType}
                    type="button"
                    role="tab"
                    aria-selected={type === nextType}
                    onClick={() => setType(nextType)}
                    className={`min-h-10 rounded-lg px-3 text-sm font-semibold transition ${
                      type === nextType ? 'bg-white text-gray-950 shadow-sm' : 'text-gray-500 hover:text-gray-800'
                    }`}
                  >
                    {nextType === 'signals' ? 'Signals' : 'AI drafts'}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 p-5 sm:grid-cols-3 sm:p-6">
              {packs.map((pack) => (
                <button
                  key={pack.id}
                  type="button"
                  onClick={() => void openCheckout(pack.id)}
                  disabled={Boolean(openingPack)}
                  className={`relative min-h-40 rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:border-[#0A84FF]/45 hover:shadow-[0_10px_24px_rgba(10,132,255,0.12)] disabled:cursor-wait disabled:opacity-60 ${
                    pack.popular ? 'border-[#0A84FF]/35 bg-[#F7FBFF]' : 'border-gray-200 bg-white'
                  }`}
                >
                  {pack.popular && <span className="absolute -top-2.5 left-3 rounded-full bg-[#0A84FF] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">Best value</span>}
                  <p className="text-2xl font-bold tracking-tight text-gray-950">{pack.priceLabel}</p>
                  <p className="mt-2 text-sm font-semibold text-gray-900">+{pack.credits} {unitLabel}</p>
                  <p className="mt-2 text-xs leading-5 text-[#667085]">{openingPack === pack.id ? 'Opening secure checkout…' : pack.description}</p>
                </button>
              ))}
            </div>
          </section>
        </div>
      )}
    </>
  )
}
