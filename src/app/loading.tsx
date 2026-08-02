import { BrandLogo } from '@/components/BrandLogo'

export default function Loading() {
  return (
    <main
      className="grid min-h-screen place-items-center bg-[#F7F7F5]"
      aria-busy="true"
      aria-live="polite"
    >
      <div className="flex flex-col items-center">
        <BrandLogo size="xl" />
        <div
          className="mt-7 h-px w-44 overflow-hidden bg-[#DFDFDB]"
          aria-hidden="true"
        >
          <span className="buyerwatch-loading-indicator block h-full w-16 bg-[#15265F]" />
        </div>
        <span className="sr-only">Loading BuyerWatch</span>
      </div>
    </main>
  )
}
