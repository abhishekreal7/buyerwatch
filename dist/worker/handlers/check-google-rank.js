"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkGoogleRankHandler = checkGoogleRankHandler;
const logger_1 = require("../../src/lib/logger");
const supabase_1 = require("../lib/supabase");
const http_1 = require("../../src/lib/http");
/**
 * check-google-rank — Feature 5: Thread Consequence Score
 *
 * Checks if the Reddit thread URL appears on Google's first page.
 * Uses Google Custom Search JSON API if GOOGLE_CSE_API_KEY + GOOGLE_CSE_CX are set.
 * If not configured, the job is a no-op (graceful degradation).
 *
 * Result is stored as google_rank_position (1–10 = page 1, 0 = not found, null = unchecked).
 * Fires and forgets — never blocks the main scoring pipeline.
 */
let cseValidated = false;
/** Feature 4.1: Validates Google CSE is configured to search the entire web, warning loudly if 0 results return */
async function validateGoogleCseConfig(apiKey, cx) {
    if (cseValidated)
        return;
    try {
        const testQuery = encodeURIComponent('site:reddit.com software');
        const res = await (0, http_1.fetchWithTimeout)(`https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${testQuery}&num=3`, {}, 10_000);
        if (res.ok) {
            const data = await res.json();
            if (!data.items || data.items.length === 0) {
                logger_1.logger.warn('⚠️ [GoogleRank WARNING] Google CSE returned 0 results for a known query. ' +
                    'Ensure "Search the entire web" is ENABLED in your Google Programmable Search Engine control panel.');
            }
            else {
                logger_1.logger.info('✅ [GoogleRank] Google CSE config verified (searches open web).');
                cseValidated = true;
            }
        }
    }
    catch {
        // Non-blocking diagnostic check
    }
}
async function checkGoogleRankHandler(job) {
    const { threadId, url, matchedKeyword } = job.data;
    const apiKey = process.env.GOOGLE_CSE_API_KEY;
    const cx = process.env.GOOGLE_CSE_CX;
    // Gracefully degrade if Google CSE not configured
    if (!apiKey || !cx) {
        logger_1.logger.debug({ threadId }, '[GoogleRank] CSE not configured, skipping rank check');
        return;
    }
    // Feature 4.1 Startup Check
    await validateGoogleCseConfig(apiKey, cx);
    try {
        // Feature 5 Organic Fix: Search for the matched keyword on Reddit specifically
        const searchQuery = matchedKeyword ? `"${matchedKeyword}" site:reddit.com` : `site:reddit.com ${url}`;
        const query = encodeURIComponent(searchQuery);
        const endpoint = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${query}&num=10`;
        const response = await (0, http_1.fetchWithTimeout)(endpoint, {}, 10_000);
        if (!response.ok) {
            logger_1.logger.warn({ threadId, status: response.status }, '[GoogleRank] CSE API returned non-OK status');
            throw new Error(`Google CSE returned HTTP ${response.status}`);
        }
        const data = await response.json();
        if (data.error) {
            logger_1.logger.warn({ threadId, error: data.error.message }, '[GoogleRank] CSE API error');
            throw new Error(`Google CSE error: ${data.error.message}`);
        }
        let rankPosition = 0; // 0 = searched but not found on page 1
        if (data.items && data.items.length > 0) {
            const normalizedUrl = url.replace(/\/$/, '').toLowerCase();
            const foundIndex = data.items.findIndex((item) => item.link.replace(/\/$/, '').toLowerCase().includes(normalizedUrl) ||
                normalizedUrl.includes(item.link.replace(/\/$/, '').toLowerCase()));
            if (foundIndex !== -1) {
                rankPosition = foundIndex + 1; // 1-indexed position
            }
        }
        // Persist the result
        const { error } = await supabase_1.supabaseWorker
            .from('monitored_threads')
            .update({
            google_rank_position: rankPosition,
            ranked_keyword: rankPosition > 0 ? (matchedKeyword || null) : null
        })
            .eq('id', threadId);
        if (error) {
            throw new Error(`Failed to update rank position: ${error.message}`);
        }
        else {
            logger_1.logger.info({ threadId, rankPosition }, `[GoogleRank] Rank stored: position=${rankPosition}`);
        }
    }
    catch (err) {
        logger_1.logger.warn({ err, threadId }, '[GoogleRank] Rank check failed');
        throw err;
    }
}
