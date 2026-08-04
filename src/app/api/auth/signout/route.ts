import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'
import { getAppUrl } from '@/lib/app-url'

export async function POST() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  const origin = getAppUrl()
  return NextResponse.redirect(`${origin}/login`, { status: 302 })
}

export async function GET() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  revalidatePath('/', 'layout')
  const origin = getAppUrl()
  return NextResponse.redirect(`${origin}/login`, { status: 302 })
}
