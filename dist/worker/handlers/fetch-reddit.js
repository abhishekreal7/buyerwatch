"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.redditFetchHandler = redditFetchHandler;
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
const logger_1 = require("../../src/lib/logger");
const queues_1 = require("../../src/lib/queues");
const reddit_candidates_1 = require("../../src/lib/reddit-candidates");
const reddit_1 = require("../../src/lib/reddit");
const reddit_discovery_capacity_1 = require("../../src/lib/reddit-discovery-capacity");
const keyword_poll_health_1 = require("../../src/lib/keyword-poll-health");
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
async function redditFetchHandler(job) {
    const { target, keywordMappings: preloadedMappings } = job.data;
    let keywordMappings = preloadedMappings;
    let keywordIds = preloadedMappings?.map(({ id }) => id) ?? [];
    let sourceFetchRecorded = false;
    try {
        if (!keywordMappings) {
            const { data, error } = await supabase_1.supabaseWorker
                .from('keywords')
                .select('id, user_id, term, profiles!inner(competitors)')
                .eq('platform', 'reddit')
                .eq('target', target)
                .eq('is_active', true);
            if (error) {
                throw new Error(`Failed to load Reddit keyword mappings: ${error.message}`);
            }
            keywordMappings = (0, reddit_candidates_1.withProfileCompetitors)(data ?? []);
        }
        else if (keywordMappings.length > 0) {
            const ids = keywordMappings.map(({ id }) => id);
            const { data, error } = await supabase_1.supabaseWorker
                .from('keywords')
                .select('id, user_id, term, profiles!inner(competitors)')
                .in('id', ids);
            if (error) {
                throw new Error(`Failed to validate Reddit keyword mappings: ${error.message}`);
            }
            keywordMappings = (0, reddit_candidates_1.withProfileCompetitors)(data ?? []);
        }
        if (keywordMappings.length === 0)
            return;
        keywordIds = keywordMappings.map(({ id }) => id);
        const capacity = await (0, reddit_discovery_capacity_1.getRedditDiscoveryCapacity)();
        const result = await (0, reddit_1.fetchSubredditNewWithSource)(target, 25, { mode: capacity.mode });
        const posts = result.posts;
        await (0, keyword_poll_health_1.recordKeywordPollSuccess)(keywordIds, new Date(), result.source === 'rss' ? 'reddit_rss' : undefined);
        sourceFetchRecorded = true;
        if (!posts || posts.length === 0) {
            logger_1.logger.info({ subreddit: target }, `r/${target}: source checked; no posts returned`);
            return;
        }
        const discovery = (0, reddit_candidates_1.buildRedditScoreCandidates)(posts, keywordMappings);
        for (const candidate of discovery.candidates) {
            await queues_1.scorePostQueue.add('score', candidate, {
                jobId: `score-${candidate.userId}-${candidate.post.externalId}`,
            });
        }
        logger_1.logger.info({
            subreddit: target,
            posts: posts.length,
            enqueued: discovery.candidates.length,
            skipped: discovery.skipped,
            users: discovery.users,
        }, `r/${target}: ${discovery.candidates.length} enqueued, ${discovery.skipped} skipped`);
    }
    catch (error) {
        if (!sourceFetchRecorded) {
            await (0, keyword_poll_health_1.recordKeywordPollFailure)(keywordIds, error).catch((healthError) => {
                logger_1.logger.error({ healthError, target }, 'Failed to record Reddit keyword poll failure');
            });
        }
        logger_1.logger.error({ error }, `Failed to fetch reddit target r/${target}`);
        throw error;
    }
}
