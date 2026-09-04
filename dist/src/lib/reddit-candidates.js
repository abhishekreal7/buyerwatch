"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildRedditScoreCandidates = void 0;
exports.withProfileCompetitors = withProfileCompetitors;
exports.buildSocialScoreCandidates = buildSocialScoreCandidates;
const buying_signal_filter_1 = require("./buying-signal-filter");
const content_freshness_1 = require("./content-freshness");
const intent_preflight_1 = require("./intent-preflight");
const phrase_match_1 = require("./phrase-match");
/** Keep competitor-watch matching consistent across serverless and worker fetchers. */
function withProfileCompetitors(mappings) {
    return mappings.map(({ profiles, competitors, ...mapping }) => {
        const profile = Array.isArray(profiles) ? profiles[0] : profiles;
        return {
            ...mapping,
            competitors: profile?.competitors ?? competitors ?? [],
        };
    });
}
function buildSocialScoreCandidates(posts, keywordMappings) {
    const userKeywords = new Map();
    for (const mapping of keywordMappings) {
        const keywords = userKeywords.get(mapping.user_id) ?? [];
        keywords.push(mapping);
        userKeywords.set(mapping.user_id, keywords);
    }
    const candidates = [];
    let skipped = 0;
    for (const post of posts) {
        if (!(0, content_freshness_1.evaluateContentFreshness)(post.createdAt).fresh) {
            skipped += userKeywords.size;
            continue;
        }
        const searchable = `${post.title || ''} ${post.text || ''}`;
        for (const [userId, keywords] of userKeywords) {
            const matched = keywords.find(({ term }) => (0, phrase_match_1.containsConfiguredPhraseOrAlias)(searchable, term));
            const competitorMatch = keywords.find(({ competitors }) => (competitors ?? []).some(competitor => competitor.trim().length > 1
                && (0, phrase_match_1.containsConfiguredPhrase)(searchable, competitor)));
            // Generic wording such as "looking for" is only useful after it is tied
            // to a configured keyword or an explicit competitor mention.
            if ((!matched && !competitorMatch)
                || !(0, buying_signal_filter_1.hasBuyingSignal)(searchable)
                || (0, intent_preflight_1.hasDisqualifyingIntentNoise)(searchable)) {
                skipped += 1;
                continue;
            }
            candidates.push({
                userId,
                keywordId: (matched ?? competitorMatch ?? keywords[0]).id,
                post,
            });
        }
    }
    return { candidates, skipped, users: userKeywords.size };
}
exports.buildRedditScoreCandidates = buildSocialScoreCandidates;
