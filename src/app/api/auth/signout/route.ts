import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppUrl } from '@/lib/app-url'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Clear Next.js router cache to prevent redirect loops
  revalidatePath('/', 'layout')

  const origin = getAppUrl()
  
  // Use a hard redirect (302) to force the browser to navigate
  return NextResponse.redirect(`${origin}/`, { status: 302 })
}
