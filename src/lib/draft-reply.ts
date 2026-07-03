import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import { NormalizedPost } from './types'

export interface UserProfile {
  business_name: string
  business_description: string
  business_url: string
  business_type: string
  writing_style: string
}

export async function draftReply(
  post: NormalizedPost,
  userProfile: UserProfile,
  intentScore: number
): Promise<string> {

  if (process.env.USE_MOCK_DRAFTS === 'true') {
    return getMockDraft(post, userProfile)
  }

  const systemPrompt = `
You are helping a business owner write an authentic reply on ${post.platform} that naturally mentions their product or service.

CRITICAL RULES:
1. Sound like a real user on ${post.platform}, NOT a marketer or AI
2. Lead with GENUINE VALUE first — answer their question helpfully
3. Mention the product NATURALLY only if genuinely relevant
4. Match the platform's culture and tone
5. NEVER start with "Great question!" or any sycophantic opener
6. Keep it conversational and human
7. Use appropriate formatting (paragraph breaks)
8. Maximum 3 short paragraphs
9. End with a soft CTA, never hard sell
10. Always disclose if mentioning own product: "(disclaimer: I built X)" or similar

The business:
Name: ${userProfile.business_name}
What it does: ${userProfile.business_description}
URL: ${userProfile.business_url}
Type: ${userProfile.business_type}

Their writing style:
${userProfile.writing_style}

Intent score: ${intentScore}/100
`

  const userPrompt = `
Write a reply to this post:

Platform: ${post.platform}
Target: ${post.sourceTarget}
Post: ${post.text || '(no body)'}

The reply should:
- Genuinely help this person
- Naturally mention ${userProfile.business_name} if it's truly relevant to their need
- Sound exactly like the writing style described above
- Feel like it came from a community member who happens to run ${userProfile.business_name}
- Include a one-line disclosure if mentioning own product

Write ONLY the reply text, nothing else.
`

  try {
    const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    
    const response = await anthropic.messages.create({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 1000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    })
    
    if (response.content[0].type === 'text') {
      return response.content[0].text
    }
    return ''
  } catch (error) {
    console.warn('Claude failed, using Gemini', error)
    
    try {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })
      const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`
      const result = await model.generateContent(combinedPrompt)
      return result.response.text()
    } catch (fallbackError) {
      console.error('Both Claude and Gemini failed to draft:', fallbackError)
      return getMockDraft(post, userProfile)
    }
  }
}

function getMockDraft(
  post: NormalizedPost, 
  profile: UserProfile
): string {
  return `Went through the same thing last year. A few things helped us:

First, [genuine advice relevant to their question]. That alone saved significant time.

We also ended up building ${profile.business_name} (${profile.business_url}) specifically to solve this — might be worth a look if you want [specific benefit]. Happy to answer questions about how we approached it.

(disclaimer: I'm the founder of ${profile.business_name})`
}
