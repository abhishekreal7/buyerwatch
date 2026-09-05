"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.createAnthropicClient = createAnthropicClient;
const sdk_1 = __importDefault(require("@anthropic-ai/sdk"));
const env_1 = require("./env");
function createAnthropicClient(options = {}) {
    const apiKey = (0, env_1.getConfiguredSecret)(process.env.ANTHROPIC_API_KEY);
    if (!apiKey) {
        throw new Error('ANTHROPIC_API_KEY is not configured');
    }
    const baseURL = (0, env_1.getConfiguredSecret)(process.env.ANTHROPIC_API_BASE_URL);
    return new sdk_1.default({
        apiKey,
        ...(baseURL ? { baseURL } : {}),
        timeout: 30_000,
        maxRetries: options.maxRetries ?? 2,
    });
}
