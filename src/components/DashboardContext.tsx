'use client'

import { createContext, useContext, type ReactNode } from 'react'

const DashboardSessionContext = createContext<string | null>(null)

export function DashboardSessionProvider({
  children,
  userId,
}: {
  children: ReactNode
  userId: string
}) {
  return (
    <DashboardSessionContext value={userId}>
      {children}
    </DashboardSessionContext>
  )
}

export function useDashboardSession() {
  const session = useContext(DashboardSessionContext)

  if (!session) {
    throw new Error('useDashboardSession must be used within DashboardSessionProvider')
  }

  return { userId: session }
}
