export default function DashboardLoading() {
  return (
    <div className="space-y-6" aria-busy="true" aria-live="polite">
      <div className="space-y-2">
        <div className="h-8 w-48 animate-pulse rounded-lg bg-gray-200/80" />
        <div className="h-4 w-80 max-w-full animate-pulse rounded bg-gray-100" />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, index) => (
          <div
            key={index}
            className="h-28 animate-pulse rounded-2xl border border-gray-200/70 bg-white"
          />
        ))}
      </div>
      <div className="h-[420px] animate-pulse rounded-2xl border border-gray-200/70 bg-white" />
    </div>
  )
}
