import { GoogleGenerativeAI } from '@google/generative-ai'
import { NormalizedPost } from './types'

export async function scoreIntent(
  post: NormalizedPost,
  userProfile: any
): Promise<{
  score: number
  label: 'buying' | 'researching' | 'complaining' | 'other'
  reasoning: string
  flag?: string
}> {
  if (process.env.USE_MOCK_DRAFTS === 'true') {
    return {
      score: Math.floor(Math.random() * 100),
      label: 'buying',
      reasoning: 'Mock mode reasoning.',
      flag: userProfile?.competitors?.length > 0 && Math.random() > 0.8 ? 'COMPETITOR_RISK' : undefined
    }
  }

const competitorsContext = userProfile.competitors?.length > 0 
    ? `\nCOMPETITOR WATCHLIST: ${userProfile.competitors.join(', ')}\nIf the user is complaining about or seeking an alternative to any of these competitors, heavily flag this opportunity.` 
    : ''

  const prompt = `
You are analyzing a public post on ${post.platform} to determine if the author needs a product or service.

Business context: ${userProfile.business_name} - ${userProfile.business_description}
Target matched: "${post.sourceTarget}"${competitorsContext}

Post:
Text: ${post.text || '(no body text)'}

Score this post from 0-100 for buying intent:
- 80-100: Person is actively looking for a solution/product RIGHT NOW, or asking for an alternative to a competitor on our watchlist.
- 60-79: Person is researching options, not yet decided
- 40-59: Person is complaining about a competitor (not on watchlist) or current solution
- 0-39: General discussion, low commercial intent

Respond ONLY with this JSON (no markdown formatting, just pure JSON):
{
  "score": number,
  "label": "buying" | "researching" | "complaining" | "other",
  "reasoning": "one sentence explanation",
  "flag": "COMPETITOR_RISK" or null (set to COMPETITOR_RISK ONLY if they mention a competitor from the watchlist)
}
`

  try {
    let responseText = ''

    // 1. Try Google Vertex AI (GCP Cloud integration)
    const gcpProject = process.env.GCP_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || 'scouto-501307'
    const gcpLocation = process.env.GCP_LOCATION || 'us-central1'

    try {
      const { VertexAI } = await import('@google-cloud/vertexai')
      const vertexAI = new VertexAI({ project: gcpProject, location: gcpLocation })
      const generativeModel = vertexAI.getGenerativeModel({ model: 'gemini-1.5-flash-002' })
      const result = await generativeModel.generateContent(prompt)
      const response = await result.response
      if (response.candidates?.[0]?.content?.parts?.[0]?.text) {
        responseText = response.candidates[0].content.parts[0].text
      }
    } catch {
      // Fallback to standard GoogleGenerativeAI API key if Vertex AI call is unauthenticated
    }

    // 2. Fallback to standard API Key if Vertex AI is not configured
    if (!responseText && process.env.GEMINI_API_KEY) {
      const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
      const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" })
      const result = await model.generateContent(prompt)
      responseText = result.response.text()
    }

    if (!responseText) {
      throw new Error('No response generated from Vertex AI or Gemini')
    }

    // Strip possible markdown formatting if the model still adds it
    const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim()
    return JSON.parse(cleanJson)
  } catch (error) {
    console.error('Scoring failed:', error)
    return {
      score: 0,
      label: 'other',
      reasoning: 'Error during scoring.'
    }
  }
}
