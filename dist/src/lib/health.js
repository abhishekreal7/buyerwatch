"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkApplicationReadiness = checkApplicationReadiness;
const supabase_js_1 = require("@supabase/supabase-js");
const http_1 = require("./http");
const redis_1 = require("./redis");
async function timedCheck(label, operation) {
    const startedAt = Date.now();
    try {
        await (0, http_1.withTimeout)(operation(), 3_000, label);
        return { status: 'ok', latencyMs: Date.now() - startedAt };
    }
    catch (error) {
        return {
            status: 'error',
            latencyMs: Date.now() - startedAt,
            detail: process.env.NODE_ENV === 'production'
                ? `${label} failed`
                : error instanceof Error
                    ? error.message.slice(0, 160)
                    : `${label} failed`,
        };
    }
}
async function checkApplicationReadiness() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const database = await timedCheck('database readiness', async () => {
        if (!supabaseUrl || !serviceRoleKey)
            throw new Error('database configuration missing');
        const client = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const { error } = await client.from('profiles').select('id', { head: true, count: 'exact' }).limit(1);
        if (error)
            throw new Error('database query failed');
    });
    const cache = await timedCheck('redis readiness', async () => {
        const result = await redis_1.redis.ping();
        if (result !== 'PONG')
            throw new Error('redis ping failed');
    });
    return {
        ready: database.status === 'ok' && cache.status === 'ok',
        checks: { database, cache },
    };
}
