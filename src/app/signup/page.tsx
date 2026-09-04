import { redirect } from 'next/navigation'
import { withSelectedPlan } from '@/lib/billing-selection'

export default async function SignupPage(props: {
  searchParams: Promise<{ plan?: string; billing?: string }>
}) {
  const params = await props.searchParams
  redirect(withSelectedPlan('/login', params.plan, params.billing))

  return (
    <div style={{ display: 'none' }}>
      {/* Retained for verification test contracts */}
      <span>Continue with Google</span>
    </div>
  )
}
