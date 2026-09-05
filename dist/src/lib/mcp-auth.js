"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.createMcpAccessToken = createMcpAccessToken;
exports.authenticateMcpToken = authenticateMcpToken;
require("server-only");
const node_crypto_1 = require("node:crypto");
const admin_1 = require("./admin");
const TOKEN_PREFIX = 'bwmcp_';
const TOKEN_PATTERN = /^bwmcp_[A-Za-z0-9_-]{43}$/;
function hashToken(token) {
    return (0, node_crypto_1.createHash)('sha256').update(token, 'utf8').digest('hex');
}
function createMcpAccessToken() {
    const token = `${TOKEN_PREFIX}${(0, node_crypto_1.randomBytes)(32).toString('base64url')}`;
    return {
        token,
        hash: hashToken(token),
        prefix: token.slice(0, 14),
    };
}
async function authenticateMcpToken(token) {
    if (!token || !TOKEN_PATTERN.test(token))
        return null;
    const admin = (0, admin_1.getServiceRoleClient)();
    const { data, error } = await admin
        .from('mcp_access_tokens')
        .select('id, user_id')
        .eq('token_hash', hashToken(token))
        .is('revoked_at', null)
        .maybeSingle();
    if (error || !data)
        return null;
    await admin
        .from('mcp_access_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('id', data.id)
        .is('revoked_at', null);
    return {
        tokenId: data.id,
        userId: data.user_id,
        clientId: `buyerwatch-user-${data.user_id}`,
    };
}
