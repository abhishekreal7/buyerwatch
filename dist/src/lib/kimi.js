"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getKimiClient = getKimiClient;
exports.generateKimiChat = generateKimiChat;
const openai_1 = __importDefault(require("openai"));
/**
 * Kimi API Client helper using Moonshot AI endpoint with kimi-k3 model
 */
function getKimiClient() {
    const apiKey = process.env.KIMI_API_KEY || process.env.MOONSHOT_API_KEY;
    if (!apiKey) {
        throw new Error('Missing KIMI_API_KEY or MOONSHOT_API_KEY in environment variables.');
    }
    const baseURL = process.env.KIMI_BASE_URL || 'https://api.moonshot.ai/v1';
    return new openai_1.default({
        apiKey,
        baseURL,
    });
}
/**
 * Generate a chat response using Kimi K3 (or specified Kimi model)
 */
async function generateKimiChat(options) {
    const kimi = getKimiClient();
    const model = options.model || process.env.KIMI_MODEL || 'kimi-k3';
    const completion = await kimi.chat.completions.create({
        model,
        messages: options.messages,
        temperature: options.temperature ?? 0.3,
        max_tokens: options.max_tokens,
    });
    return completion.choices[0]?.message?.content || '';
}
