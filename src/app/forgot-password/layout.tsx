import { headers } from 'next/headers'

export default async function ForgotPasswordLayout({ children }: { children: React.ReactNode }) {
  await headers()
  return children
}
