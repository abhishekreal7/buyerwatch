import Link from 'next/link'

export default function NotFound() {
  return (
    <main className="min-h-screen grid place-items-center bg-[#F7F6F3] p-6 text-[#182229]">
      <div className="max-w-md text-center">
        <p className="text-sm font-semibold uppercase tracking-widest text-orange-600">404</p>
        <h1 className="mt-3 text-4xl font-semibold">Page not found</h1>
        <p className="mt-3 text-gray-600">The page may have moved or no longer exists.</p>
        <Link href="/" className="mt-6 inline-flex rounded-full bg-[#182229] px-5 py-3 text-white">
          Return home
        </Link>
      </div>
    </main>
  )
}
