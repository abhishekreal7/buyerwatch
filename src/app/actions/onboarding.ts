'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { actionRateLimit, getIp } from '@/lib/ratelimit'
import { redditFetchQueue, blueskyFetchQueue, xFetchQueue } from '@/lib/queues'

export async function completeOnboardingAction(data: {
  business_name: string
  business_description: string
  business_url: string
  business_type: string
  writing_style: string
  reddit_username: string
  keywords: Array<{ term: string; platform: string; target: string }>
}) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    return { error: 'Not authenticated' }
  }

  if (actionRateLimit) {
    const ip = await getIp()
    const { success } = await actionRateLimit.limit(`onboarding_${user.id}_${ip}`)
    if (!success) {
      return { error: 'Too many requests. Please try again later.' }
    }
  }

  // Insert profile
  const { error: profileError } = await supabase
    .from('profiles')
    .upsert({
      id: user.id,
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
      term: k.term,
      platform: k.platform,
      target: k.target,
      is_active: true
    }))

    const { data: insertedKeywords, error: keywordError } = await supabase
      .from('keywords')
      .insert(keywordInserts)
      .select()

    if (keywordError) {
      return { error: keywordError.message }
    }

    // Trigger instant fetch for each keyword
    if (insertedKeywords) {
      const hourBucket = `fetch-now-${Date.now()}`
      for (const kw of insertedKeywords) {
        if (kw.platform === 'reddit') {
          await redditFetchQueue.add('fetch', { target: kw.target }, { jobId: `reddit-${kw.target}-${hourBucket}` })
        } else if (kw.platform === 'bluesky') {
          await blueskyFetchQueue.add('fetch', { target: kw.target }, { jobId: `bluesky-${kw.target}-${hourBucket}` })
        } else if (kw.platform === 'x') {
          await xFetchQueue.add('fetch', { target: kw.target }, { jobId: `x-${kw.target}-${hourBucket}` })
        }
      }
    }
  }

  redirect('/dashboard')
}
