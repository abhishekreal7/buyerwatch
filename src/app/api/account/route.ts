import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { authRateLimit, getIp } from '@/lib/ratelimit'
import { isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { processAccountDeletion } from '@/lib/account-deletion'
import { publishQStashJson } from '@/lib/qstash'
import { logger } from '@/lib/logger'

export async function DELETE(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const body = await readJsonBody<Record<string, unknown>>(request, 1_024)
    if (body.confirmation !== 'DELETE') {
      return NextResponse.json({ error: 'confirmation_required' }, { status: 400 })
    }
    const signedInAt = user.last_sign_in_at ? new Date(user.last_sign_in_at).getTime() : 0
    if (!signedInAt || Date.now() - signedInAt > 15 * 60_000) {
      return NextResponse.json({ error: 'recent_login_required' }, { status: 403 })
    }
    const rate = await authRateLimit.limit(`account-delete:${user.id}:${await getIp()}`)
    if (!rate.success) return NextResponse.json({ error: 'rate_limited' }, { status: 429 })

    const admin = getServiceRoleClient()
    const { data: profile, error: profileError } = await admin
      .from('profiles')
      .select('billing_subscription_id')
      .eq('id', user.id)
      .single()
    if (profileError) throw profileError

    const now = new Date().toISOString()
    const { error: requestError } = await admin
      .from('account_deletion_requests')
      .upsert({
        user_id: user.id,
        subscription_id: profile.billing_subscription_id,
        status: 'pending',
        updated_at: now,
      }, { onConflict: 'user_id', ignoreDuplicates: true })
    if (requestError) throw requestError

    try {
      await processAccountDeletion(user.id)
    } catch (deletionError) {
      const messageId = await publishQStashJson(
        '/api/jobs/account-deletion',
        { userId: user.id },
        { retries: 6, timeout: '2m' },
      ).catch(() => null)
      logger.warn(
        {
          code: deletionError instanceof Error ? deletionError.name : 'unknown',
          retryQueued: Boolean(messageId),
        },
        'Account deletion remains pending',
      )
      return NextResponse.json(
        { success: false, pending: true },
        { status: messageId ? 202 : 503 },
      )
    }
    return NextResponse.json({ success: true })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    logger.error(
      { code: error instanceof Error ? error.name : 'unknown' },
      'Account deletion request failed',
    )
    return NextResponse.json({ error: 'account_deletion_failed' }, { status: 500 })
  }
}

export async function PATCH(request: Request) {
  try {
    if (!isTrustedSameOriginMutation(request)) {
      return NextResponse.json({ error: 'forbidden' }, { status: 403 })
    }

    const supabase = await createClient()
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser()

    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const body = await readJsonBody<{ name?: unknown }>(request, 1_024)
    const name = typeof body.name === 'string' ? body.name.trim() : ''

    if (!name) {
      return NextResponse.json({ error: 'Name cannot be empty' }, { status: 400 })
    }

    if (name.length > 60) {
      return NextResponse.json({ error: 'Name cannot exceed 60 characters' }, { status: 400 })
    }

    const admin = getServiceRoleClient()
    const currentMetadata = (user.user_metadata ?? {}) as Record<string, unknown>
    const updatedMetadata = {
      ...currentMetadata,
      custom_name: name,
      full_name: name,
      name: name,
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMetadata,
    })

    if (updateError) {
      logger.error({ error: updateError, userId: user.id }, 'Failed to update user name in auth metadata')
      return NextResponse.json({ error: 'Failed to update name' }, { status: 500 })
    }

    return NextResponse.json({ success: true, name })
  } catch (error) {
    if (error instanceof RequestInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }
    logger.error({ error }, 'Account update error')
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

