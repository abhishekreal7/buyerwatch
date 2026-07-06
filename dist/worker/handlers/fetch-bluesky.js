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
exports.blueskyFetchHandler = blueskyFetchHandler;
const logger_1 = require("../../src/lib/logger");
const bluesky_1 = require("../../src/lib/bluesky");
const queues_1 = require("../../src/lib/queues");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
async function blueskyFetchHandler(job) {
    const { target } = job.data; // e.g. "email marketing tool"
    try {
        const posts = await (0, bluesky_1.searchBlueskyPosts)(target);
        if (!posts || posts.length === 0)
            return;
        // Find all users watching this specific bluesky query
        const { data: keywordMappings, error } = await supabase_1.supabaseWorker
            .from('keywords')
            .select('id, user_id, term')
            .eq('platform', 'bluesky')
            .eq('target', target)
            .eq('is_active', true);
        if (error) {
            logger_1.logger.error({ error }, 'Supabase error fetching bluesky keywords:');
            return;
        }
        if (!keywordMappings || keywordMappings.length === 0)
            return;
        for (const post of posts) {
            const postText = `${post.text || ''}`.toLowerCase();
            for (const mapping of keywordMappings) {
                if (postText.includes(mapping.term.toLowerCase())) {
                    await queues_1.scorePostQueue.add('score', {
                        userId: mapping.user_id,
                        keywordId: mapping.id,
                        post,
                    }, {
                        jobId: `score-${mapping.user_id}-${post.externalId}`
                    });
                }
            }
        }
    }
    catch (error) {
        logger_1.logger.error({ error }, `Failed to fetch bluesky target: ${target}:`);
        throw error;
    }
}
