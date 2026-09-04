"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchWithTimeout = fetchWithTimeout;
exports.readResponseText = readResponseText;
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
/**
 * Read a fetch response without trusting Content-Length. The streaming limit
 * protects serverless memory even when a remote source omits or lies about the
 * declared response size.
 */
async function readResponseText(response, maxBytes = 256_000) {
    if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) {
        throw new Error('invalid_response_size_limit');
    }
    const declaredLength = Number(response.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        await response.body?.cancel().catch(() => undefined);
        throw new Error('response_too_large');
    }
    if (!response.body)
        return '';
    const reader = response.body.getReader();
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let received = 0;
    let text = '';
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            received += value.byteLength;
            if (received > maxBytes) {
                await reader.cancel().catch(() => undefined);
                throw new Error('response_too_large');
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        return text;
    }
    catch (error) {
        if (error instanceof Error && error.message === 'response_too_large')
            throw error;
        throw new Error('response_unreadable', { cause: error });
    }
    finally {
        reader.releaseLock();
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
