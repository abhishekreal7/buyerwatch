"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
exports.createTimeoutFetch = createTimeoutFetch;
exports.withTimeout = withTimeout;
async function fetchWithTimeout(input, init = {}, timeoutMs = 10_000) {
    const timeoutController = new AbortController();
    const timeout = setTimeout(() => timeoutController.abort(), timeoutMs);
    const forwardAbort = () => timeoutController.abort();
    init.signal?.addEventListener('abort', forwardAbort, { once: true });
    try {
        return await fetch(input, { ...init, signal: timeoutController.signal });
    }
    finally {
        clearTimeout(timeout);
        init.signal?.removeEventListener('abort', forwardAbort);
    }
}
function createTimeoutFetch(timeoutMs = 10_000) {
    return ((input, init) => fetchWithTimeout(input, init, timeoutMs));
}
async function withTimeout(operation, timeoutMs, label = 'operation') {
    let timeout;
    const deadline = new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`${label} timed out`)), timeoutMs);
    });
    try {
        return await Promise.race([operation, deadline]);
    }
    finally {
        if (timeout)
            clearTimeout(timeout);
    }
}
