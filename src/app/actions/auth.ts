'use server'

import { createClient } from '@/utils/supabase/server'
import { headers } from 'next/headers'
import { redirect } from 'next/navigation'
import { authRateLimit, getIp } from '@/lib/ratelimit'

export async function signUpAction(formData: FormData) {
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()
  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_APP_URL || (await headers()).get('origin') || 'http://localhost:3000'

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  if (authRateLimit) {
    const ip = await getIp()
    const { success } = await authRateLimit.limit(`auth_${ip}`)
    if (!success) {
      return { error: 'Too many requests. Please try again later.' }
    }
  }

  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Points to the email-confirmation handler, not the OAuth callback
      emailRedirectTo: `${origin}/auth/confirm`,
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

  if (authRateLimit) {
    const ip = await getIp()
    const { success } = await authRateLimit.limit(`auth_${ip}`)
    if (!success) {
      return { error: 'Too many requests. Please try again later.' }
    }
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
  const origin = process.env.NEXT_PUBLIC_APP_URL || (await headers()).get('origin') || 'http://localhost:3000'

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

export async function forgotPasswordAction(formData: FormData) {
  const email = formData.get('email')?.toString()
  const supabase = await createClient()
  const origin = process.env.NEXT_PUBLIC_APP_URL || (await headers()).get('origin') || 'http://localhost:3000'

  if (!email) {
    return { error: 'Email is required' }
  }

  if (authRateLimit) {
    const ip = await getIp()
    const { success } = await authRateLimit.limit(`auth_${ip}`)
    if (!success) {
      return { error: 'Too many requests. Please try again later.' }
    }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin}/reset-password`,
  })

  if (error) {
    return { error: error.message }
  }

  return { success: 'Check your email for a password reset link' }
}

export async function resetPasswordAction(formData: FormData) {
  const password = formData.get('password')?.toString()
  const confirmPassword = formData.get('confirmPassword')?.toString()
  const supabase = await createClient()

  if (!password || !confirmPassword) {
    return { error: 'Both password fields are required' }
  }

  if (password !== confirmPassword) {
    return { error: 'Passwords do not match' }
  }

  if (password.length < 6) {
    return { error: 'Password must be at least 6 characters' }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: error.message }
  }

  redirect('/dashboard')
}

