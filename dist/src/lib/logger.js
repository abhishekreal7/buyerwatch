"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.logger = void 0;
const pino_1 = __importDefault(require("pino"));
const isDev = process.env.NODE_ENV !== 'production';
exports.logger = (0, pino_1.default)({
    level: process.env.LOG_LEVEL || 'info',
    redact: {
        paths: [
            'authorization',
            'cookie',
            'req.headers.authorization',
            'req.headers.cookie',
            'request.headers.authorization',
            'request.headers.cookie',
            '*.access_token',
            '*.refresh_token',
            '*.password',
            '*.totp_secret',
            '*.totpSecret',
            '*.session_ciphertext',
            '*.reddit_session',
            '*.loid',
            '*.token_v2',
            '*.csrf_token',
            '*.slack_webhook_url',
            '*.webhook_secret',
            '*.email',
            '*.userId',
            '*.target',
            'access_token',
            'refresh_token',
            'password',
            'totp_secret',
            'totpSecret',
            'session_ciphertext',
            'reddit_session',
            'loid',
            'token_v2',
            'csrf_token',
            'slack_webhook_url',
            'slack_webhook_ciphertext',
            'webhook_secret',
            'email',
            'userId',
            'target',
        ],
        censor: '[REDACTED]',
    },
    transport: isDev ? {
        target: 'pino-pretty',
        options: {
            colorize: true,
            ignore: 'pid,hostname',
        }
    } : undefined,
    base: {
        env: process.env.NODE_ENV
    }
});
