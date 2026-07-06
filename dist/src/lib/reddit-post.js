"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PlatformPostError = void 0;
exports.postRedditReply = postRedditReply;
const supabase_js_1 = require("@supabase/supabase-js");
const encryption_1 = require("./encryption");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
class PlatformPostError extends Error {
    platform;
    responseBody;
    retryable;
    constructor(platform, responseBody, retryable) {
        super(`Failed to post to ${platform}`);
        this.platform = platform;
        this.responseBody = responseBody;
        this.retryable = retryable;
        this.name = 'PlatformPostError';
    }
}
exports.PlatformPostError = PlatformPostError;
async function getDecryptedRedditConnection(userId) {
    const { data, error } = await supabase
        .from('platform_connections')
        .select('access_token, refresh_token')
        .eq('user_id', userId)
        .eq('platform', 'reddit')
        .single();
    if (error || !data || !data.access_token || !data.refresh_token) {
        throw new Error('Reddit connection not found for user');
    }
    return {
        accessToken: (0, encryption_1.decrypt)(data.access_token),
        refreshToken: (0, encryption_1.decrypt)(data.refresh_token)
    };
}
async function refreshRedditToken(userId, refreshToken) {
    const basicAuth = Buffer.from(`${process.env.REDDIT_OAUTH_CLIENT_ID}:${process.env.REDDIT_OAUTH_SECRET}`).toString('base64');
    const response = await fetch('https://www.reddit.com/api/v1/access_token', {
        method: 'POST',
        headers: {
            'Authorization': `Basic ${basicAuth}`,
            'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: refreshToken
        })
    });
    if (!response.ok) {
        throw new Error('Failed to refresh Reddit token');
    }
    const data = await response.json();
    const newAccessToken = data.access_token;
    const newRefreshToken = data.refresh_token || refreshToken;
    await supabase
        .from('platform_connections')
        .update({
        access_token: (0, encryption_1.encrypt)(newAccessToken),
        refresh_token: (0, encryption_1.encrypt)(newRefreshToken)
    })
        .eq('user_id', userId)
        .eq('platform', 'reddit');
    return newAccessToken;
}
async function postRedditReply(userId, threadExternalId, text) {
    let { accessToken, refreshToken } = await getDecryptedRedditConnection(userId);
    const tryPost = async (token) => {
        return await fetch('https://oauth.reddit.com/api/comment', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'User-Agent': process.env.REDDIT_USER_AGENT || 'ScoutoBot/1.0',
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                api_type: 'json',
                thing_id: threadExternalId,
                text
            })
        });
    };
    let response = await tryPost(accessToken);
    if (response.status === 401) {
        accessToken = await refreshRedditToken(userId, refreshToken);
        response = await tryPost(accessToken);
    }
    if (!response.ok) {
        const errorText = await response.text();
        const isRetryable = response.status === 429 || response.status >= 500;
        throw new PlatformPostError('reddit', errorText, isRetryable);
    }
    const data = await response.json();
    if (data?.json?.errors?.length > 0) {
        const errorStr = JSON.stringify(data.json.errors);
        const isRetryable = errorStr.includes('RATELIMIT');
        throw new PlatformPostError('reddit', errorStr, isRetryable);
    }
    const permalink = data?.json?.data?.things?.[0]?.data?.permalink;
    return { permalink: permalink ? `https://reddit.com${permalink}` : null };
}
