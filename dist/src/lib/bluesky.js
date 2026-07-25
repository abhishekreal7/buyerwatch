"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.searchBlueskyPosts = searchBlueskyPosts;
const env_1 = require("./env");
const http_1 = require("./http");
let agent = null;
async function getBlueskyAgent() {
    if (agent)
        return agent;
    const { BskyAgent } = await import('@atproto/api');
    agent = new BskyAgent({
        service: 'https://bsky.social',
        fetch: (0, http_1.createTimeoutFetch)(15_000),
    });
    const handle = process.env.BLUESKY_HANDLE;
    const password = process.env.BLUESKY_APP_PASSWORD;
    if (!handle || !password) {
        throw new Error('Bluesky credentials missing');
    }
    await agent.login({ identifier: handle, password });
    return agent;
}
async function searchBlueskyPosts(query, limit = 25) {
    if ((0, env_1.isDevelopmentMockEnabled)('USE_MOCK_BLUESKY')) {
        return [
            {
                platform: 'bluesky',
                externalId: `mock-bsky-${Date.now()}`,
                author: 'mock_user.bsky.social',
                text: `This is a mock Bluesky post matching query: ${query}`,
                url: 'https://bsky.app/profile/mock_user.bsky.social/post/mock_post',
                createdAt: new Date().toISOString(),
                sourceTarget: query
            }
        ];
    }
    const bskyAgent = await getBlueskyAgent();
    const response = await bskyAgent.app.bsky.feed.searchPosts({
        q: query,
        limit,
        sort: 'latest'
    });
    if (!response.success) {
        throw new Error(`Bluesky search failed for query: ${query}`);
    }
    const posts = response.data.posts || [];
    return posts.map((post) => {
        // Constructing the URL manually since the API doesn't return a direct web URL
        const uriParts = post.uri.split('/');
        const postId = uriParts[uriParts.length - 1];
        const authorHandle = post.author.handle;
        const url = `https://bsky.app/profile/${authorHandle}/post/${postId}`;
        return {
            platform: 'bluesky',
            externalId: post.uri, // URI serves as unique identifier in AT Protocol
            author: authorHandle,
            text: post.record?.text || '',
            url,
            createdAt: post.record?.createdAt || new Date().toISOString(),
            sourceTarget: query
        };
    });
}
