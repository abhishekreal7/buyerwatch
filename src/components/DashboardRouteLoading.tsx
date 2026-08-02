export function DashboardRouteLoading() {
  return (
    <div className="space-y-5" aria-busy="true" aria-live="polite">
      <div className="flex items-end justify-between gap-4">
        <div className="space-y-2.5">
          <div className="h-7 w-40 animate-pulse rounded-md bg-[#E7E7E3]" />
          <div className="h-3 w-72 max-w-full animate-pulse rounded bg-[#EFEFED]" />
        </div>
        <div className="hidden h-9 w-28 animate-pulse rounded-[10px] bg-[#E7E7E3] sm:block" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-[104px] rounded-[16px] border border-[#E7E7E3] bg-white p-4"
          >
            <div className="h-3 w-24 animate-pulse rounded bg-[#E9E9E6]" />
            <div className="mt-6 h-6 w-10 animate-pulse rounded bg-[#E1E1DD]" />
          </div>
        ))}
      </div>
      <div className="h-12 rounded-[14px] border border-[#E7E7E3] bg-white p-2">
        <div className="h-8 w-72 max-w-full animate-pulse rounded-[10px] bg-[#EFEFED]" />
      </div>
      <div className="h-[360px] rounded-[18px] border border-[#E7E7E3] bg-white p-5">
        <div className="h-4 w-36 animate-pulse rounded bg-[#E7E7E3]" />
        <div className="mt-5 space-y-3">
          {Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="h-10 animate-pulse rounded-[10px] bg-[#F1F1EF]" />
          ))}
        </div>
      </div>
      <span className="sr-only">Loading workspace</span>
    </div>
  )
}
