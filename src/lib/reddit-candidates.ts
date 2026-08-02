import { hasBuyingSignal } from './buying-signal-filter'
import type { NormalizedPost } from './types'

export type SocialKeywordMapping = {
  id: string
  user_id: string
  term: string
}

export type SocialScoreCandidate = {
  userId: string
  keywordId: string
  post: NormalizedPost
}

export function buildSocialScoreCandidates(
  posts: NormalizedPost[],
  keywordMappings: SocialKeywordMapping[],
): { candidates: SocialScoreCandidate[]; skipped: number; users: number } {
  const userKeywords = new Map<string, Array<{ id: string; term: string }>>()
  for (const mapping of keywordMappings) {
    const keywords = userKeywords.get(mapping.user_id) ?? []
    keywords.push({ id: mapping.id, term: mapping.term })
    userKeywords.set(mapping.user_id, keywords)
  }

  const candidates: SocialScoreCandidate[] = []
  let skipped = 0

  for (const post of posts) {
    const searchable = `${post.title || ''} ${post.text || ''}`.toLowerCase()

    for (const [userId, keywords] of userKeywords) {
      const matched = keywords.find(({ term }) => {
        const normalizedTerm = term.trim().toLowerCase()
        return normalizedTerm.length > 0 && searchable.includes(normalizedTerm)
      })

      if (!matched && !hasBuyingSignal(searchable)) {
        skipped += 1
        continue
      }

      candidates.push({
        userId,
        keywordId: (matched ?? keywords[0]).id,
        post,
      })
    }
  }

  return { candidates, skipped, users: userKeywords.size }
}

// Keep the existing names available for the dedicated Reddit worker.
export type RedditKeywordMapping = SocialKeywordMapping
export type RedditScoreCandidate = SocialScoreCandidate
export const buildRedditScoreCandidates = buildSocialScoreCandidates
