import 'server-only'

import { createClient as createAdminClient } from '@supabase/supabase-js'
import { redirect } from 'next/navigation'
import { createClient } from '../utils/supabase/server'

function configuredAdminEmails(): Set<string> {
  return new Set(
    (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  )
}

export function getServiceRoleClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) throw new Error('Server database configuration is missing')
  return createAdminClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

export async function requireAdmin() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email) redirect('/login')
  if (!configuredAdminEmails().has(user.email.toLowerCase())) redirect('/dashboard')
  return {
    user,
    admin: getServiceRoleClient(),
  }
}

export async function requireAdminForAction() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user?.email || !configuredAdminEmails().has(user.email.toLowerCase())) {
    throw new Error('Unauthorized')
  }
  return {
    user,
    admin: getServiceRoleClient(),
  }
}
