"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.RequestInputError = void 0;
exports.readJsonBody = readJsonBody;
exports.readTextBody = readTextBody;
exports.isUuid = isUuid;
exports.boundedString = boundedString;
class RequestInputError extends Error {
    constructor(message = 'invalid_request') {
        super(message);
        this.name = 'RequestInputError';
    }
}
exports.RequestInputError = RequestInputError;
async function readJsonBody(request, maxBytes = 16_384) {
    const text = await readTextBody(request, maxBytes);
    if (!text.trim())
        return {};
    try {
        const value = JSON.parse(text);
        if (!value || typeof value !== 'object' || Array.isArray(value)) {
            throw new RequestInputError();
        }
        return value;
    }
    catch (error) {
        if (error instanceof RequestInputError)
            throw error;
        throw new RequestInputError('invalid_json');
    }
}
async function readTextBody(request, maxBytes = 256_000) {
    const declaredLength = Number(request.headers.get('content-length'));
    if (Number.isFinite(declaredLength) && declaredLength > maxBytes) {
        throw new RequestInputError('request_too_large');
    }
    if (!request.body)
        return '';
    const reader = request.body.getReader();
    const chunks = [];
    let total = 0;
    try {
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            total += value.byteLength;
            if (total > maxBytes) {
                await reader.cancel();
                throw new RequestInputError('request_too_large');
            }
            chunks.push(value);
        }
    }
    finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(total);
    let offset = 0;
    for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
    }
    try {
        return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    }
    catch {
        throw new RequestInputError('invalid_encoding');
    }
}
function isUuid(value) {
    return typeof value === 'string'
        && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function boundedString(value, maximum, options = {}) {
    if (typeof value !== 'string')
        return options.required ? null : '';
    const result = options.trim === false ? value : value.trim();
    if ((options.required && !result) || result.length > maximum)
        return null;
    return result;
}
