import { ReactNode } from 'react'

export function AppPage({ children }: { children: ReactNode }) {
  return (
    <div className="w-full max-w-[1600px] mx-auto px-6 md:px-12 pt-6 md:pt-10 pb-24 md:pb-32">
      <div className="w-full">
        {children}
      </div>
    </div>
  )
}
