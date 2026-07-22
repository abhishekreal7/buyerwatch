import { NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const apiKey = process.env.LEMON_SQUEEZY_API_KEY
    const proUrl = process.env.NEXT_PUBLIC_LEMON_SQUEEZY_PRO_URL

    if (!apiKey || !proUrl) {
      return NextResponse.json({ error: 'billing_not_configured' }, { status: 503 })
    }

    // 1. Extract Variant ID from NEXT_PUBLIC_LEMON_SQUEEZY_PRO_URL
    const variantId = proUrl.split('/').pop()?.split('?')[0]
    if (!variantId) {
      return NextResponse.json({ error: 'invalid_variant_id' }, { status: 400 })
    }

    // 2. Fetch first store ID using Lemon Squeezy API
    const storesRes = await fetch('https://api.lemonsqueezy.com/v1/stores', {
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${apiKey}`
      }
    })

    if (!storesRes.ok) {
      const errText = await storesRes.text()
      console.error('Failed to fetch Lemon Squeezy stores:', errText)
      return NextResponse.json({ error: 'failed_fetching_stores' }, { status: 500 })
    }

    const storesData = await storesRes.json()
    const storeId = storesData.data?.[0]?.id

    if (!storeId) {
      return NextResponse.json({ error: 'store_not_found' }, { status: 404 })
    }

    // 3. Create checkout session using Lemon Squeezy API
    const checkoutRes = await fetch('https://api.lemonsqueezy.com/v1/checkouts', {
      method: 'POST',
      headers: {
        'Accept': 'application/vnd.api+json',
        'Content-Type': 'application/vnd.api+json',
        'Authorization': `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        data: {
          type: 'checkouts',
          attributes: {
            checkout_data: {
              email: user.email,
              custom: {
                user_id: user.id
              }
            }
          },
          relationships: {
            store: {
              data: {
                type: 'stores',
                id: storeId
              }
            },
            variant: {
              data: {
                type: 'variants',
                id: variantId
              }
            }
          }
        }
      })
    })

    if (!checkoutRes.ok) {
      const errText = await checkoutRes.text()
      console.error('Failed to create Lemon Squeezy checkout:', errText)
      return NextResponse.json({ error: 'failed_creating_checkout' }, { status: 500 })
    }

    const checkoutData = await checkoutRes.json()
    const checkoutUrl = checkoutData.data?.attributes?.url

    if (!checkoutUrl) {
      return NextResponse.json({ error: 'checkout_url_not_found' }, { status: 500 })
    }

    return NextResponse.json({ url: checkoutUrl })

  } catch (error: any) {
    console.error('Checkout API error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
