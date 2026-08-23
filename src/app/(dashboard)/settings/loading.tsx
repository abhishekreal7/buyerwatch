import { AppPage } from '@/components/AppPage'

export default function SettingsLoading() {
  return (
    <AppPage>
      <div className="w-full max-w-[960px]" aria-label="Loading settings">
        {/* Sticky header skeleton */}
        <div className="sticky -top-5 sm:-top-6 z-20 -mx-4 px-4 sm:-mx-6 sm:px-6 lg:-mx-8 lg:px-8 -mt-5 sm:-mt-6 pt-5 sm:pt-6 pb-4 bg-white/90 backdrop-blur-md border-b border-gray-100 mb-6 flex items-center justify-between">
          <div className="h-6 w-24 rounded-lg bg-gray-100 animate-pulse" />
          <div className="h-8 w-20 rounded-xl bg-gray-100 animate-pulse" />
        </div>
        {/* Section nav skeleton */}
        <div className="flex gap-1 mb-8 overflow-x-auto pb-1">
          {[72, 96, 88, 64, 80].map((w, i) => (
            <div key={i} className="h-8 rounded-xl bg-gray-100 animate-pulse shrink-0" style={{ width: w }} />
          ))}
        </div>
        {/* Fields skeleton */}
        <div className="flex flex-col gap-5">
          {[1, 2, 3].map((_, i) => (
            <div key={i} className="rounded-2xl border border-gray-100 bg-white p-5 flex flex-col gap-3">
              <div className="h-4 w-32 rounded-md bg-gray-100 animate-pulse" />
              <div className="h-10 w-full rounded-xl bg-gray-100 animate-pulse" />
            </div>
          ))}
          <div className="rounded-2xl border border-gray-100 bg-white p-5 flex flex-col gap-3">
            <div className="h-4 w-40 rounded-md bg-gray-100 animate-pulse" />
            <div className="h-24 w-full rounded-xl bg-gray-100 animate-pulse" />
          </div>
        </div>
      </div>
    </AppPage>
  )
}
