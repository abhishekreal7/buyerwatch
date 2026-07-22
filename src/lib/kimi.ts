import OpenAI from 'openai'

/**
 * Kimi API Client helper using Moonshot AI endpoint with kimi-k3 model
 */
export function getKimiClient(): OpenAI {
  const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY
  if (!apiKey) {
    throw new Error('Missing KIMI_API_KEY or MOONSHOT_API_KEY in environment variables.')
  }

  const baseURL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1'

  return new OpenAI({
    apiKey,
    baseURL,
  })
}

export interface KimiChatOptions {
  messages: Array<{ role: 'system' | 'user' | 'assistant'; content: string }>
  model?: string
  temperature?: number
  max_tokens?: number
}

/**
 * Generate a chat response using Kimi K3 (or specified Kimi model)
 */
export async function generateKimiChat(options: KimiChatOptions): Promise<string> {
  const kimi = getKimiClient()
  const model = options.model || process.env.KIMI_MODEL || 'kimi-k3'

  const completion = await kimi.chat.completions.create({
    model,
    messages: options.messages,
    temperature: options.temperature ?? 0.3,
    max_tokens: options.max_tokens,
  })

  return completion.choices[0]?.message?.content || ''
}
