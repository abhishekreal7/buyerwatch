"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectRedditThroughMcp = connectRedditThroughMcp;
exports.getMcpRedditConnection = getMcpRedditConnection;
exports.listMcpRedditReplies = listMcpRedditReplies;
exports.getMcpRedditReply = getMcpRedditReply;
exports.markMcpRedditReplyPosted = markMcpRedditReplyPosted;
require("server-only");
const admin_1 = require("./admin");
const automation_audit_1 = require("./automation-audit");
const redditapis_contract_1 = require("./redditapis-contract");
const reddit_session_1 = require("./reddit-session");
function analyticsRow(value) {
    if (Array.isArray(value))
        return value[0] ?? null;
    if (value && typeof value === 'object')
        return value;
    return null;
}
function finalDraft(value) {
    const analytics = analyticsRow(value);
    return String(analytics?.edited_text || analytics?.draft_text || '').trim();
}
function canonicalRedditProfile(profileUrl, username) {
    try {
        const url = new URL(profileUrl);
        const hostname = url.hostname.toLowerCase();
        const match = url.pathname.match(/^\/user\/([^/]+)\/?$/i);
        if (url.protocol !== 'https:'
            || !(hostname === 'reddit.com' || hostname === 'www.reddit.com')
            || !match
            || match[1].toLowerCase() !== username.toLowerCase())
            return null;
        return `https://www.reddit.com/user/${username}/`;
    }
    catch {
        return null;
    }
}
async function connectRedditThroughMcp(input) {
    const username = (0, redditapis_contract_1.normalizeRedditUsername)(input.username);
    const profileUrl = username ? canonicalRedditProfile(input.profileUrl, username) : null;
    if (!username || !profileUrl)
        throw new Error('reddit_identity_invalid');
    await (0, reddit_session_1.saveMcpAgentRedditConnection)({
        userId: input.userId,
        username,
        clientId: input.clientId,
    });
    return { username, profileUrl, provider: 'mcp_agent', status: 'active' };
}
async function getMcpRedditConnection(userId) {
    return (0, reddit_session_1.getRedditConnectionSummary)(userId);
}
async function listMcpRedditReplies(userId, limit) {
    const { data, error } = await (0, admin_1.getServiceRoleClient)()
        .from('monitored_threads')
        .select('id, title, text_content, url, author, intent_score, intent_label, status, created_at, reply_analytics(draft_text, edited_text)')
        .eq('user_id', userId)
        .eq('platform', 'reddit')
        .in('status', ['drafted', 'needs_manual_reply'])
        .order('created_at', { ascending: false })
        .limit(limit);
    if (error)
        throw new Error('reddit_reply_queue_unavailable');
    return (data ?? [])
        .map((thread) => ({
        threadId: thread.id,
        title: thread.title || null,
        postUrl: thread.url || null,
        author: thread.author || null,
        intentScore: thread.intent_score === null ? null : Number(thread.intent_score),
        intentLabel: thread.intent_label || null,
        status: thread.status,
        createdAt: thread.created_at,
        draft: finalDraft(thread.reply_analytics),
    }))
        .filter((thread) => thread.postUrl && thread.draft);
}
async function getMcpRedditReply(userId, threadId) {
    const { data, error } = await (0, admin_1.getServiceRoleClient)()
        .from('monitored_threads')
        .select('id, title, text_content, url, author, intent_score, intent_label, status, created_at, reply_analytics(draft_text, edited_text)')
        .eq('id', threadId)
        .eq('user_id', userId)
        .eq('platform', 'reddit')
        .maybeSingle();
    if (error)
        throw new Error('reddit_reply_unavailable');
    if (!data)
        return null;
    return {
        threadId: data.id,
        title: data.title || null,
        postText: data.text_content || null,
        postUrl: data.url || null,
        author: data.author || null,
        intentScore: data.intent_score === null ? null : Number(data.intent_score),
        intentLabel: data.intent_label || null,
        status: data.status,
        createdAt: data.created_at,
        draft: finalDraft(data.reply_analytics),
    };
}
async function markMcpRedditReplyPosted(input) {
    const admin = (0, admin_1.getServiceRoleClient)();
    const existing = await getMcpRedditReply(input.userId, input.threadId);
    if (!existing)
        throw new Error('reddit_reply_not_found');
    if (!['drafted', 'needs_manual_reply'].includes(existing.status)) {
        throw new Error('reddit_reply_not_sendable');
    }
    const { data, error } = await admin.rpc('mark_thread_mcp_replied_v1', {
        p_user_id: input.userId,
        p_thread_id: input.threadId,
        p_final_text: input.text,
        p_permalink: input.permalink || null,
    });
    if (error)
        throw new Error('reddit_reply_confirmation_failed');
    if (data !== true)
        throw new Error('reddit_reply_not_sendable');
    await (0, automation_audit_1.recordEngagementEvent)(admin, {
        userId: input.userId,
        threadId: input.threadId,
        eventType: 'reply_confirmed',
        platform: 'reddit',
        actorType: 'user',
        source: 'mcp_agent',
        metadata: { permalink: input.permalink || null },
        idempotencyKey: `${input.threadId}:reply-confirmed`,
    }).catch(() => undefined);
    return { success: true, threadId: input.threadId, status: 'replied' };
}
