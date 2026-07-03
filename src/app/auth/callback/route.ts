import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  
  if (code) {
    const supabase = await createClient()
    const { data: { user }, error } = await supabase.auth.exchangeCodeForSession(code)
    
    if (!error && user) {
      // Check if they have a profile, if not redirect to onboarding
      const { data: profile } = await supabase
        .from('profiles')
        .select('id, business_name')
        .eq('id', user.id)
        .single()
        
      if (!profile || !profile.business_name) {
        return NextResponse.redirect(new URL('/onboarding', request.url))
      }
      
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }
  }

  // URL to redirect to after sign in process completes
  return NextResponse.redirect(new URL('/dashboard', request.url))
}
