"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isXDiscoveryConfigured = isXDiscoveryConfigured;
exports.fetchXPosts = fetchXPosts;
const http_1 = require("./http");
const env_1 = require("./env");
/** Discovery is app-only and never grants posting rights. */
function isXDiscoveryConfigured() {
    return process.env.ENABLE_X_DISCOVERY === 'true'
        && ((0, env_1.isDevelopmentMockEnabled)('USE_MOCK_X') || Boolean(process.env.X_BEARER_TOKEN));
}
async function fetchXPosts(query) {
    if ((0, env_1.isDevelopmentMockEnabled)('USE_MOCK_X')) {
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
    const bearer = process.env.X_BEARER_TOKEN;
    if (!bearer)
        throw new Error('x_discovery_not_configured');
    const params = new URLSearchParams({
        query, max_results: '25', 'tweet.fields': 'created_at,author_id,text', expansions: 'author_id', 'user.fields': 'username',
    });
    const response = await (0, http_1.fetchWithTimeout)(`https://api.x.com/2/tweets/search/recent?${params}`, {
        headers: { Authorization: `Bearer ${bearer}`, Accept: 'application/json' },
    }, 15_000);
    const raw = await (0, http_1.readResponseText)(response, 512_000);
    let results;
    try {
        results = JSON.parse(raw);
    }
    catch {
        throw new Error('x_search_invalid_response');
    }
    if (!response.ok)
        throw new Error(`x_search_${response.status}:${results.errors?.[0]?.detail || 'request_failed'}`);
    const usernames = new Map((results.includes?.users ?? []).map(user => [user.id, user.username || user.id]));
    return (results.data || []).map(tweet => ({
        platform: 'x',
        externalId: tweet.id,
        author: usernames.get(tweet.author_id || '') || tweet.author_id || 'unknown',
        text: tweet.text,
        url: `https://x.com/i/status/${tweet.id}`,
        createdAt: tweet.created_at ?? new Date().toISOString(),
        sourceTarget: query,
    }));
}
