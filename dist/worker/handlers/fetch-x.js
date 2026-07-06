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
exports.xFetchHandler = xFetchHandler;
const logger_1 = require("../../src/lib/logger");
const x_1 = require("../../src/lib/x");
const queues_1 = require("../../src/lib/queues");
const plan_limits_1 = require("../../src/lib/plan-limits");
const dotenv = __importStar(require("dotenv"));
const path_1 = __importDefault(require("path"));
dotenv.config({ path: path_1.default.resolve(process.cwd(), '.env.local') });
const supabase_1 = require("../lib/supabase");
async function xFetchHandler(job) {
    const { target } = job.data;
    try {
        const posts = await (0, x_1.fetchXPosts)(target);
        if (!posts || posts.length === 0)
            return;
        // Find all users watching this specific X target
        const { data: keywordMappings, error } = await supabase_1.supabaseWorker
            .from('keywords')
            .select('id, user_id, term')
            .eq('platform', 'x')
            .eq('target', target)
            .eq('is_active', true);
        if (error) {
            logger_1.logger.error({ error }, 'Supabase error fetching keywords:');
            return;
        }
        if (!keywordMappings || keywordMappings.length === 0)
            return;
        for (const post of posts) {
            const postText = `${post.text || ''}`.toLowerCase();
            for (const mapping of keywordMappings) {
                if (postText.includes(mapping.term.toLowerCase())) {
                    // Check X spend budget BEFORE enqueueing scoring
                    const canAfford = await checkXSpendBudget(mapping.user_id);
                    if (!canAfford) {
                        logger_1.logger.info(`[Budget] User ${mapping.user_id} exceeded X spend limit. Skipping post.`);
                        continue;
                    }
                    // Push to score queue
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
        logger_1.logger.error({ error }, `Failed to fetch X target ${target}:`);
        throw error;
    }
}
async function checkXSpendBudget(userId) {
    const { data: profile } = await supabase_1.supabaseWorker
        .from('profiles')
        .select('plan')
        .eq('id', userId)
        .single();
    if (!profile)
        return false;
    const limit = plan_limits_1.X_DAILY_SPEND_LIMIT_CENTS[profile.plan] || 0;
    if (limit === 0)
        return false;
    // Cost per search in cents. Live value is ~5 cents depending on operation.
    const estimatedCostCents = parseInt(process.env.X_SEARCH_COST_CENTS || '5', 10);
    const { data, error } = await supabase_1.supabaseWorker.rpc('increment_x_spend_if_under_limit', {
        p_user_id: userId,
        p_cost_cents: estimatedCostCents,
        p_daily_limit_cents: limit,
    });
    if (error) {
        logger_1.logger.error({ error }, 'Error checking X spend budget:');
        return false;
    }
    return data;
}
