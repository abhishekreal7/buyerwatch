"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.scoreIntent = scoreIntent;
const generative_ai_1 = require("@google/generative-ai");
async function scoreIntent(post, userProfile) {
    if (process.env.USE_MOCK_DRAFTS === 'true') {
        return {
            score: Math.floor(Math.random() * 100),
            label: 'buying',
            reasoning: 'Mock mode reasoning.',
            flag: userProfile?.competitors?.length > 0 && Math.random() > 0.8 ? 'COMPETITOR_RISK' : undefined
        };
    }
    const competitorsContext = userProfile.competitors?.length > 0
        ? `\nCOMPETITOR WATCHLIST: ${userProfile.competitors.join(', ')}\nIf the user is complaining about or seeking an alternative to any of these competitors, heavily flag this opportunity.`
        : '';
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
`;
    try {
        let responseText = '';
        if (process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY) {
            try {
                const { generateKimiChat } = await import('./kimi.js');
                responseText = await generateKimiChat({
                    messages: [{ role: 'user', content: prompt }],
                    temperature: 0.1,
                });
            }
            catch (kimiErr) {
                console.warn('Kimi API failed, falling back to Gemini...', kimiErr);
                const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
                const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
                const result = await model.generateContent(prompt);
                responseText = result.response.text();
            }
        }
        else {
            const genAI = new generative_ai_1.GoogleGenerativeAI(process.env.GEMINI_API_KEY);
            const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });
            const result = await model.generateContent(prompt);
            responseText = result.response.text();
        }
        // Strip possible markdown formatting if the model still adds it
        const cleanJson = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        return JSON.parse(cleanJson);
    }
    catch (error) {
        console.error('Scoring failed:', error);
        return {
            score: 0,
            label: 'other',
            reasoning: 'Error during scoring.'
        };
    }
}
