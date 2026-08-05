import { headers } from 'next/headers'

export default async function SignupLayout({ children }: { children: React.ReactNode }) {
  await headers()
  return children
}
