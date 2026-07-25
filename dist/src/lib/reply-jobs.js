"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getSendReplyJobId = getSendReplyJobId;
function getSendReplyJobId(threadId) {
    return `send-reply-${threadId}`;
}
