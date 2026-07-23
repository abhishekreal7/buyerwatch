import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/utils/supabase/server'
import { generateKimiChat } from '@/lib/kimi'

export async function POST(req: NextRequest) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

    const { url, businessName, businessDescription } = await req.json()

    let webpageText = ''
    if (url && url.startsWith('http')) {
      try {
        const fetchRes = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          },
          signal: AbortSignal.timeout(5000),
        })
        if (fetchRes.ok) {
          const html = await fetchRes.text()
          // Extract text from title, meta description, and body headers
          const title = html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1] ?? ''
          const metaDesc = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']*)["']/i)?.[1] ?? ''
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

    const aiResponse = await generateKimiChat({
      messages: [
        { role: 'system', content: 'You output strictly valid JSON without explanation or formatting wrappers.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.3,
    })

    // Clean JSON response string
    const jsonString = aiResponse.replace(/```json/g, '').replace(/```/g, '').trim()
    const result = JSON.parse(jsonString)

    return NextResponse.json(result)
  } catch (err: any) {
    console.error('[ai-suggest] Error generating suggestions:', err)
    // Fallback default suggestions if AI fails
    return NextResponse.json({
      description: 'AI intelligence tool for automated lead discovery and growth.',
      subreddits: ['SaaS', 'startups', 'Entrepreneur', 'smallbusiness', 'marketing', 'webdev'],
      buyerKeywords: ['best tool for lead generation', 'looking for alternative'],
      competitorKeywords: ['alternative to hubspot', 'leaving salesforce'],
      painPointKeywords: ['how to find early SaaS customers', 'struggling with outreach'],
    })
  }
}
