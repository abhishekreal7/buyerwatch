'use client'

import { useEffect } from 'react'

export default function ErrorPage({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <main className="min-h-screen grid place-items-center bg-[#F7F6F3] p-6 text-[#182229]">
      <div className="max-w-md text-center">
        <h1 className="text-3xl font-semibold">Something went wrong</h1>
        <p className="mt-3 text-gray-600">The issue has been recorded. You can safely try this page again.</p>
        <button type="button" className="mt-6 rounded-full bg-[#182229] px-5 py-3 text-white" onClick={unstable_retry}>
          Try again
        </button>
      </div>
    </main>
  )
}
