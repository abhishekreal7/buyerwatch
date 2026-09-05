import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { fetchPublicText } from '@/lib/security/outbound-url'
import { getConfiguredSecret } from '@/lib/env'
import { getEntitledPlan } from '@/lib/billing-entitlements'
import { createAnthropicClient } from '@/lib/anthropic-client'
import {
  buildFallbackSuggestions,
  sanitizeOnboardingSuggestions,
  type OnboardingSuggestions,
} from '@/lib/onboarding-intelligence'
import { normalizeWebsiteUrl } from '@/lib/onboarding-validation'
import { aiRateLimit, getIp } from '@/lib/ratelimit'
import { boundedString, isTrustedSameOriginMutation, readJsonBody, RequestInputError } from '@/lib/request'
import { getServiceRoleClient } from '@/lib/admin'
import {
  calculateAnthropicUsage,
  recordAiUsage,
  releaseAiSpend,
  reserveAiSpend,
} from '@/lib/ai-usage'

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

function parseAiJson(value: string): OnboardingSuggestions | null {
  const jsonString = value.replace(/```json/g, '').replace(/```/g, '').trim()
  if (!jsonString) return null
  try {
    const result = sanitizeOnboardingSuggestions(JSON.parse(jsonString), 'ai')
    const keywordCount =
      result.buyerKeywords.length
      + result.competitorKeywords.length
      + result.painPointKeywords.length
    return result.description && result.subreddits.length > 0 && keywordCount >= 3
      ? result
      : null
  } catch {
    return null
  }
}

const ONBOARDING_OUTPUT_SCHEMA = {
  type: 'object',
  properties: {
    businessName: { type: 'string' },
    description: { type: 'string' },
    subreddits: {
      type: 'array',
      items: { type: 'string' },
    },
    buyerKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
    competitorKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
    painPointKeywords: {
      type: 'array',
      items: { type: 'string' },
    },
  },
  required: [
    'businessName',
    'description',
    'subreddits',
    'buyerKeywords',
    'competitorKeywords',
    'painPointKeywords',
  ],
  additionalProperties: false,
} as const

export async function POST(req: NextRequest) {
  if (!isTrustedSameOriginMutation(req)) {
    return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  }
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
    const rate = await aiRateLimit.limit(`onboarding-ai:${user.id}:${await getIp()}`)
    if (!rate.success) {
      return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
    }

    let webpageText = ''
    let webpageTitle = ''
    let webpageDescription = ''
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
          // Extract text from title, meta description, and body headers
          const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ''
          const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? ''
          webpageTitle = title.trim()
          webpageDescription = metaDesc.trim()
          const bodySnippet = html.replace(/<script[\s\S]*?<\/script>/gi, '')
            .replace(/<style[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ')
            .slice(0, 1500)
          webpageText = `Title: ${title}\nDescription: ${metaDesc}\nContent: ${bodySnippet}`
        }
      } catch {
        console.warn('[ai-suggest] Website fetch failed; using supplied profile data')
      }
    }

    const prompt = `You are a world-class SaaS growth engineer & Reddit marketing strategist.
Analyze this product and output strategic Reddit monitoring intelligence.

Product Info:
- Name: ${businessName || 'Product'}
- User Description: ${businessDescription || 'None'}
- Website Content: ${webpageText || 'None'}

Return ONLY a raw valid JSON object (no markdown, no backticks, no markdown fence):
{
  "businessName": "Detected product or company name",
  "description": "A concise 2-sentence summary of what the product does and its primary value proposition.",
  "subreddits": ["sub1", "sub2", "sub3", "sub4", "sub5", "sub6", "sub7", "sub8"],
  "buyerKeywords": ["phrase 1", "phrase 2", "phrase 3"],
  "competitorKeywords": ["alternative to BrandX", "leaving BrandY"],
  "painPointKeywords": ["struggling with X", "how to solve Y"]
}

Rules:
1. Subreddits must be real popular subreddit names without "r/" (e.g. "SaaS", "startups", "Entrepreneur", "webdev").
2. buyerKeywords: high-intent phrases people search when looking for a tool like this.
3. competitorKeywords: phrases people use when looking to replace direct competitors in this space.
4. painPointKeywords: core problem statements users discuss on Reddit.
5. NEVER append duplicate words like "reddit reddit". Keep phrases natural.`

    const anthropicKey = getConfiguredSecret(process.env.ANTHROPIC_API_KEY)
    let aiResponse = ''
    const admin = getServiceRoleClient()
    const { data: existingProfile, error: profileReadError } = await admin
      .from('profiles')
      .select('plan, billing_status, billing_subscription_id')
      .eq('id', user.id)
      .maybeSingle()

    if (profileReadError) {
      throw new Error(`Unable to read onboarding profile: ${profileReadError.message}`)
    }

    // Email-confirmed users can reach onboarding before complete_onboarding has
    // created their profile. Establish the free, provisional row here so the
    // first AI analysis remains rate-limited and spend-accounted instead of
    // failing with "profile not found". The final onboarding transaction
    // replaces the nullable product fields with the user's reviewed values.
    let profile = existingProfile
    if (!profile) {
      const { data: provisionalProfile, error: profileCreateError } = await admin
        .from('profiles')
        .upsert({ id: user.id }, { onConflict: 'id' })
        .select('plan, billing_status, billing_subscription_id')
        .single()

      if (profileCreateError) {
        throw new Error(`Unable to initialize onboarding profile: ${profileCreateError.message}`)
      }
      profile = provisionalProfile
    }

    if (anthropicKey) {
      const reservation = await reserveAiSpend(admin, {
        userId: user.id,
        // Onboarding is bounded and accounted within the same generative-AI
        // budget as drafts, without consuming a monthly draft allowance.
        purpose: 'draft',
        plan: getEntitledPlan(profile),
      })
      if (!reservation) {
        return NextResponse.json({ error: 'ai_spend_limit_reached' }, { status: 429 })
      }
      try {
        const anthropic = createAnthropicClient()
        const response = await anthropic.messages.create({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
          max_tokens: 800,
          output_config: {
            effort: 'high',
            format: {
              type: 'json_schema',
              schema: ONBOARDING_OUTPUT_SCHEMA,
            },
          },
          system: 'You produce precise product-monitoring suggestions grounded only in the supplied context.',
          messages: [{ role: 'user', content: prompt }],
        })
        if (response.stop_reason === 'max_tokens') {
          throw new Error('Anthropic onboarding response was truncated')
        }
        aiResponse = response.content
          .filter(block => block.type === 'text')
          .map(block => block.text)
          .join('')
        await recordAiUsage(admin, {
          reservationId: reservation.id,
          usage: calculateAnthropicUsage(response.model, response.usage),
        })
      } catch (anthropicErr) {
        await releaseAiSpend(admin, reservation.id).catch(() => undefined)
        console.warn('[ai-suggest] Anthropic failed, using fallback suggestions:', anthropicErr)
      }
    }

    const detectedBusinessName = deriveBusinessName(url, businessName)
    const result = parseAiJson(aiResponse) ?? buildFallbackSuggestions({
      businessName: detectedBusinessName,
      description: businessDescription,
      webpageTitle,
      webpageDescription,
    })

    return NextResponse.json(result)
  } catch (err) {
    if (err instanceof RequestInputError) {
      return NextResponse.json({ error: err.message }, { status: 400 })
    }
    console.error('[ai-suggest] Error generating suggestions:', err)
    return NextResponse.json({ error: 'suggestion_generation_failed' }, { status: 502 })
  }
}
