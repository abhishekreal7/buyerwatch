import { hasBuyingSignal } from './buying-signal-filter'
import { hasDisqualifyingIntentNoise } from './intent-preflight'
import { containsConfiguredPhrase } from './phrase-match'
import type { NormalizedPost } from './types'

export type SocialKeywordMapping = {
  id: string
  user_id: string
  term: string
  competitors?: string[] | null
}

type KeywordMappingWithProfile = SocialKeywordMapping & {
  profiles?:
    | { competitors?: string[] | null }
    | Array<{ competitors?: string[] | null }>
}

/** Keep competitor-watch matching consistent across serverless and worker fetchers. */
export function withProfileCompetitors(
  mappings: KeywordMappingWithProfile[],
): SocialKeywordMapping[] {
  return mappings.map(({ profiles, competitors, ...mapping }) => {
    const profile = Array.isArray(profiles) ? profiles[0] : profiles
    return {
      ...mapping,
      competitors: profile?.competitors ?? competitors ?? [],
    }
  })
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
  const userKeywords = new Map<string, SocialKeywordMapping[]>()
  for (const mapping of keywordMappings) {
    const keywords = userKeywords.get(mapping.user_id) ?? []
    keywords.push(mapping)
    userKeywords.set(mapping.user_id, keywords)
  }

  const candidates: SocialScoreCandidate[] = []
  let skipped = 0

  for (const post of posts) {
    const searchable = `${post.title || ''} ${post.text || ''}`

    for (const [userId, keywords] of userKeywords) {
      const matched = keywords.find(({ term }) => containsConfiguredPhrase(searchable, term))
      const competitorMatch = keywords.find(({ competitors }) =>
        (competitors ?? []).some(competitor =>
          competitor.trim().length > 1
          && containsConfiguredPhrase(searchable, competitor),
        ),
      )

      // Generic wording such as "looking for" is only useful after it is tied
      // to a configured keyword or an explicit competitor mention.
      if (
        (!matched && !competitorMatch)
        || !hasBuyingSignal(searchable)
        || hasDisqualifyingIntentNoise(searchable)
      ) {
        skipped += 1
        continue
      }

      candidates.push({
        userId,
        keywordId: (matched ?? competitorMatch ?? keywords[0]).id,
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
