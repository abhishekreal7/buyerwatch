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
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
async function redditFetchHandler(job) {
    const { target } = job.data; // e.g. "smallbusiness"
    if (process.env.REDDIT_API_APPROVED !== 'true') {
        logger_1.logger.info({ job: job.id, subreddit: job.data.target }, 'Reddit fetch running in mock mode — pending API approval');
    }
    else if (process.env.USE_MOCK_REDDIT === 'true') {
        logger_1.logger.info({ job: job.id, subreddit: job.data.target }, 'Reddit fetch running in mock mode (USE_MOCK_REDDIT=true)');
    }
    try {
        const posts = await (0, reddit_1.fetchSubredditNew)(target);
        if (!posts || posts.length === 0)
            return;
        // Find all users watching this specific subreddit
        // Note: in a massive app, you'd cache the mappings of target -> users in Redis
        const { data: keywordMappings, error } = await supabase_1.supabaseWorker
            .from('keywords')
            .select('id, user_id, term')
            .eq('platform', 'reddit')
            .eq('target', target)
            .eq('is_active', true); // assuming an active flag exists
        if (error) {
            logger_1.logger.error({ error }, 'Supabase error fetching keywords:');
            return;
        }
        if (!keywordMappings || keywordMappings.length === 0)
            return;
        // For every post, check against the terms of users watching this subreddit
        for (const post of posts) {
            // Very basic text search (case insensitive) for matching
            const postText = `${post.text || ''}`.toLowerCase();
            for (const mapping of keywordMappings) {
                if (postText.includes(mapping.term.toLowerCase())) {
                    // Push to score queue
                    await queues_1.scorePostQueue.add('score', {
                        userId: mapping.user_id,
                        keywordId: mapping.id,
                        post,
                    }, {
                        // Deduplicate: same user shouldn't score same post twice
                        jobId: `score-${mapping.user_id}-${post.externalId}`
                    });
                }
            }
        }
    }
    catch (error) {
        logger_1.logger.error({ error }, `Failed to fetch reddit target r/${target}:`);
        throw error; // BullMQ will retry based on config
    }
}
