"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isAuthorizedCronRequest = isAuthorizedCronRequest;
function isAuthorizedCronRequest(authorization, secret) {
    return Boolean(secret && authorization === `Bearer ${secret}`);
}
