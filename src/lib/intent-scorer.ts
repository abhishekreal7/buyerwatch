import { GoogleGenerativeAI } from '@google/generative-ai'
import { NormalizedPost } from './types'

export async function scoreIntent(
  post: NormalizedPost,
  userProfile: any
): Promise<{
  score: number
  label: 'buying' | 'researching' | 'complaining' | 'other'
  reasoning: string
}> {
  if (process.env.USE_MOCK_DRAFTS === 'true') {
    return {
      score: Math.floor(Math.random() * 100),
      label: 'buying',
      reasoning: 'Mock mode reasoning.'
    }
  }

  const prompt = `
You are analyzing a public post on ${post.platform} to determine if the author needs a product or service.

Business context: ${userProfile.business_name} - ${userProfile.business_description}
Target matched: "${post.sourceTarget}"

Post:
Text: ${post.text || '(no body text)'}

Score this post from 0-100 for buying intent:
- 80-100: Person is actively looking for a solution/product RIGHT NOW
- 60-79: Person is researching options, not yet decided
- 40-59: Person is complaining about a competitor or current solution
- 0-39: General discussion, low commercial intent

Respond ONLY with this JSON (no markdown formatting, just pure JSON):
{
  "score": number,
  "label": "buying" | "researching" | "complaining" | "other",
  "reasoning": "one sentence explanation"
}
`

  try {
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!)
    const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" })

    const result = await model.generateContent(prompt)
    const responseText = result.response.text()
    
    // Strip possible markdown formatting if the model still adds it
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
    
    return JSON.parse(cleanJson)
  } catch (error) {
    console.error('Gemini scoring failed:', error)
    return {
      score: 0,
      label: 'other',
      reasoning: 'Error during scoring.'
    }
  }
}
