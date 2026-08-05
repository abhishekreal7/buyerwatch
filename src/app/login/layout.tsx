import { headers } from 'next/headers'

export default async function LoginLayout({ children }: { children: React.ReactNode }) {
  // Nonce-based CSP requires request-time rendering so Next can attach the
  // request nonce to its framework and hydration scripts.
  await headers()
  return children
}
