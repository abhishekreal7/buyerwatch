import { createClient } from '@/utils/supabase/server'
import { NextResponse } from 'next/server'
import { revalidatePath } from 'next/cache'

export async function POST(request: Request) {
  const supabase = await createClient()
  await supabase.auth.signOut()

  // Clear Next.js router cache to prevent redirect loops
  revalidatePath('/', 'layout')

  const origin = process.env.NEXT_PUBLIC_APP_URL || new URL(request.url).origin
  
  // Use a hard redirect (302) to force the browser to navigate
  return NextResponse.redirect(`${origin}/`, { status: 302 })
}
