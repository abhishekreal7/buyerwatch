import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fetchPublicText } from '@/lib/security/outbound-url'
import {
  buildFallbackSuggestions,
  extractWebsiteProfile,
} from '@/lib/onboarding-intelligence'
import { normalizeWebsiteUrl } from '@/lib/onboarding-validation'
import { aiRateLimit, getIp } from '@/lib/ratelimit'
import { boundedString, readJsonBody, RequestInputError } from '@/lib/request'

function titleCase(value: string): string {
  return value
    .replace(/[-_]+/g, ' ')
    .replace(/\b\w/g, char => char.toUpperCase())
    .trim()
}

function deriveBusinessName(url: string, fallback: string): string {
  if (fallback.trim()) return fallback.trim()
  try {
    const host = new URL(url).hostname.replace(/^www\./, '')
    return titleCase(host.split('.')[0] || 'Product')
  } catch {
    return 'Product'
  }
}

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await readJsonBody<Record<string, unknown>>(req, 8_192)
    const url = normalizeWebsiteUrl(typeof payload.url === 'string' ? payload.url : '')
    const businessName = boundedString(payload.businessName, 120) ?? ''
    const businessDescription = boundedString(payload.businessDescription, 4_000) ?? ''

    if (!url && !businessName) {
      return NextResponse.json({ error: 'Enter a website URL or business name.' }, { status: 400 })
    }
    try {
      const rate = await aiRateLimit.limit(`onboarding-analysis:${user.id}:${await getIp()}`)
      if (!rate.success) {
        return NextResponse.json({ error: 'analysis_rate_limited' }, { status: 429 })
      }
    } catch (rateLimitError) {
      // Rate-limit infrastructure must not make first-run setup unusable.
      console.warn('[onboarding/analyze] Rate limiter unavailable; continuing safely', rateLimitError)
    }

    let webpageTitle = ''
    let webpageDescription = ''
    let webpageContent = ''
    if (url) {
      try {
        const { response: fetchRes, text: html } = await fetchPublicText(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          timeoutMs: 5_000,
          maxBytes: 200_000,
          maxRedirects: 3,
        })
        if (fetchRes.ok) {
          const profile = extractWebsiteProfile(html)
          webpageTitle = profile.title
          webpageDescription = profile.description
          webpageContent = profile.content
        }
      } catch {
        console.warn('[onboarding/analyze] Website fetch failed; using supplied profile data')
      }
    }

    const detectedBusinessName = deriveBusinessName(url, businessName)
    const result = buildFallbackSuggestions({
      businessName: detectedBusinessName,
      description: businessDescription,
      webpageTitle,
      webpageDescription,
      webpageContent,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof RequestInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[onboarding/analyze] Website analysis failed:', err)
    return NextResponse.json({ error: 'website_analysis_failed' }, { status: 502 })
  }
}
