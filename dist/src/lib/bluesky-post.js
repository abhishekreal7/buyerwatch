"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.postBlueskyReply = postBlueskyReply;
const api_1 = require("@atproto/api");
const supabase_js_1 = require("@supabase/supabase-js");
const encryption_1 = require("./encryption");
const reddit_post_1 = require("./reddit-post");
const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
async function getDecryptedBlueskyConnection(userId) {
    const { data, error } = await supabase
        .from('platform_connections')
        .select('access_token, external_username')
        .eq('user_id', userId)
        .eq('platform', 'bluesky')
        .single();
    if (error || !data || !data.access_token || !data.external_username) {
        throw new Error('Bluesky connection not found for user');
    }
    return {
        password: (0, encryption_1.decrypt)(data.access_token),
        identifier: data.external_username
    };
}
async function postBlueskyReply(userId, threadExternalId, text) {
    const { password, identifier } = await getDecryptedBlueskyConnection(userId);
    const agent = new api_1.BskyAgent({ service: 'https://bsky.social' });
    try {
        await agent.login({ identifier, password });
    }
    catch (e) {
        throw new reddit_post_1.PlatformPostError('bluesky', `Failed to login: ${e.message}`, false);
    }
    try {
        const threadResponse = await agent.getPostThread({ uri: threadExternalId, depth: 0 });
        const parentPost = threadResponse.data.thread.post;
        if (!parentPost) {
            throw new Error('Parent post not found');
        }
        const rootUri = parentPost.record?.reply?.root?.uri || parentPost.uri;
        const rootCid = parentPost.record?.reply?.root?.cid || parentPost.cid;
        const result = await agent.post({
            text,
            reply: {
                root: { uri: rootUri, cid: rootCid },
                parent: { uri: parentPost.uri, cid: parentPost.cid }
            }
        });
        const rkey = result.uri.split('/').pop();
        const did = result.uri.split('/')[3];
        return { permalink: `https://bsky.app/profile/${did}/post/${rkey}` };
    }
    catch (e) {
        const isRetryable = e.message.includes('Rate Limit') || e.message.includes('timeout');
        throw new reddit_post_1.PlatformPostError('bluesky', e.message, isRetryable);
    }
}
