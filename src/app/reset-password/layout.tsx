import { headers } from 'next/headers'

export default async function ResetPasswordLayout({ children }: { children: React.ReactNode }) {
  await headers()
  return children
}
