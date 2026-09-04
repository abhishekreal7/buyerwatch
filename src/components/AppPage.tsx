import { ReactNode } from 'react'

export function AppPage({ children, fullHeight = false }: { children: ReactNode; fullHeight?: boolean }) {
  return (
    <div className={`${fullHeight ? 'flex h-full min-h-0 flex-col' : ''} w-full max-w-[1400px] mx-auto space-y-6`}>
      {children}
    </div>
  )
}
