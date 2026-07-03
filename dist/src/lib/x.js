"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchXPosts = fetchXPosts;
const twitter_api_v2_1 = require("twitter-api-v2");
// Instantiate client if environment variables are available (allows the app to build without them)
const client = (process.env.X_API_KEY && process.env.X_API_SECRET) ? new twitter_api_v2_1.TwitterApi({
    appKey: process.env.X_API_KEY,
    appSecret: process.env.X_API_SECRET,
    accessToken: process.env.X_ACCESS_TOKEN || '',
    accessSecret: process.env.X_ACCESS_SECRET || '',
}) : null;
async function fetchXPosts(query) {
    if (process.env.USE_MOCK_X === 'true') {
        return [
            {
                platform: 'x',
                externalId: `mock-x-${Date.now()}`,
                author: 'mock_x_user',
                text: 'Just testing the new search functionality on X.',
                url: 'https://x.com/i/status/mock',
                createdAt: new Date().toISOString(),
                sourceTarget: query,
            }
        ];
    }
    if (!client) {
        throw new Error('X API keys missing in environment');
    }
    const results = await client.v2.search(query, {
        max_results: 25,
        'tweet.fields': ['created_at', 'author_id', 'text'],
    });
    return (results.data.data || []).map(tweet => ({
        platform: 'x',
        externalId: tweet.id,
        author: tweet.author_id ?? 'unknown',
        text: tweet.text,
        url: `https://x.com/i/status/${tweet.id}`,
        createdAt: tweet.created_at ?? new Date().toISOString(),
        sourceTarget: query,
    }));
}
