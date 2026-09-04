"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getIntentNoiseSignals = getIntentNoiseSignals;
exports.hasDisqualifyingIntentNoise = hasDisqualifyingIntentNoise;
exports.getIntentAiPreflightThreshold = getIntentAiPreflightThreshold;
exports.evaluateIntentPreflight = evaluateIntentPreflight;
const buying_signal_filter_1 = require("./buying-signal-filter");
const phrase_match_1 = require("./phrase-match");
const DEFAULT_AI_PREFLIGHT_THRESHOLD = 55;
const DEFAULT_MAX_ACTIONABLE_POST_AGE_DAYS = 45;
const GENERIC_RELEVANCE_TERMS = new Set([
    'about',
    'after',
    'also',
    'app',
    'apps',
    'based',
    'best',
    'build',
    'business',
    'company',
    'conversation',
    'conversations',
    'customer',
    'customers',
    'data',
    'find',
    'founder',
    'from',
    'generation',
    'good',
    'help',
    'high',
    'intent',
    'into',
    'lead',
    'leads',
    'like',
    'marketing',
    'more',
    'need',
    'online',
    'people',
    'platform',
    'product',
    'reddit',
    'saas',
    'sales',
    'service',
    'social',
    'software',
    'startup',
    'test',
    'tester',
    'testing',
    'that',
    'this',
    'tool',
    'tools',
    'user',
    'users',
    'using',
    'with',
]);
const NOISE_PATTERNS = [
    {
        label: 'self_promotion',
        pattern: /\b(?:i|we)(?:'ve| have)?\s+(?:(?:just|finally|recently)\s+)?(?:built|made|launched|created|released|shipped|finished|developed|introduced)\b|\b(?:just|finally|recently)\s+(?:finished|launched|shipped)\b|\b(?:my|our)\s+(?:\w+\s+){0,4}(?:app|saas|product|platform|tool)\s+(?:is|was)\s+(?:already\s+)?(?:live|launched|released|available)\b/i,
        penalty: 38,
    },
    {
        label: 'showcase',
        pattern: /\b(show\s+hn|roast\s+my|feedback\s+on\s+my|check\s+out\s+my|introducing|give\s+me\s+(?:your\s+)?thoughts|looking\s+for\s+(?:your\s+)?feedback|not\s+looking\s+for\s+(?:sign[-\s]?ups?|customers?|sales))\b/i,
        penalty: 34,
    },
    {
        label: 'hiring_or_job_search',
        pattern: /\b(hiring|job\s+opening|looking\s+for\s+(a\s+)?job|resume|cv|recruiter|recruiters)\b/i,
        penalty: 35,
    },
    {
        label: 'content_promo',
        pattern: /\b(newsletter|webinar|course|ebook|blog\s+post|youtube\s+video)\b/i,
        penalty: 22,
    },
    {
        label: 'third_party_or_editorial_context',
        pattern: /\b(?:customers?|clients?|prospects?|readers?|users?)\s+(?:said|told\s+me|asked|wrote|mentioned)\b[\s\S]{0,140}\b(?:need|looking\s+for|recommend|tool|software|platform)\b|\b(?:sharing|publishing|writing)\b[\s\S]{0,100}\b(?:newsletter|blog\s+post|benchmark\s+report|report|guide|tutorial)\b|\b(?:tutorial|guide|newsletter|report)\b[\s\S]{0,100}\bnot\s+(?:a\s+)?request\b/i,
        penalty: 48,
    },
    {
        label: 'fundraising_or_update',
        pattern: /\b(fundraising|raised\s+\$|monthly\s+update|weekly\s+update|progress\s+update)\b/i,
        penalty: 18,
    },
    {
        label: 'seller_or_service_offer',
        pattern: /\b(?:i|we)\s+(?:(?:can\s+)?help|offer|provide)\b|\b(?:taking|accepting|onboarding)\s+(?:on\s+)?(?:\w+\s+){0,3}(?:new\s+)?clients?\b|\blooking\s+for\s+(?:companies|businesses|founders|clients|customers|teams)\s+(?:who|that)\s+need(?:s)?\b|\b(?:send|dm)\s+me\b|\bbook\s+(?:a|your)\s+(?:call|demo)\b/i,
        penalty: 46,
    },
    {
        label: 'product_sale_listing',
        pattern: /\b(?:i|we)(?:'m|'re|\s+am|\s+are)?\s+(?:looking|hoping|trying)\s+to\s+(?:either\s+)?(?:sell|list|flip|exit)\s+(?:for\s+)?(?:my|our|the)\s+(?:\w+\s+){0,4}(?:saas|app|product|startup|business|website)\b|\blooking\s+to\s+(?:either\s+)?sell\s+(?:for\s+)?(?:my|our|the)\s+(?:\w+\s+){0,4}(?:saas|app|product|startup|business|website)\b|\b(?:my|our)\s+(?:\w+\s+){0,4}(?:saas|app|product|startup|business|website)\s+is\s+for\s+sale\b|\b(?:asking\s+price|acquire\.com\s+listing)\b/i,
        penalty: 52,
    },
    {
        label: 'launch_recruitment',
        pattern: /\b(?:beta\s+testers?|testers?\s+for\s+(?:a\s+)?beta|looking\s+for\s+testers?|need\s+(?:people|users|founders|teams)\s+to\s+beta\s+test|design\s+partners?|pilot(?:\s+it)?\s+for\s+free|free\s+for\s+30\s+days|opening\s+(?:up\s+)?early\s+access|join\s+(?:the\s+)?waitlist|sign\s+up\s+for\s+(?:the\s+)?beta|looking\s+for\s+(?:\w+\s+){0,3}(?:to\s+)?try\s+(?:my|our)|try\s+(?:my|our)\s+(?:app|product|platform|tool|saas))\b/i,
        penalty: 46,
    },
    {
        label: 'partnership_solicitation',
        pattern: /\b(?:i|we)(?:'m|'re|\s+am|\s+are)?\s+looking\s+to\s+(?:partner|collaborate)\s+with\b|\b(?:looking\s+for|seeking)\s+(?:strategic\s+)?partners?\b|\bi(?:'d|\s+would)\s+like\s+to\s+connect\b|\blet'?s\s+build\s+(?:this|the\s+standard)\b/i,
        penalty: 46,
    },
    {
        label: 'retrospective_or_educational_post',
        pattern: /\b(?:here'?s\s+what\s+it\s+actually\s+took|before\s+it\s+actually\s+worked|sharing\s+a\s+(?:customer\s+)?review|my\s+(?:first\s+)?customer\s+review|my\s+thoughts\s+on)\b/i,
        penalty: 40,
    },
    {
        label: 'content_solicitation',
        pattern: /\b(?:subscribe|read\s+the\s+full\s+guide|watch\s+my|download\s+my|join\s+my\s+(?:newsletter|webinar|course))\b/i,
        penalty: 42,
    },
    {
        label: 'academic_or_hypothetical',
        pattern: /\b(?:(?:university|academic)\s+(?:paper|survey|study|assignment|research)|thesis|research\s+paper|class\s+project|collecting\s+examples|survey\s+for\s+(?:school|college|university))\b/i,
        penalty: 42,
    },
    {
        label: 'explicit_non_buyer_statement',
        pattern: /\b(?:do|does|did|would|could)\s+not\s+need\b|\b(?:don't|doesn't|didn't|wouldn't|couldn't)\s+need\b|\bno\s+need\s+for\b|\bnot\s+(?:evaluating\s+or\s+buying|buying\s+anything|shopping\s+for|a\s+request\s+for\s+(?:software\s+)?recommendations?)\b/i,
        penalty: 52,
    },
    {
        label: 'sarcasm_or_mockery',
        pattern: /\byeah,?\s+because\b|\bexactly\s+what\s+(?:the\s+world|we\s+all)\s+needs\b|\bplease\s+invent\s+(?:another|more|five)\b|\banother\s+[^.!?]{0,60}\bspamm?ing\b/i,
        penalty: 46,
    },
    {
        label: 'unrelated_request_pivot',
        pattern: /\b(?:this|my)\s+(?:request|question|need)\s+is\s+(?:only|actually|specifically)\s+about\b|\b(?:nothing|not)\s+to\s+do\s+with\b/i,
        penalty: 48,
    },
    {
        label: 'own_product_technical_request',
        pattern: /\b(?:my|our)\s+(?:\w+\s+){0,5}(?:app|saas|product|platform|tool)\b[\s\S]{0,180}\b(?:debug(?:ging)?|hydration|react|code|api|database|technical\s+error|stack\s+trace)\b/i,
        penalty: 48,
    },
];
const DISQUALIFYING_NOISE_SIGNALS = new Set([
    'self_promotion',
    'showcase',
    'hiring_or_job_search',
    'seller_or_service_offer',
    'product_sale_listing',
    'launch_recruitment',
    'partnership_solicitation',
    'retrospective_or_educational_post',
    'content_solicitation',
    'third_party_or_editorial_context',
    'academic_or_hypothetical',
    'explicit_non_buyer_statement',
    'sarcasm_or_mockery',
    'unrelated_request_pivot',
    'own_product_technical_request',
    'stale_post',
    'no_first_party_demand',
]);
const BUYER_CONTEXT_OVERRIDABLE_NOISE_SIGNALS = new Set([
    'self_promotion',
    'content_promo',
    'explicit_non_buyer_statement',
    'seller_or_service_offer',
    'third_party_or_editorial_context',
]);
function normalizeText(value) {
    return (value ?? '').toLocaleLowerCase();
}
function termsFrom(value) {
    return [...new Set(normalizeText(value)
            .split(/[^a-z0-9]+/g)
            .map(term => term.trim())
            .filter(term => term.length >= 4 && !GENERIC_RELEVANCE_TERMS.has(term)))];
}
function getIntentNoiseSignals(text) {
    return NOISE_PATTERNS
        .filter(({ pattern }) => pattern.test(text))
        .map(({ label }) => label);
}
function hasBuyerDecisionEvidence(text, categories) {
    return categories.includes('purchase')
        || /\b(?:approved\s+(?:grant\s+)?budget|budget\s+(?:of|under|below|for)|select(?:ing)?\s+(?:a\s+)?vendor|choose\s+(?:one|a\s+vendor)|comparing\s+(?:annual\s+|monthly\s+)?pricing|shortlist)\b/i.test(text);
}
function hasBuyerContextOverride(text, categories) {
    return hasAffirmedSolutionNeed(text) && hasBuyerDecisionEvidence(text, categories);
}
function getEffectiveIntentNoiseSignals(text, categories) {
    const canOverrideRoleNoise = hasBuyerContextOverride(text, categories);
    return getIntentNoiseSignals(text).filter(signal => !(canOverrideRoleNoise
        && BUYER_CONTEXT_OVERRIDABLE_NOISE_SIGNALS.has(signal)));
}
/**
 * These are author-side activities, not requests to buy. Reject them before
 * saving a lead so generic phrases such as "looking for feedback" cannot turn
 * into false buyer-intent candidates.
 */
function hasDisqualifyingIntentNoise(text) {
    const categories = (0, buying_signal_filter_1.analyzeBuyingSignals)(text).categories;
    return getEffectiveIntentNoiseSignals(text, categories).some(signal => DISQUALIFYING_NOISE_SIGNALS.has(signal));
}
function labelForScore(score) {
    if (score >= 80)
        return 'buying';
    if (score >= 60)
        return 'researching';
    if (score >= 40)
        return 'complaining';
    return 'other';
}
function scoreFromCategories(categories) {
    const scores = categories.map((category) => {
        if (category === 'purchase')
            return 82;
        if (category === 'seeking')
            return 72;
        if (category === 'research')
            return 64;
        if (category === 'pain')
            return 54;
        return 35;
    });
    if (scores.length === 0)
        return 30;
    return Math.max(...scores) + Math.max(0, scores.length - 1) * 4;
}
function getIntentAiPreflightThreshold() {
    const configured = process.env.INTENT_AI_PREFLIGHT_THRESHOLD?.trim();
    if (!configured)
        return DEFAULT_AI_PREFLIGHT_THRESHOLD;
    const parsed = Number(configured);
    if (!Number.isFinite(parsed))
        return DEFAULT_AI_PREFLIGHT_THRESHOLD;
    const percentage = parsed > 0 && parsed <= 1 ? parsed * 100 : parsed;
    return Math.min(80, Math.max(35, Math.round(percentage)));
}
function configuredMaxPostAgeDays() {
    const configured = process.env.INTENT_MAX_POST_AGE_DAYS?.trim();
    if (!configured)
        return DEFAULT_MAX_ACTIONABLE_POST_AGE_DAYS;
    const parsed = Number(configured);
    if (!Number.isFinite(parsed))
        return DEFAULT_MAX_ACTIONABLE_POST_AGE_DAYS;
    return Math.min(365, Math.max(1, Math.round(parsed)));
}
function getPostAgeDays(createdAt) {
    const timestamp = Date.parse(createdAt);
    if (!Number.isFinite(timestamp))
        return null;
    return Math.max(0, (Date.now() - timestamp) / 86_400_000);
}
const LOW_CONTEXT_KEYWORDS = new Set([
    'app',
    'business',
    'marketing',
    'saas',
    'sales',
    'software',
    'startup',
    'tech',
    'technology',
    'tool',
]);
const GENERIC_KEYWORD_BUYER_CONTEXT = /\b(?:need|looking\s+for|seeking|recommend(?:ation|ations)?|suggestions?|help|strategy|service|agency|consultant|platform|software|tool|app|solution|vendor|provider|alternative|replacement)\b/i;
function normalizedPhrase(value) {
    return value
        .toLocaleLowerCase()
        .replace(/[^a-z0-9]+/g, ' ')
        .trim();
}
function hasContextualKeywordMatch(text, keywordTerm) {
    if (!(0, phrase_match_1.containsConfiguredPhrase)(text, keywordTerm))
        return false;
    if (!LOW_CONTEXT_KEYWORDS.has(normalizedPhrase(keywordTerm)))
        return true;
    return text
        .split(/(?:[.!?;]|\n)/)
        .some(clause => ((0, phrase_match_1.containsConfiguredPhrase)(clause, keywordTerm)
        && GENERIC_KEYWORD_BUYER_CONTEXT.test(clause)));
}
function hasFirstPartyBuyerDemand(text) {
    const clauses = text.split(/(?:[.!?;]|\n)/);
    const hasFirstPartyReference = /\b(?:i|me|my|mine|we|us|our|ours)\b/i.test(text);
    const firstPartyClause = clauses.some((clause) => {
        if (!/\b(?:i|me|my|mine|we|us|our|ours)\b/i.test(clause))
            return false;
        return (0, buying_signal_filter_1.analyzeBuyingSignals)(clause).categories.length > 0;
    });
    const directRequestTitle = /^(?:need|looking\s+for|seeking|recommend(?:ation|ations)?(?:\s+for)?|anyone\s+know|does\s+anyone\s+know|is\s+there\s+(?:a|an)|what\s+(?:tool|software|platform))\b/i.test(text.trim());
    const crossClauseFirstPartyRequest = hasFirstPartyReference
        && /\b(?:point\s+me\s+to|is\s+there\s+(?:a\s+way|a\s+tool|an\s+app|software)|what\s+do\s+you\s+use|what\s+are\s+you\s+using|does\s+anyone\s+know|anyone\s+know\s+of)\b/i.test(text);
    return firstPartyClause
        || directRequestTitle
        || crossClauseFirstPartyRequest
        || hasAffirmedSolutionNeed(text);
}
function hasAffirmedSolutionNeed(text) {
    return text
        .split(/(?:[.!?;]|\bbut\b|\bhowever\b|\byet\b)/i)
        .some((clause) => {
        if (/\b(?:customers?|clients?|prospects?|readers?|users?)\s+(?:said|told\s+me|asked|wrote|mentioned)\b/i.test(clause)) {
            return false;
        }
        if (/\b(?:do|does|did|would|could)\s+not\s+need\b|\b(?:don't|doesn't|didn't|wouldn't|couldn't)\s+need\b|\bno\s+need\s+for\b/i.test(clause)) {
            return false;
        }
        return /\b(?:i|we|our\s+(?:team|company|agency|lab|business))\b[\s\S]{0,80}\b(?:do\s+)?need(?:s)?\b[\s\S]{0,90}\b(?:tool|software|platform|app|solution|vendor|monitoring)\b/i.test(clause)
            || /\b(?:i|we)\b[\s\S]{0,60}\b(?:am|are)?\s*(?:looking\s+for|evaluating|comparing|trying\s+to\s+find)\b[\s\S]{0,90}\b(?:tool|software|platform|app|solution|vendor|monitoring)\b/i.test(clause);
    });
}
function evaluateIntentPreflight(post, profile, options = {}) {
    const text = `${post.title ?? ''} ${post.text ?? ''}`.trim();
    const analysis = (0, buying_signal_filter_1.analyzeBuyingSignals)(text);
    const keywordTerm = options.keywordTerm?.trim() || '';
    const matchedKeywords = (0, phrase_match_1.containsConfiguredPhrase)(text, keywordTerm)
        ? [keywordTerm]
        : [];
    const contextualKeywordMatch = keywordTerm.length > 0
        && hasContextualKeywordMatch(text, keywordTerm);
    const hasFirstPartyDemand = hasFirstPartyBuyerDemand(text);
    const relevanceTerms = [
        ...termsFrom(profile.business_name),
        ...termsFrom(profile.business_description),
    ].filter(term => (0, phrase_match_1.containsConfiguredPhrase)(text, term));
    const uniqueRelevanceTerms = [...new Set(relevanceTerms)];
    const profileContext = `${profile.business_name ?? ''} ${profile.business_description ?? ''}`;
    const platformContextMatch = (0, phrase_match_1.containsConfiguredPhrase)(profileContext, post.platform)
        || (post.platform === 'reddit' && /\bsubreddits?\b/i.test(profileContext));
    const platformTopicMatch = platformContextMatch && (post.platform === 'reddit'
        ? /\b(?:reddit|subreddits?)\b/i.test(text)
        : (0, phrase_match_1.containsConfiguredPhrase)(text, post.platform));
    const postAgeDays = getPostAgeDays(post.createdAt);
    const isStalePost = postAgeDays !== null && postAgeDays > configuredMaxPostAgeDays();
    const noiseSignals = [
        ...getIntentNoiseSignals(text),
        ...(isStalePost ? ['stale_post'] : []),
        ...(!hasFirstPartyDemand ? ['no_first_party_demand'] : []),
    ];
    const competitorRisk = (profile.competitors ?? []).some((competitor) => competitor.trim().length > 1 && (0, phrase_match_1.containsConfiguredPhrase)(text, competitor));
    const buyerContextOverride = hasBuyerContextOverride(text, analysis.categories);
    const effectiveNoiseSignals = noiseSignals.filter(signal => !(buyerContextOverride
        && BUYER_CONTEXT_OVERRIDABLE_NOISE_SIGNALS.has(signal)));
    const noisePenalty = NOISE_PATTERNS
        .filter(({ label, pattern }) => effectiveNoiseSignals.includes(label) && pattern.test(text))
        .reduce((total, { penalty }) => total + penalty, 0);
    const categoryScore = scoreFromCategories(analysis.categories);
    const keywordBoost = matchedKeywords.length > 0 ? 8 : 0;
    const relevanceBoost = Math.min(10, uniqueRelevanceTerms.length * 3);
    const platformContextBoost = platformTopicMatch ? 3 : 0;
    const competitorBoost = competitorRisk ? 14 : 0;
    const questionBoost = analysis.categories.length > 0
        && /[?]|\b(how|what|which|where|anyone|does|is there)\b/i.test(text)
        ? 4
        : 0;
    const shortPenalty = text.length < 36 ? 14 : 0;
    const hasContextualMatch = contextualKeywordMatch
        || uniqueRelevanceTerms.length > 0
        || competitorRisk
        || platformTopicMatch;
    const hasDisqualifyingNoise = effectiveNoiseSignals.some(signal => DISQUALIFYING_NOISE_SIGNALS.has(signal));
    const missingContextPenalty = hasContextualMatch ? 0 : 42;
    const disqualifyingNoisePenalty = hasDisqualifyingNoise ? 22 : 0;
    const stalePenalty = isStalePost ? 60 : 0;
    const rawScore = Math.max(0, Math.min(95, Math.round(categoryScore
        + keywordBoost
        + relevanceBoost
        + platformContextBoost
        + competitorBoost
        + questionBoost
        - noisePenalty
        - disqualifyingNoisePenalty
        - missingContextPenalty
        - shortPenalty
        - stalePenalty)));
    const hasDirectCommercialShape = analysis.categories.some(category => category === 'purchase' || category === 'seeking' || category === 'research');
    const isQualifiedCandidate = (hasContextualMatch
        && hasFirstPartyDemand
        && analysis.categories.length > 0
        && !hasDisqualifyingNoise);
    const hasSolutionEvaluationShape = /\b(?:looking\s+for|need(?:\s+an?|\s+to)?|trying\s+to\s+find|searching\s+for|recommend(?:ation|ations)?)\b[\s\S]{0,90}\b(?:tool|software|platform|app|solution|alternative|replacement)\b/i.test(text);
    const hasActiveDecisionSignal = analysis.categories.includes('purchase')
        || analysis.matchedSignals.some(signal => [
            'alternative to',
            'alternatives to',
            'switching from',
            'switched from',
            'leaving',
            'canceling',
            'cancelled my',
        ].includes(signal))
        || hasSolutionEvaluationShape;
    const score = !isQualifiedCandidate
        ? Math.min(39, rawScore)
        : hasActiveDecisionSignal
            ? rawScore
            : Math.min(79, rawScore);
    const shouldUseAi = (score >= getIntentAiPreflightThreshold()
        && isQualifiedCandidate
        && hasDirectCommercialShape) || (competitorRisk
        && isQualifiedCandidate
        && score >= 50);
    const evidenceSignals = [
        ...analysis.matchedSignals,
        ...matchedKeywords.map(term => `keyword:${term}`),
        ...(contextualKeywordMatch ? [`context:keyword:${keywordTerm}`] : []),
        ...uniqueRelevanceTerms.map(term => `context:${term}`),
        ...(platformTopicMatch ? [`context:platform:${post.platform}`] : []),
        ...(hasFirstPartyDemand ? ['context:first_party_demand'] : []),
        ...(buyerContextOverride ? ['context:affirmed_buyer_need'] : []),
        ...noiseSignals.map(signal => `noise:${signal}`),
    ];
    const label = labelForScore(score);
    const reasoning = !isQualifiedCandidate
        ? `Preflight rejected this candidate: ${evidenceSignals.slice(0, 4).join(', ') || 'no verified buyer context'}.`
        : shouldUseAi
            ? `Preflight passed: ${evidenceSignals.slice(0, 4).join(', ') || 'commercial context matched'}.`
            : evidenceSignals.length > 0
                ? `Preflight kept this deterministic: ${evidenceSignals.slice(0, 4).join(', ')}.`
                : 'Preflight found no strong commercial intent signals.';
    return {
        score,
        label,
        reasoning,
        ...(competitorRisk ? { flag: 'COMPETITOR_RISK' } : {}),
        shouldUseAi,
        isQualifiedCandidate,
        evidenceSignals,
        matchedKeywords,
        relevanceTerms: uniqueRelevanceTerms,
        noiseSignals,
    };
}
