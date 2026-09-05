"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withScoreLock = withScoreLock;
const node_crypto_1 = require("node:crypto");
const backend_maintenance_1 = require("./backend-maintenance");
const redis_1 = require("./redis");
function scoreLockKey(userId, externalId) {
    const digest = (0, node_crypto_1.createHash)('sha256')
        .update(`${userId}\0${externalId}`)
        .digest('hex');
    return `locks:score:${digest}`;
}
function withScoreLock(userId, externalId, operation) {
    return (0, backend_maintenance_1.withRedisLock)(redis_1.redis, scoreLockKey(userId, externalId), 210_000, operation);
}
