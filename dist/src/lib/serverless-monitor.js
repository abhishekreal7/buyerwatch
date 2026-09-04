"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.runServerlessMonitoring = runServerlessMonitoring;
const supabase_js_1 = require("@supabase/supabase-js");
const env_1 = require("./env");
const logger_1 = require("./logger");
const plan_limits_1 = require("./plan-limits");
const redis_1 = require("./redis");
const reddit_candidates_1 = require("./reddit-candidates");
const bluesky_1 = require("./bluesky");
const x_1 = require("./x");
const reddit_1 = require("./reddit");
const reddit_discovery_capacity_1 = require("./reddit-discovery-capacity");
const backend_maintenance_1 = require("./backend-maintenance");
const monitoring_lock_1 = require("./monitoring-lock");
const score_lock_1 = require("./score-lock");
const score_post_1 = require("../../worker/handlers/score-post");
const reddit_post_1 = require("./reddit-post");
const keyword_poll_health_1 = require("./keyword-poll-health");
const content_freshness_1 = require("./content-freshness");
function positiveInteger(value, fallback, max) {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0)
        return fallback;
    return Math.min(parsed, max);
}
function profileFor(row) {
    return Array.isArray(row.profiles) ? row.profiles[0] : row.profiles;
}
function candidateKey(candidate) {
    return `${candidate.userId}\0${candidate.post.platform}\0${candidate.post.externalId}`;
}
async function reserveXCapacity(supabase, mappings) {
    const costCents = Number.parseInt(process.env.X_SEARCH_COST_CENTS || '5', 10);
    if (!Number.isInteger(costCents) || costCents < 1) {
        throw new Error('X_SEARCH_COST_CENTS must be a positive integer');
    }
    const allowedUsers = new Set();
    for (const userId of new Set(mappings.map(mapping => mapping.user_id))) {
        const { data: profile, error: profileError } = await supabase
            .from('profiles')
            .select('plan')
            .eq('id', userId)
            .single();
        if (profileError)
            throw new Error(`Unable to load X plan: ${profileError.message}`);
        const dailyLimit = (0, plan_limits_1.getPlanLimits)(profile?.plan).xDailySpendLimitCents;
        if (dailyLimit === 0)
            continue;
        const { data: reserved, error: reserveError } = await supabase.rpc('increment_x_spend_if_under_limit', { p_user_id: userId, p_cost_cents: costCents, p_daily_limit_cents: dailyLimit });
        if (reserveError)
            throw new Error(`Unable to reserve X capacity: ${reserveError.message}`);
        if (reserved)
            allowedUsers.add(userId);
    }
    return mappings.filter(mapping => allowedUsers.has(mapping.user_id));
}
async function loadDueSocialWork(now, forceUserId, forcePlatform, forceTarget) {
    const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const rows = [];
    const pageSize = 500;
    for (let offset = 0;; offset += pageSize) {
        const { data, error } = await supabase
            .from('keywords')
            .select('id, platform, target, term, user_id, last_success_at, next_poll_at, profiles!inner(plan, last_polled_at, competitors)')
            .in('platform', ['reddit', 'bluesky', 'x'])
            .eq('is_active', true)
            .order('id', { ascending: true })
            .range(offset, offset + pageSize - 1);
        if (error)
            throw error;
        rows.push(...(data ?? []));
        if ((data?.length ?? 0) < pageSize)
            break;
    }
    const forced = Boolean(forceUserId);
    const relevantRows = rows.filter((row) => (!forceUserId || row.user_id === forceUserId)
        && (!forcePlatform || row.platform === forcePlatform)
        && (0, plan_limits_1.canMonitorPlatform)((0, plan_limits_1.normalizePlan)(profileFor(row)?.plan), row.platform)
        && (row.platform !== 'x' || (0, x_1.isXDiscoveryConfigured)()));
    const dueUsers = new Set();
    const targets = new Map();
    for (const row of relevantRows) {
        const profile = profileFor(row);
        const nextPollAt = Date.parse(row.next_poll_at ?? '');
        if (!forced && Number.isFinite(nextPollAt) && nextPollAt > now.getTime())
            continue;
        if (!forced
            && !(0, plan_limits_1.isPollingDue)((0, plan_limits_1.normalizePlan)(profile?.plan), row.last_success_at, now.getTime())) {
            continue;
        }
        const target = row.platform === 'reddit'
            ? row.target.trim().toLowerCase()
            : row.target.trim();
        if (forceTarget && target !== forceTarget)
            continue;
        dueUsers.add(row.user_id);
        const key = `${row.platform}\0${target}`;
        const item = targets.get(key) ?? { platform: row.platform, target, mappings: [] };
        item.mappings.push({
            id: row.id,
            user_id: row.user_id,
            term: row.term,
            competitors: profile?.competitors ?? [],
        });
        targets.set(key, item);
    }
    return {
        work: [...targets.values()].sort((left, right) => `${left.platform}:${left.target}`.localeCompare(`${right.platform}:${right.target}`)),
        dueUsers,
    };
}
async function loadPendingSocialCheckpoints(forceUserId) {
    const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    let query = supabase
        .from('monitored_threads')
        .select('user_id, keyword_id, platform, external_id, author, title, text_content, url, source_created_at, created_at, keywords!inner(target)')
        .in('platform', ['reddit', 'bluesky', 'x'])
        .eq('status', 'pending')
        .gte('source_created_at', new Date(Date.now() - content_freshness_1.DISCOVERY_MAX_AGE_MS).toISOString())
        .order('created_at', { ascending: true })
        .limit(25);
    if (forceUserId)
        query = query.eq('user_id', forceUserId);
    const { data, error } = await query;
    if (error)
        throw error;
    return (data ?? []).map((row) => {
        const keyword = Array.isArray(row.keywords) ? row.keywords[0] : row.keywords;
        return {
            userId: row.user_id,
            keywordId: row.keyword_id,
            post: {
                platform: row.platform,
                externalId: row.external_id,
                author: row.author ?? '',
                title: row.title ?? undefined,
                text: row.text_content ?? '',
                url: row.url,
                createdAt: row.source_created_at || row.created_at,
                sourceTarget: keyword?.target ?? row.platform,
            },
        };
    });
}
async function removePersistedCandidates(candidates) {
    if (candidates.length === 0)
        return [];
    const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const externalIds = [...new Set(candidates.map(({ post }) => post.externalId))];
    const userIds = [...new Set(candidates.map(({ userId }) => userId))];
    const { data, error } = await supabase
        .from('monitored_threads')
        .select('user_id, platform, external_id, status')
        .in('platform', ['reddit', 'bluesky', 'x'])
        .in('external_id', externalIds)
        .in('user_id', userIds);
    if (error)
        throw error;
    const persisted = new Set((data ?? [])
        .filter((row) => row.status !== 'pending')
        .map((row) => `${row.user_id}\0${row.platform}\0${row.external_id}`));
    const unique = new Map();
    for (const candidate of candidates) {
        const key = candidateKey(candidate);
        if (!persisted.has(key) && !unique.has(key))
            unique.set(key, candidate);
    }
    return [...unique.values()];
}
async function persistPendingCandidates(candidates) {
    if (candidates.length === 0)
        return;
    const supabase = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error } = await supabase
        .from('monitored_threads')
        .upsert(candidates.map(({ userId, keywordId, post }) => ({
        user_id: userId,
        keyword_id: keywordId,
        platform: post.platform,
        external_id: post.externalId,
        author: post.author || null,
        title: post.title || null,
        text_content: post.text,
        url: post.url,
        source_created_at: post.createdAt,
        intent_score: null,
        intent_label: null,
        status: 'pending',
        score_reasoning: 'Awaiting analysis',
        automation_reason: 'analysis_pending',
    })), {
        onConflict: 'user_id,platform,external_id',
        ignoreDuplicates: true,
    });
    if (error)
        throw error;
}
async function runLockedMonitor(now, forceUserId, forcePlatform, forceTarget) {
    // Keep the serverless scheduler capable of recovering delivery work when
    // the always-on worker is unavailable.
    await (0, backend_maintenance_1.recoverStaleSends)(now);
    const maintenanceClient = (0, supabase_js_1.createClient)(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: staleCheckpointError } = await maintenanceClient.rpc('quarantine_stale_pending_threads_v1', { p_cutoff: new Date(now.getTime() - content_freshness_1.DISCOVERY_MAX_AGE_MS).toISOString() });
    if (staleCheckpointError) {
        throw new Error(`Unable to quarantine stale discovery checkpoints: ${staleCheckpointError.message}`);
    }
    const maxScores = positiveInteger(process.env.SERVERLESS_MONITOR_MAX_SCORES, (0, env_1.getConfiguredSecret)(process.env.ANTHROPIC_API_KEY) ? 1 : 5, 5);
    const maxTargets = positiveInteger(process.env.SERVERLESS_MONITOR_MAX_TARGETS, 50, 100);
    const [checkpoints, dueWork] = await Promise.all([
        loadPendingSocialCheckpoints(forceUserId),
        loadDueSocialWork(now, forceUserId, forcePlatform, forceTarget),
    ]);
    const { work: allWork } = dueWork;
    let work = allWork;
    if (!forceTarget && allWork.length > maxTargets) {
        const cursor = await redis_1.redis.incr('cursor:serverless-social-target');
        const start = ((cursor - 1) * maxTargets) % allWork.length;
        work = Array.from({ length: maxTargets }, (_, index) => allWork[(start + index) % allWork.length]);
    }
    const discovered = [];
    const completedWork = [];
    const failedWork = [];
    const redditCapacity = await (0, reddit_discovery_capacity_1.getRedditDiscoveryCapacity)();
    if (redditCapacity.mode === 'rss_only') {
        logger_1.logger.warn({
            reason: redditCapacity.reason,
            readBudget: redditCapacity.readBudget,
        }, 'Reddit discovery is using the RSS fallback; paid provider reads are paused safely');
    }
    for (let index = 0; index < work.length; index += 6) {
        const batch = work.slice(index, index + 6);
        const results = await Promise.allSettled(batch.map(async (target) => {
            if (target.platform === 'reddit') {
                const result = await (0, reddit_1.fetchSubredditNewWithSource)(target.target, 25, {
                    mode: redditCapacity.mode,
                });
                return {
                    candidates: (0, reddit_candidates_1.buildSocialScoreCandidates)(result.posts, target.mappings).candidates,
                    redditSource: result.source,
                };
            }
            if (target.platform === 'x') {
                const mappings = await reserveXCapacity(maintenanceClient, target.mappings);
                if (mappings.length === 0) {
                    return { candidates: [] };
                }
                const posts = await (0, x_1.fetchXPosts)(target.target);
                return {
                    candidates: (0, reddit_candidates_1.buildSocialScoreCandidates)(posts, mappings).candidates,
                };
            }
            const posts = await (0, bluesky_1.searchBlueskyPosts)(target.target, 25);
            return {
                candidates: (0, reddit_candidates_1.buildSocialScoreCandidates)(posts, target.mappings).candidates,
            };
        }));
        for (const [resultIndex, result] of results.entries()) {
            const target = batch[resultIndex];
            if (result.status === 'fulfilled') {
                completedWork.push({ ...target, redditSource: result.value.redditSource });
                discovered.push(...result.value.candidates);
            }
            else {
                failedWork.push({ target, error: result.reason });
                logger_1.logger.warn({
                    error: result.reason,
                    platform: target.platform,
                    target: target.target,
                }, 'Social target fetch failed; leaving it due for the next run');
            }
        }
    }
    if (work.length > 0 && completedWork.length === 0) {
        await Promise.all(failedWork.map(({ target, error }) => (0, keyword_poll_health_1.recordKeywordPollFailure)(target.mappings.map(({ id }) => id), error, now)));
        throw new Error('All due social target fetches failed');
    }
    await Promise.all([
        ...completedWork.map(target => (0, keyword_poll_health_1.recordKeywordPollSuccess)(target.mappings.map(({ id }) => id), now, target.redditSource === 'rss' ? 'reddit_rss' : undefined)),
        ...failedWork.map(({ target, error }) => (0, keyword_poll_health_1.recordKeywordPollFailure)(target.mappings.map(({ id }) => id), error, now)),
    ]);
    const discoveredCandidates = await removePersistedCandidates(discovered);
    discoveredCandidates.sort((left, right) => Date.parse(right.post.createdAt) - Date.parse(left.post.createdAt));
    // Save discovery before paid AI work. A timeout, provider failure, or spend
    // limit can then be recovered by the next scheduled invocation.
    await persistPendingCandidates(discoveredCandidates);
    const pendingByKey = new Map();
    for (const candidate of [...checkpoints, ...discoveredCandidates]) {
        const key = candidateKey(candidate);
        if (!pendingByKey.has(key))
            pendingByKey.set(key, candidate);
    }
    const pending = [...pendingByKey.values()];
    const selected = pending.slice(0, maxScores);
    const deferred = pending.slice(maxScores);
    let candidatesProcessed = 0;
    for (const candidate of selected) {
        const allowAutoSend = candidate.post.platform === 'bluesky'
            || (0, reddit_post_1.isRedditDirectPostingConfigured)();
        const processed = await (0, score_lock_1.withScoreLock)(candidate.userId, candidate.post.externalId, () => (0, score_post_1.processScorePost)(candidate, {
            allowAutoSend,
            enqueueFollowUpJobs: false,
            providerRetries: 0,
        }));
        if (processed === null) {
            deferred.push(candidate);
        }
        else {
            candidatesProcessed += 1;
            if (allowAutoSend)
                await (0, backend_maintenance_1.dispatchPendingOutbox)(10);
        }
    }
    // A successful feed fetch is the polling heartbeat. Candidate analysis has
    // its own durable pending checkpoints and must not force the same feed to be
    // fetched again while that backlog drains.
    const usersPolled = [...new Set(completedWork.flatMap(({ mappings }) => mappings.map(({ user_id }) => user_id)))];
    return {
        status: 'completed',
        targetsFetched: completedWork.length,
        checkpointsFound: checkpoints.length,
        candidatesFound: pending.length,
        candidatesProcessed,
        candidatesDeferred: deferred.length,
        usersPolled: usersPolled.length,
    };
}
async function runServerlessMonitoring(now = new Date(), options = {}) {
    const result = await (0, backend_maintenance_1.withRedisLock)(redis_1.redis, monitoring_lock_1.MONITORING_RUN_LOCK_KEY, monitoring_lock_1.MONITORING_RUN_LOCK_TTL_MS, () => runLockedMonitor(now, options.forceUserId, options.forcePlatform, options.forceTarget));
    if (result)
        return result;
    logger_1.logger.info('Serverless social monitor skipped because another run owns the lock');
    return {
        status: 'already_running',
        targetsFetched: 0,
        checkpointsFound: 0,
        candidatesFound: 0,
        candidatesProcessed: 0,
        candidatesDeferred: 0,
        usersPolled: 0,
    };
}
