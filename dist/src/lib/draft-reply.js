"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.DISCLOSURE_PATTERNS = exports.PROMOTIONAL_PHRASES = void 0;
exports.hasDisclosure = hasDisclosure;
exports.draftReply = draftReply;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const generative_ai_1 = require("@google/generative-ai");
exports.PROMOTIONAL_PHRASES = [
    /check out/i,
    /you should try/i,
    /highly recommend/i,
    /game.?changer/i,
    /i built .+ to (solve|fix|help)/i,
    /!{2,}/
];
function flagsAsPromotional(draftText) {
    return exports.PROMOTIONAL_PHRASES.some(pattern => pattern.test(draftText));
}
const DISCLOSURES = [
    "(disclosure: I built this)",
    "(I'm biased, I made the thing)",
    "(full disclosure, this is my product)",
    "(I run this product btw)",
    "(disclaimer: I'm the founder)"
];
exports.DISCLOSURE_PATTERNS = [
    /founder/i,
    /disclosure/i,
    /disclos\w+/i,
    /i'?m biased/i,
    /i (built|made|created) (this|it|the)/i,
    /full disclosure/i,
    /i work on/i,
    /my (own )?product/i,
];
function hasDisclosure(draftText) {
    return exports.DISCLOSURE_PATTERNS.some(pattern => pattern.test(draftText));
}
async function draftReply(post, userProfile, intentScore) {
    if (process.env.USE_MOCK_DRAFTS === 'true') {
        const mockDraft = getMockDraft(post, userProfile);
        return {
            text: mockDraft,
            mentionedProduct: true,
            flagged: flagsAsPromotional(mockDraft),
            hasDisclosure: hasDisclosure(mockDraft)
        };
    }
    const systemPrompt = `
You are drafting a reply to a real public post from someone with a genuine question or problem. You have relevant first-hand experience because you (or the business you're affiliated with) actually dealt with this. Your job is to be genuinely helpful first — the reply must stand entirely on its own as useful, specific advice.

Rules:
1. Lead with the actual substance of an answer — a specific insight, a concrete detail, a real trade-off — not a generic acknowledgment like "I went through this too."
2. Match the register and length of a real comment on this platform: conversational, imperfect, not corporate. Avoid marketing language entirely: no "game-changer," "check out," "you should try," "highly recommend," exclamation points used for enthusiasm, or leading with a product name.
3. You MUST mention the product (${userProfile.business_name}) in every reply, but it must NEVER sound like an advertisement or pitch.
4. The product mention must come after the real substance, framed as one detail among the advice rather than the point of the reply — e.g. "we ended up switching tools too, which helped" rather than "I built [Product] to solve this."
5. Disclose the affiliation naturally and briefly (a short parenthetical is fine) — but do not let the disclosure itself become a second promotional beat.
6. Never use a call-to-action. No "let me know if you want details," no "happy to share more" as a closer every time — sometimes just end the thought.
7. Include one small, specific, slightly imperfect detail (a timeframe, a specific frustration, an offhand aside) — specificity is what makes text read as human-written rather than generated; a reply with no concrete detail reads as generic regardless of tone.
8. Read the original post's actual tone and specific wording before drafting — mirror their register (casual vs. technical, frustrated vs. curious) rather than defaulting to one house tone for every reply.

The business context (for background):
Name: ${userProfile.business_name}
What it does: ${userProfile.business_description}
URL: ${userProfile.business_url}

Your writing style:
${userProfile.writing_style}

${userProfile.tone_examples ? `CRITICAL - TONE EXAMPLES TO MIMIC:
Please study these examples written by the user in the past. Your generated reply MUST perfectly match this vocabulary, cadence, and vibe:
${userProfile.tone_examples}
` : ''}
`;
    const randomDisclosure = DISCLOSURES[Math.floor(Math.random() * DISCLOSURES.length)];
    const productInstruction = `You MUST casually mention the product (${userProfile.business_name}). Use exactly this disclosure phrasing inline or at the end: ${randomDisclosure}`;
    const userPrompt = `
Write a reply to this post on ${post.platform}:
---
${post.text || '(no body)'}
---

INSTRUCTION FOR THIS SPECIFIC REPLY:
${productInstruction}

Write ONLY the reply text, nothing else.
`;
    let draftText = '';
    try {
        const anthropic = new sdk_1.default({ apiKey: process.env.ANTHROPIC_API_KEY });
        let response = await anthropic.messages.create({
            model: 'claude-3-5-sonnet-20241022',
            max_tokens: 1000,
            system: systemPrompt,
            messages: [{ role: 'user', content: userPrompt }]
        });
        if (response.content[0].type === 'text') {
            draftText = response.content[0].text;
        }
        if (flagsAsPromotional(draftText)) {
            // Regenerate once to remove promotional language
            response = await anthropic.messages.create({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 1000,
                system: systemPrompt,
                messages: [
                    { role: 'user', content: userPrompt },
                    { role: 'assistant', content: draftText },
                    { role: 'user', content: 'This draft sounds too promotional or templated. Rewrite it to completely remove marketing phrasing (like "check out", "game changer", etc.) and ensure it reads like a completely organic, helpful community comment.' }
                ]
            });
            if (response.content[0].type === 'text') {
                draftText = response.content[0].text;
            }
        }
    }
    catch (error) {
        console.warn('Claude failed, using Gemini', error);
        try {
            const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash-exp" });
            const combinedPrompt = `${systemPrompt}\n\n${userPrompt}`;
            const result = await model.generateContent(combinedPrompt);
            draftText = result.response.text();
        }
        catch (fallbackError) {
            console.error('Both Claude and Gemini failed to draft:', fallbackError);
            draftText = getMockDraft(post, userProfile);
        }
    }
    return {
        text: draftText,
        mentionedProduct: true,
        flagged: flagsAsPromotional(draftText),
        hasDisclosure: hasDisclosure(draftText)
    };
}
function getMockDraft(post, profile) {
    const randomDisclosure = DISCLOSURES[Math.floor(Math.random() * DISCLOSURES.length)];
    return `When we hit this scaling issue last year, we realized the core bottleneck wasn't the database, it was how we queued the async tasks. We ended up moving to a simple Redis list which dropped latency by half. 

We actually built ${profile.business_name} later on to automate exactly this kind of queue management, which helped us standardize it. Might be worth looking at your background workers first before optimizing queries. ${randomDisclosure}`;
}
