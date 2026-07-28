"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.SUPPORT_EMAIL = void 0;
const configuredSupportEmail = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim();
exports.SUPPORT_EMAIL = configuredSupportEmail && configuredSupportEmail !== 'support@example.com'
    ? configuredSupportEmail
    : 'support@buyerwatch.co';
