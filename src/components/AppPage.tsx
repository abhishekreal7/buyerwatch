import { ReactNode } from 'react'

export function AppPage({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[1400px] mx-auto space-y-6">
      {children}
    </div>
  )
}
