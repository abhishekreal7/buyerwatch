"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ensureAttributionMapping = ensureAttributionMapping;
const attribution_1 = require("./attribution");
async function ensureAttributionMapping(supabase, input) {
    const destinationUrl = (0, attribution_1.buildAttributionDestinationUrl)(input.businessUrl, input.token);
    const { error } = await supabase.from('reply_attribution').upsert({
        user_id: input.userId,
        thread_id: input.threadId,
        attribution_token: input.token,
        shortcode: input.token,
        destination_url: destinationUrl,
    }, { onConflict: 'attribution_token' });
    if (error) {
        throw new Error(`Unable to persist reply attribution: ${error.message}`);
    }
}
