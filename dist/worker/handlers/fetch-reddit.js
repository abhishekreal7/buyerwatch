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
const logger_1 = require("../../src/lib/logger");
const reddit_1 = require("../../src/lib/reddit");
const queues_1 = require("../../src/lib/queues");
const buying_signal_filter_1 = require("../../src/lib/buying-signal-filter");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
async function redditFetchHandler(job) {
    const { target, keywordMappings: preloadedMappings } = job.data;
    if (process.env.REDDIT_API_APPROVED !== 'true') {
        logger_1.logger.info({ job: job.id, subreddit: target }, 'Reddit fetch running in mock mode — pending API approval');
    }
    try {
        const posts = await (0, reddit_1.fetchSubredditNew)(target);
        if (!posts || posts.length === 0)
            return;
        // Resolve keyword mappings (pre-supplied by fetch-now, or queried from DB)
        let keywordMappings = preloadedMappings;
        if (!keywordMappings) {
            const { data, error } = await supabase_1.supabaseWorker
                .from('keywords')
                .select('id, user_id, term')
                .eq('platform', 'reddit')
                .eq('target', target)
                .eq('is_active', true);
            if (error) {
                logger_1.logger.error({ error }, 'Supabase error fetching keywords:');
                return;
            }
            keywordMappings = data;
        }
        else if (keywordMappings.length > 0) {
            const ids = keywordMappings.map((m) => m.id);
            const { data: kwData } = await supabase_1.supabaseWorker
                .from('keywords')
                .select('id, user_id, term')
                .in('id', ids);
            if (kwData)
                keywordMappings = kwData;
        }
        if (!keywordMappings || keywordMappings.length === 0)
            return;
        // Group keywords by user — one user may have multiple keywords on the same subreddit.
        // We score each post once per user (not once per keyword) to avoid duplicate work.
        // The keyword chosen is whichever of the user's terms appears in the post; if none
        // match textually we still score because the subreddit subscription itself implies intent.
        const userKeywords = new Map();
        for (const m of keywordMappings) {
            if (!userKeywords.has(m.user_id))
                userKeywords.set(m.user_id, []);
            userKeywords.get(m.user_id).push({ id: m.id, term: m.term });
        }
        let skipped = 0;
        let enqueued = 0;
        for (const post of posts) {
            const searchable = `${post.title || ''} ${post.text || ''}`.toLowerCase();
            for (const [userId, keywords] of userKeywords) {
                // Determine if this post has explicit keyword match in title+body
                const matched = keywords.find(k => searchable.includes(k.term.toLowerCase()));
                const keywordId = (matched ?? keywords[0]).id;
                // Gate: keyword match always passes. No keyword match requires a buying signal.
                // This eliminates ~60-70% of noise before any Gemini call.
                if (!matched && !(0, buying_signal_filter_1.hasBuyingSignal)(searchable)) {
                    skipped++;
                    continue;
                }
                // Deduplicate: one score job per user per post, regardless of keyword count
                await queues_1.scorePostQueue.add('score', {
                    userId,
                    keywordId,
                    post,
                }, {
                    jobId: `score-${userId}-${post.externalId}`,
                });
                enqueued++;
            }
        }
        logger_1.logger.info({ subreddit: target, posts: posts.length, enqueued, skipped, users: userKeywords.size }, `r/${target}: ${enqueued} enqueued, ${skipped} skipped (no buying signal)`);
    }
    catch (error) {
        logger_1.logger.error({ error }, `Failed to fetch reddit target r/${target}:`);
        throw error;
    }
}
