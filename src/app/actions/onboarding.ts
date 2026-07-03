'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'

export async function completeOnboardingAction(data: {
  business_name: string
  business_description: string
  business_url: string
  business_type: string
  writing_style: string
  reddit_username: string
  keywords: Array<{ keyword: string; type: string; subreddits: string[] }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  // Insert profile
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
      full_name: user.user_metadata?.full_name || '',
      email: user.email,
      business_name: data.business_name,
      business_description: data.business_description,
      business_url: data.business_url,
      business_type: data.business_type,
      writing_style: data.writing_style,
      reddit_username: data.reddit_username || null,
      created_at: new Date().toISOString(),
    })

  if (profileError) {
    return { error: profileError.message }
  }

  // Insert keywords
  if (data.keywords && data.keywords.length > 0) {
    const keywordInserts = data.keywords.map(k => ({
      user_id: user.id,
      keyword: k.keyword,
      keyword_type: k.type,
      subreddits: k.subreddits.length > 0 ? k.subreddits : null,
      is_active: true
    }))

    const { error: keywordError } = await supabase
      .from('keywords')
      .insert(keywordInserts)

    if (keywordError) {
      return { error: keywordError.message }
    }
  }

  redirect('/dashboard')
}
