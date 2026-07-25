'use client'

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-neutral-900">
        <main className="mx-auto flex min-h-screen max-w-xl flex-col items-center justify-center px-6 text-center">
          <p className="text-sm font-semibold uppercase tracking-wider text-[#0A84FF]">
            Scouto
          </p>
          <h1 className="mt-3 text-3xl font-bold">Something went wrong</h1>
          <p className="mt-3 text-neutral-600">
            The error has been recorded. Try the request again, or return after a short wait.
          </p>
          <button
            type="button"
            onClick={reset}
            className="mt-7 rounded-xl bg-neutral-900 px-5 py-3 font-semibold text-white hover:bg-neutral-800"
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
