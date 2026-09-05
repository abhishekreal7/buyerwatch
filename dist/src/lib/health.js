"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkApplicationReadiness = checkApplicationReadiness;
const supabase_js_1 = require("@supabase/supabase-js");
const backend_maintenance_1 = require("./backend-maintenance");
const env_1 = require("./env");
const http_1 = require("./http");
const plan_limits_1 = require("./plan-limits");
const qstash_1 = require("./qstash");
const redis_1 = require("./redis");
const redditapis_client_1 = require("./redditapis-client");
const reddit_delivery_health_1 = require("./reddit-delivery-health");
const REDDIT_PROVIDER_HEALTH_KEY = 'health:redditapis:v1';
const REDDIT_PROVIDER_HEALTH_LOCK_KEY = 'lock:health:redditapis:v1';
const REDDIT_PROVIDER_HEALTH_TTL_SECONDS = 300;
class ReadinessError extends Error {
    code;
    affectedPlatforms;
    constructor(message, code, affectedPlatforms) {
        super(message);
        this.code = code;
        this.affectedPlatforms = affectedPlatforms;
        this.name = 'ReadinessError';
    }
}
async function timedCheck(label, operation) {
    const startedAt = Date.now();
    try {
        await (0, http_1.withTimeout)(operation(), 3_000, label);
        return { status: 'ok', latencyMs: Date.now() - startedAt };
    }
    catch (error) {
        const readinessError = error instanceof ReadinessError ? error : null;
        return {
            status: 'error',
            latencyMs: Date.now() - startedAt,
            ...(readinessError?.code ? { code: readinessError.code } : {}),
            ...(readinessError?.affectedPlatforms
                ? { affectedPlatforms: readinessError.affectedPlatforms }
                : {}),
            detail: process.env.NODE_ENV === 'production'
                ? `${label} failed`
                : error instanceof Error
                    ? error.message.slice(0, 160)
                    : `${label} failed`,
        };
    }
}
function parseProviderHealthSnapshot(value) {
    if (!value)
        return null;
    try {
        const parsed = JSON.parse(value);
        if ((parsed.status === 'ok' || parsed.status === 'error')
            && typeof parsed.checkedAt === 'string'
            && Number.isFinite(Date.parse(parsed.checkedAt))) {
            return { status: parsed.status, checkedAt: parsed.checkedAt };
        }
    }
    catch {
        // Ignore corrupt operational cache entries and perform a fresh check.
    }
    return null;
}
async function checkRedditProviderReadiness(required) {
    if (!(0, env_1.hasRedditPostingProvider)()) {
        return { status: 'ok', latencyMs: 0, detail: 'disabled' };
    }
    const provider = (0, env_1.getRedditPostingProviderKind)();
    if (provider === 'hyperbrowser') {
        const startedAt = Date.now();
        if (!required)
            return { status: 'ok', latencyMs: 0, detail: 'no active connections' };
        try {
            const snapshot = await (0, reddit_delivery_health_1.readHyperbrowserHealth)();
            const fresh = snapshot
                && Date.now() - Date.parse(snapshot.checkedAt) < reddit_delivery_health_1.HYPERBROWSER_HEALTH_MAX_AGE_MS;
            return {
                status: fresh && snapshot.status === 'ok' ? 'ok' : 'error',
                latencyMs: Date.now() - startedAt,
                ...(!fresh || snapshot?.status === 'error'
                    ? {
                        detail: 'reddit delivery canary unavailable',
                        ...(snapshot?.code ? { code: snapshot.code } : {}),
                    }
                    : {}),
            };
        }
        catch {
            return {
                status: 'error',
                latencyMs: Date.now() - startedAt,
                detail: 'reddit delivery health cache unavailable',
            };
        }
    }
    if (provider === 'sprinklr') {
        return { status: 'ok', latencyMs: 0, detail: 'configured' };
    }
    const startedAt = Date.now();
    let cached = null;
    try {
        cached = parseProviderHealthSnapshot(await redis_1.redis.get(REDDIT_PROVIDER_HEALTH_KEY));
    }
    catch {
        return {
            status: 'error',
            latencyMs: Date.now() - startedAt,
            detail: 'reddit provider health cache unavailable',
        };
    }
    if (cached && Date.now() - Date.parse(cached.checkedAt) < REDDIT_PROVIDER_HEALTH_TTL_SECONDS * 1_000) {
        return {
            status: cached.status,
            latencyMs: Date.now() - startedAt,
            ...(cached.status === 'error' ? { detail: 'reddit provider unavailable' } : {}),
        };
    }
    const checked = await (0, backend_maintenance_1.withRedisLock)(redis_1.redis, REDDIT_PROVIDER_HEALTH_LOCK_KEY, 10_000, async () => {
        let snapshot;
        try {
            const [account, budget] = await Promise.all([
                (0, redditapis_client_1.fetchRedditApisAccountStatus)(),
                (0, redditapis_client_1.getRedditApisDailyBudgetStatus)(),
            ]);
            snapshot = {
                status: account.creditsRemaining >= redditapis_client_1.REDDITAPIS_MINIMUM_OPERATIONAL_CREDITS
                    && budget.read.used < budget.read.limit
                    && budget.write.used < budget.write.limit
                    ? 'ok'
                    : 'error',
                checkedAt: new Date().toISOString(),
            };
        }
        catch {
            snapshot = { status: 'error', checkedAt: new Date().toISOString() };
        }
        await redis_1.redis.set(REDDIT_PROVIDER_HEALTH_KEY, JSON.stringify(snapshot), 'EX', snapshot.status === 'ok' ? REDDIT_PROVIDER_HEALTH_TTL_SECONDS : 60);
        return snapshot;
    });
    // Another instance owns the check. A recent stale value is safer than
    // stampeding the provider's free account endpoint; without one, report a
    // short-lived degraded state and let the next probe use the cached result.
    const snapshot = checked ?? cached;
    return {
        status: snapshot?.status ?? 'error',
        latencyMs: Date.now() - startedAt,
        ...(snapshot?.status === 'ok' ? {} : { detail: 'reddit provider unavailable' }),
    };
}
async function checkApplicationReadiness() {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    let redditProviderRequired = false;
    const database = await timedCheck('database readiness', async () => {
        if (!supabaseUrl || !serviceRoleKey)
            throw new Error('database configuration missing');
        const client = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const [profiles, threads, ingestion, spend, redditConnections, keywords, activeRedditConnections] = await Promise.all([
            client.from('profiles').select('id, signal_count, signal_month', { head: true }).limit(1),
            client
                .from('monitored_threads')
                .select('id, title, intent_label, score_reasoning, matched_signals, quality_issues, automation_reason', { head: true })
                .limit(1),
            client.from('ingestion_events').select('id, processed_at', { head: true }).limit(1),
            client.from('ai_spend_reservations').select('id, status', { head: true }).limit(1),
            client.from('reddit_connection_secrets').select('connection_id, status', { head: true }).limit(1),
            client
                .from('keywords')
                .select('id, last_checked_at, last_success_at, last_check_status, last_check_error, consecutive_failures, next_poll_at', { head: true })
                .limit(1),
            client
                .from('reddit_connection_secrets')
                .select('connection_id', { count: 'exact', head: true })
                .eq('status', 'active'),
        ]);
        if (profiles.error
            || threads.error
            || ingestion.error
            || spend.error
            || redditConnections.error
            || keywords.error
            || activeRedditConnections.error) {
            throw new Error('database schema is behind required migrations');
        }
        redditProviderRequired = (activeRedditConnections.count ?? 0) > 0;
    });
    const cache = await timedCheck('redis readiness', async () => {
        const result = await redis_1.redis.ping();
        if (result !== 'PONG')
            throw new Error('redis ping failed');
    });
    const monitoring = await timedCheck('monitoring readiness', async () => {
        if (!(0, qstash_1.hasQStashConfiguration)()) {
            throw new ReadinessError('QStash configuration missing', 'qstash_missing');
        }
        if (!supabaseUrl || !serviceRoleKey) {
            throw new ReadinessError('database configuration missing', 'database_missing');
        }
        const client = (0, supabase_js_1.createClient)(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });
        const keywordRows = [];
        const pageSize = 500;
        for (let offset = 0;; offset += pageSize) {
            const { data, error } = await client
                .from('keywords')
                .select('id, platform, last_success_at, last_check_status, consecutive_failures, profiles!inner(plan)')
                .in('platform', ['reddit', 'bluesky'])
                .eq('is_active', true)
                .order('id', { ascending: true })
                .range(offset, offset + pageSize - 1);
            if (error) {
                throw new ReadinessError('monitoring freshness query failed', 'monitoring_query_failed');
            }
            keywordRows.push(...(data ?? []));
            if ((data?.length ?? 0) < pageSize)
                break;
        }
        const now = Date.now();
        const staleKeywords = [];
        for (const row of keywordRows) {
            const profile = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
            const lastPolledAt = Date.parse(row.last_success_at ?? '');
            const interval = plan_limits_1.PLAN_POLL_INTERVAL_MINUTES[(0, plan_limits_1.normalizePlan)(profile?.plan)];
            const staleAfterMs = (interval * 3 + 10) * 60_000;
            if (!Number.isFinite(lastPolledAt) || now - lastPolledAt > staleAfterMs) {
                staleKeywords.push(row);
            }
        }
        if (staleKeywords.length > 0) {
            const byPlatform = staleKeywords.reduce((counts, row) => {
                counts[row.platform] = (counts[row.platform] ?? 0) + 1;
                return counts;
            }, {});
            throw new ReadinessError(`monitoring heartbeat stale: ${JSON.stringify(byPlatform)}`, 'monitoring_stale', Object.keys(byPlatform).sort());
        }
    });
    const redditProvider = cache.status === 'ok'
        ? await checkRedditProviderReadiness(redditProviderRequired)
        : { status: 'error', latencyMs: 0, detail: 'cache unavailable' };
    return {
        ready: database.status === 'ok'
            && cache.status === 'ok'
            && monitoring.status === 'ok'
            && (!redditProviderRequired || redditProvider.status === 'ok'),
        checks: { database, cache, monitoring, redditProvider },
        redditProviderRequired,
    };
}
