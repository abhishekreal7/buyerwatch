import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppUrl } from '@/lib/app-url'
import { isTrustedSameOriginMutation } from '@/lib/request'

export async function POST(request: Request) {
  if (!isTrustedSameOriginMutation(request)) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  const origin = getAppUrl()
  return NextResponse.redirect(`${origin}/login`, { status: 302 })
}
