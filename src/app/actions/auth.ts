'use server'

import { createClient } from '@/utils/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

export async function signUpAction(formData: FormData) {
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()
  const supabase = await createClient()
  const origin = (await headers()).get('origin')

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    return { error: error.message }
  }

  return { success: 'Check your email to verify your account' }
}

export async function signInAction(formData: FormData) {
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()
  const supabase = await createClient()

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

export async function signInWithGoogleAction(formData?: FormData) {
  const supabase = await createClient()
  const origin = (await headers()).get('origin')

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: {
      redirectTo: `${origin}/auth/callback`,
    },
  })

  if (error) {
    console.error(error.message)
    return
  }

  if (data.url) {
    redirect(data.url)
  }
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
