"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeOnboardingSuggestions = sanitizeOnboardingSuggestions;
exports.buildFallbackSuggestions = buildFallbackSuggestions;
function cleanText(value, maxLength) {
    return typeof value === 'string'
        ? value.replace(/\s+/g, ' ').trim().slice(0, maxLength)
        : '';
}
function cleanList(value, options) {
    if (!Array.isArray(value))
        return [];
    const seen = new Set();
    const result = [];
    for (const item of value) {
        const cleaned = cleanText(item, options.maxLength).replace(/^r\//i, '');
        const key = cleaned.toLocaleLowerCase();
        if (cleaned.length < 2
            || seen.has(key)
            || (options.pattern && !options.pattern.test(cleaned))) {
            continue;
        }
        seen.add(key);
        result.push(cleaned);
        if (result.length >= options.maxItems)
            break;
    }
    return result;
}
function sanitizeOnboardingSuggestions(candidate, source) {
    return {
        businessName: cleanText(candidate.businessName, 120) || undefined,
        description: cleanText(candidate.description, 1_000),
        subreddits: cleanList(candidate.subreddits, {
            maxItems: 8,
            maxLength: 50,
            pattern: /^[A-Za-z0-9_]+$/,
        }),
        buyerKeywords: cleanList(candidate.buyerKeywords, { maxItems: 8, maxLength: 120 }),
        competitorKeywords: cleanList(candidate.competitorKeywords, { maxItems: 8, maxLength: 120 }),
        painPointKeywords: cleanList(candidate.painPointKeywords, { maxItems: 8, maxLength: 120 }),
        source,
    };
}
function buildFallbackSuggestions(input) {
    const context = `${input.description} ${input.webpageTitle} ${input.webpageDescription}`.toLocaleLowerCase();
    const subreddits = context.match(/\b(?:developer|api|code|software|saas)\b/)
        ? ['SaaS', 'startups', 'webdev', 'programming', 'Entrepreneur']
        : context.match(/\b(?:shop|store|ecommerce|retail|product)\b/)
            ? ['ecommerce', 'smallbusiness', 'Entrepreneur', 'marketing', 'startups']
            : ['SaaS', 'startups', 'Entrepreneur', 'smallbusiness', 'marketing'];
    return sanitizeOnboardingSuggestions({
        businessName: input.businessName,
        description: input.description || input.webpageDescription || input.webpageTitle,
        subreddits,
        buyerKeywords: [
            'looking for a tool',
            'recommend a tool',
            'best way to',
        ],
        competitorKeywords: [
            'alternative to',
            'switching from',
            'too expensive',
        ],
        painPointKeywords: [
            'struggling with',
            'need a better way',
            'does not work',
        ],
    }, input.webpageDescription || input.webpageTitle ? 'website' : 'fallback');
}
