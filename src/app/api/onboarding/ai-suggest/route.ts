import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { GoogleGenerativeAI } from '@google/generative-ai'
import Anthropic from '@anthropic-ai/sdk'
import { fetchPublicText } from '@/lib/security/outbound-url'
import {
  buildFallbackSuggestions,
  sanitizeOnboardingSuggestions,
  type OnboardingSuggestions,
} from '@/lib/onboarding-intelligence'
import { normalizeWebsiteUrl } from '@/lib/onboarding-validation'

function cleanApiKey(value: string | undefined): string {
  const trimmed = value?.trim() ?? ''
  return trimmed && !trimmed.startsWith('#') && !trimmed.toLowerCase().includes('todo') ? trimmed : ''
}

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

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const payload = await req.json()
    const url = normalizeWebsiteUrl(typeof payload.url === 'string' ? payload.url : '')
    const businessName = typeof payload.businessName === 'string' ? payload.businessName.trim() : ''
    const businessDescription = typeof payload.businessDescription === 'string' ? payload.businessDescription.trim() : ''

    if (!url && !businessName) {
      return NextResponse.json({ error: 'Enter a website URL or business name.' }, { status: 400 })
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
      } catch (err) {
        console.warn('[ai-suggest] Failed to fetch URL, relying on user inputs:', err)
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

    let aiResponse = ''
    const geminiKey = cleanApiKey(process.env.GEMINI_API_KEY)
    const anthropicKey = cleanApiKey(process.env.ANTHROPIC_API_KEY)

    if (geminiKey) {
      try {
        const genAI = new GoogleGenerativeAI(geminiKey)
        const model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' })
        const result = await model.generateContent(prompt, { timeout: 20_000 })
        aiResponse = result.response.text()
      } catch (geminiErr) {
        console.warn('[ai-suggest] Gemini failed, attempting Anthropic...', geminiErr)
      }
    }

    if (!aiResponse && anthropicKey) {
      try {
        const anthropic = new Anthropic({
          apiKey: anthropicKey,
          timeout: 20_000,
          maxRetries: 1,
        })
        const response = await anthropic.messages.create({
          model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-5',
          max_tokens: 1000,
          system: 'You output strictly valid JSON without explanation or formatting wrappers.',
          messages: [{ role: 'user', content: prompt }]
        })
        if (response.content[0].type === 'text') {
          aiResponse = response.content[0].text
        }
      } catch (anthropicErr) {
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
    console.error('[ai-suggest] Error generating suggestions:', err)
    return NextResponse.json({ error: 'suggestion_generation_failed' }, { status: 502 })
  }
}
