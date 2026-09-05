'use server'

import { createClient } from '@/utils/supabase/server'
import { redirect } from 'next/navigation'
import { authRateLimit, getIp } from '@/lib/ratelimit'
import { getAppUrl } from '@/lib/app-url'
import {
  afterAuthenticationDestination,
  normalizeSelectedBillingCadence,
  normalizeSelectedBillingPlan,
  selectedPlanForSignup,
  withSelectedPlan,
} from '@/lib/billing-selection'

export async function signUpAction(formData: FormData) {
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()
  const selectedPlan = selectedPlanForSignup(formData.get('plan')?.toString())
  const selectedBilling = normalizeSelectedBillingCadence(formData.get('billing')?.toString())
  const supabase = await createClient()
  const origin = getAppUrl()

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const ip = await getIp()
  const { success } = await authRateLimit.limit(`auth_${ip}`)
  if (!success) {
    return { error: 'Too many requests. Please try again later.' }
  }

  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Points to the email-confirmation handler, not the OAuth callback
      emailRedirectTo: `${origin}${withSelectedPlan('/auth/confirm', selectedPlan, selectedBilling)}`,
    },
  })

  const isExistingAccount = error?.code === 'user_already_exists'
    || error?.code === 'email_exists'
    || Boolean(data.user && (data.user.identities?.length ?? 0) === 0)

  if (isExistingAccount) {
    return { error: 'This email is already registered. Log in instead.' }
  }

  if (error) {
    return { error: 'Could not create the account. Check your details and try again.' }
  }

  return { success: 'Check your email to verify your account.' }
}

export async function signInWithEmailAction(formData: FormData) {
  const email = formData.get('email')?.toString()?.trim().toLowerCase()
  const selectedPlan = normalizeSelectedBillingPlan(formData.get('plan')?.toString())
  const selectedBilling = normalizeSelectedBillingCadence(formData.get('billing')?.toString())
  const supabase = await createClient()
  const origin = getAppUrl()

  if (!email) {
    return { error: 'Email is required' }
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
  if (!emailRegex.test(email)) {
    return { error: 'Please enter a valid email address' }
  }

  const ip = await getIp()
  const { success } = await authRateLimit.limit(`auth_${ip}`)
  if (!success) {
    return { error: 'Too many requests. Please try again later.' }
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
    },
  })

  if (error) {
    return { error: error.message || 'Could not send verification code. Please try again.' }
  }

  return { success: `We sent a 6-digit code to ${email}.` }
}

export async function verifyEmailOtpAction(formData: FormData) {
  const email = formData.get('email')?.toString()?.trim().toLowerCase()
  const token = formData.get('code')?.toString()?.trim()
  const selectedPlan = normalizeSelectedBillingPlan(formData.get('plan')?.toString())
  const selectedBilling = normalizeSelectedBillingCadence(formData.get('billing')?.toString())
  const supabase = await createClient()

  console.log('[verifyEmailOtpAction] Received verification attempt:', { email, tokenLength: token?.length, token })

  if (!email || !token) {
    return { error: 'Please enter the 6-digit code.' }
  }

  const ip = await getIp()
  const { success } = await authRateLimit.limit(`auth_${ip}`)
  if (!success) {
    return { error: 'Too many attempts. Please try again later.' }
  }

  // Attempt 1: 'email' (standard for signInWithOtp numeric tokens)
  let { data, error } = await supabase.auth.verifyOtp({
    email,
    token,
    type: 'email',
  })
  console.log('[verifyEmailOtpAction] Attempt 1 (email):', { hasUser: Boolean(data?.user), error: error?.message, errorCode: error?.code, status: error?.status })

  // Fallback 1: Attempt with 'magiclink' if GoTrue keyed it under magiclink
  if (error) {
    const magicFallback = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'magiclink' as any,
    })
    console.log('[verifyEmailOtpAction] Attempt 2 (magiclink):', { hasUser: Boolean(magicFallback.data?.user), error: magicFallback.error?.message, status: magicFallback.error?.status })
    if (!magicFallback.error && magicFallback.data.user) {
      data = magicFallback.data
      error = null
    }
  }

  // Fallback 2: Attempt with 'signup' if newly registered user
  if (error) {
    const signupFallback = await supabase.auth.verifyOtp({
      email,
      token,
      type: 'signup',
    })
    console.log('[verifyEmailOtpAction] Attempt 3 (signup):', { hasUser: Boolean(signupFallback.data?.user), error: signupFallback.error?.message, status: signupFallback.error?.status })
    if (!signupFallback.error && signupFallback.data.user) {
      data = signupFallback.data
      error = null
    }
  }

  if (error) {
    console.error('[verifyEmailOtpAction] All attempts failed:', error)
    return { error: error.message || 'Invalid or expired code. Please check and try again.' }
  }

  const user = data.user
  const { data: profile } = user
    ? await supabase.from('profiles').select('business_name').eq('id', user.id).maybeSingle()
    : { data: null }

  redirect(afterAuthenticationDestination(selectedPlan, Boolean(profile?.business_name), selectedBilling))
}

export async function signInAction(formData: FormData) {
  const email = formData.get('email')?.toString()
  const password = formData.get('password')?.toString()
  const selectedPlan = normalizeSelectedBillingPlan(formData.get('plan')?.toString())
  const selectedBilling = normalizeSelectedBillingCadence(formData.get('billing')?.toString())
  const supabase = await createClient()

  if (!email || !password) {
    return { error: 'Email and password are required' }
  }

  const ip = await getIp()
  const { success } = await authRateLimit.limit(`auth_${ip}`)
  if (!success) {
    return { error: 'Too many requests. Please try again later.' }
  }

  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  })

  if (error) {
    return { error: 'Invalid email or password.' }
  }

  const { data: { user } } = await supabase.auth.getUser()
  const { data: profile } = user
    ? await supabase.from('profiles').select('business_name').eq('id', user.id).maybeSingle()
    : { data: null }
  redirect(afterAuthenticationDestination(selectedPlan, Boolean(profile?.business_name), selectedBilling))
}

export async function signInWithGoogleAction() {
  const supabase = await createClient()
  const origin = getAppUrl()

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
  const origin = getAppUrl()

  if (!email) {
    return { error: 'Email is required' }
  }

  const ip = await getIp()
  const { success } = await authRateLimit.limit(`auth_${ip}`)
  if (!success) {
    return { error: 'Too many requests. Please try again later.' }
  }

  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    // Recovery links carry a PKCE code. Exchange it on the server so the
    // reset page always receives a cookie-backed recovery session.
    redirectTo: `${origin}/auth/recovery`,
  })

  if (error) {
    return { error: 'Could not send a reset email. Please try again later.' }
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

  if (password.length < 12) {
    return { error: 'Password must be at least 12 characters' }
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    return { error: 'Could not update the password. Please try again.' }
  }

  const { error: revocationError } = await supabase.auth.signOut({ scope: 'global' })
  if (revocationError) {
    return {
      error: 'Password updated, but active sessions could not be revoked. Use “sign out everywhere” before continuing.',
    }
  }

  redirect('/login?password=updated')
}

export async function signOutAction() {
  const supabase = await createClient()
  await supabase.auth.signOut()
  redirect('/login')
}
