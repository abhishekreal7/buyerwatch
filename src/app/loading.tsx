export default function Loading() {
  return (
    <main
      className="relative grid min-h-screen place-items-center overflow-hidden bg-[#FAFAF8]"
      aria-busy="true"
      aria-live="polite"
    >
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          background:
            'radial-gradient(circle at 50% 46%, rgba(33, 85, 217, 0.055), transparent 26%), radial-gradient(circle at 18% 12%, rgba(242, 90, 42, 0.045), transparent 23%)',
        }}
      />

      <div className="relative flex w-48 flex-col items-center">
        <div className="relative grid h-12 w-12 place-items-center">
          <span
            aria-hidden="true"
            className="absolute inset-0 rounded-full border"
            style={{ borderColor: 'rgba(33, 85, 217, 0.16)' }}
          />
          <svg
            aria-hidden="true"
            viewBox="0 0 48 48"
            className="h-12 w-12 animate-spin motion-reduce:animate-none"
            style={{ animationDuration: '1.35s' }}
          >
            <circle
              cx="24"
              cy="24"
              r="18"
              fill="none"
              stroke="#2155D9"
              strokeWidth="1.75"
              strokeDasharray="26 88"
              strokeLinecap="round"
            />
          </svg>
          <span
            aria-hidden="true"
            className="h-1.5 w-1.5 rounded-full"
            style={{ backgroundColor: '#2155D9' }}
          />
        </div>

        <div
          className="mt-5 text-[20px] font-semibold leading-none tracking-[-0.045em]"
          style={{ fontFamily: 'var(--font-serif), "Playfair Display", Georgia, serif' }}
        >
          <span style={{ color: '#2155D9' }}>Buyer</span>
          <span style={{ color: '#171717' }}>Watch</span>
        </div>

        <div className="mt-5 flex items-center gap-1.5" aria-hidden="true">
          <span className="h-1 w-5 rounded-full" style={{ backgroundColor: '#2155D9' }} />
          <span className="h-1 w-2 rounded-full bg-black/10" />
          <span className="h-1 w-2 rounded-full bg-black/10" />
        </div>
        <span className="sr-only">Loading BuyerWatch</span>
      </div>
    </main>
  )
}
