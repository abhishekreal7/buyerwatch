"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MONITORING_RUN_LOCK_TTL_MS = exports.MONITORING_RUN_LOCK_KEY = void 0;
// The serverless QStash monitor and the always-on worker are intentionally
// redundant. They still need one shared lease so they never fetch and score
// the same monitoring window at the same time.
exports.MONITORING_RUN_LOCK_KEY = 'locks:monitoring-run';
exports.MONITORING_RUN_LOCK_TTL_MS = 300_000;
