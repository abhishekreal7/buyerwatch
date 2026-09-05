import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { getServiceRoleClient } from '@/lib/admin'
import { isTrustedSameOriginMutation } from '@/lib/request'

const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/jpg', 'image/webp', 'image/gif']
const MAX_SIZE_BYTES = 5 * 1024 * 1024 // 5MB

export async function POST(request: Request) {
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

    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) {
      return NextResponse.json({ error: 'No image file provided' }, { status: 400 })
    }

    if (!ALLOWED_TYPES.includes(file.type.toLowerCase())) {
      return NextResponse.json(
        { error: 'Invalid file format. Please upload a PNG, JPG, WebP, or GIF image.' },
        { status: 400 }
      )
    }

    if (file.size > MAX_SIZE_BYTES) {
      return NextResponse.json(
        { error: 'File size exceeds 5MB limit.' },
        { status: 400 }
      )
    }

    const admin = getServiceRoleClient()

    // Ensure avatars bucket exists
    const { data: buckets } = await admin.storage.listBuckets()
    if (!buckets?.some((b) => b.name === 'avatars')) {
      await admin.storage.createBucket('avatars', {
        public: true,
        fileSizeLimit: MAX_SIZE_BYTES,
        allowedMimeTypes: ALLOWED_TYPES,
      })
    }

    const ext = file.name.split('.').pop() || 'png'
    const fileName = `${user.id}-${Date.now()}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())

    const { data: uploadData, error: uploadError } = await admin.storage
      .from('avatars')
      .upload(fileName, buffer, {
        contentType: file.type,
        upsert: true,
      })

    if (uploadError || !uploadData) {
      console.error('[avatar] Storage upload error:', uploadError)
      return NextResponse.json({ error: 'Failed to upload image' }, { status: 500 })
    }

    const { data: publicUrlData } = admin.storage
      .from('avatars')
      .getPublicUrl(uploadData.path)

    const avatarUrl = publicUrlData.publicUrl

    // Update user metadata in Supabase Auth
    const currentMetadata = (user.user_metadata ?? {}) as Record<string, unknown>
    const updatedMetadata = {
      ...currentMetadata,
      avatar_url: avatarUrl,
      picture: avatarUrl,
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMetadata,
    })

    if (updateError) {
      console.error('[avatar] Metadata update error:', updateError)
      return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 })
    }

    return NextResponse.json({ success: true, avatarUrl })
  } catch (error) {
    console.error('[avatar] Unexpected upload error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
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

    const admin = getServiceRoleClient()

    const currentMetadata = (user.user_metadata ?? {}) as Record<string, unknown>
    const updatedMetadata = {
      ...currentMetadata,
      avatar_url: null,
      picture: null,
    }

    const { error: updateError } = await admin.auth.admin.updateUserById(user.id, {
      user_metadata: updatedMetadata,
    })

    if (updateError) {
      console.error('[avatar] Metadata remove error:', updateError)
      return NextResponse.json({ error: 'Failed to reset profile picture' }, { status: 500 })
    }

    return NextResponse.json({ success: true, avatarUrl: null })
  } catch (error) {
    console.error('[avatar] Unexpected delete error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
