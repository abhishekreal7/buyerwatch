"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPrivateOrReservedIp = isPrivateOrReservedIp;
exports.isAllowedSlackWebhookUrl = isAllowedSlackWebhookUrl;
exports.getSafeHttpUrl = getSafeHttpUrl;
exports.assertPublicHttpUrl = assertPublicHttpUrl;
exports.fetchPublicText = fetchPublicText;
const promises_1 = require("node:dns/promises");
const node_net_1 = require("node:net");
const undici_1 = require("undici");
const BLOCKED_HOSTNAMES = new Set([
    'localhost',
    'localhost.localdomain',
    'metadata',
    'metadata.google.internal',
]);
function isPrivateIpv4(address) {
    const parts = address.split('.').map(Number);
    if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
        return true;
    }
    const [a, b] = parts;
    return (a === 0 ||
        a === 10 ||
        a === 127 ||
        (a === 100 && b >= 64 && b <= 127) ||
        (a === 169 && b === 254) ||
        (a === 172 && b >= 16 && b <= 31) ||
        (a === 192 && b === 0) ||
        (a === 192 && b === 168) ||
        (a === 198 && (b === 18 || b === 19)) ||
        (a === 198 && b === 51) ||
        (a === 203 && b === 0) ||
        a >= 224);
}
function isPrivateIpv6(address) {
    const normalized = address.toLowerCase().split('%')[0];
    if (normalized === '::' || normalized === '::1')
        return true;
    if (normalized.startsWith('fc') || normalized.startsWith('fd'))
        return true;
    if (/^fe[89abcdef]/.test(normalized))
        return true;
    if (normalized.startsWith('ff'))
        return true;
    if (normalized.startsWith('2001:db8:'))
        return true;
    const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped)
        return isPrivateIpv4(mapped[1]);
    const mappedHex = normalized.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
    if (mappedHex) {
        const high = Number.parseInt(mappedHex[1], 16);
        const low = Number.parseInt(mappedHex[2], 16);
        return isPrivateIpv4(`${high >> 8}.${high & 255}.${low >> 8}.${low & 255}`);
    }
    return false;
}
function isPrivateOrReservedIp(address) {
    const version = (0, node_net_1.isIP)(address);
    if (version === 4)
        return isPrivateIpv4(address);
    if (version === 6)
        return isPrivateIpv6(address);
    return true;
}
function isAllowedSlackWebhookUrl(value) {
    try {
        const url = new URL(value);
        const allowedHost = url.hostname === 'hooks.slack.com' ||
            url.hostname === 'hooks.slack-gov.com';
        return (url.protocol === 'https:' &&
            allowedHost &&
            url.username === '' &&
            url.password === '' &&
            /^\/services\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+\/[A-Za-z0-9_-]+$/.test(url.pathname));
    }
    catch {
        return false;
    }
}
function getSafeHttpUrl(value) {
    try {
        const url = new URL(value);
        return ['http:', 'https:'].includes(url.protocol) && !url.username && !url.password
            ? url
            : null;
    }
    catch {
        return null;
    }
}
async function resolvePublicHttpUrl(value) {
    let url;
    try {
        url = new URL(value);
    }
    catch {
        throw new Error('Invalid URL');
    }
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
        throw new Error('Only unauthenticated HTTP(S) URLs are allowed');
    }
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '');
    if (BLOCKED_HOSTNAMES.has(hostname) || hostname.endsWith('.localhost')) {
        throw new Error('Private network destinations are not allowed');
    }
    if ((0, node_net_1.isIP)(hostname)) {
        if (isPrivateOrReservedIp(hostname)) {
            throw new Error('Private network destinations are not allowed');
        }
        return { url, address: hostname, family: (0, node_net_1.isIP)(hostname) };
    }
    const addresses = await (0, promises_1.lookup)(hostname, { all: true, verbatim: true });
    if (addresses.length === 0 || addresses.some(({ address }) => isPrivateOrReservedIp(address))) {
        throw new Error('Private network destinations are not allowed');
    }
    const selected = addresses[0];
    return { url, address: selected.address, family: selected.family };
}
async function assertPublicHttpUrl(value) {
    return (await resolvePublicHttpUrl(value)).url;
}
async function fetchPublicText(input, options = {}) {
    const timeoutMs = options.timeoutMs ?? 8_000;
    const maxBytes = options.maxBytes ?? 200_000;
    const maxRedirects = options.maxRedirects ?? 3;
    let target = await resolvePublicHttpUrl(input);
    for (let redirectCount = 0; redirectCount <= maxRedirects; redirectCount += 1) {
        // Pin the connection to the address that passed validation. This closes the
        // DNS-rebinding window between validation and connection establishment.
        const dispatcher = new undici_1.Agent({
            connect: {
                lookup: (_hostname, _options, callback) => {
                    callback(null, target.address, target.family);
                },
            },
        });
        let response;
        try {
            response = await fetch(target.url, {
                headers: options.headers,
                redirect: 'manual',
                signal: AbortSignal.timeout(timeoutMs),
                dispatcher,
            });
        }
        catch (error) {
            await dispatcher.close();
            throw error;
        }
        if (response.status >= 300 && response.status < 400) {
            const location = response.headers.get('location');
            if (!location || redirectCount === maxRedirects) {
                await response.body?.cancel();
                await dispatcher.close();
                throw new Error('Too many or invalid redirects');
            }
            await response.body?.cancel();
            await dispatcher.close();
            target = await resolvePublicHttpUrl(new URL(location, target.url).toString());
            continue;
        }
        const declaredLength = Number(response.headers.get('content-length') ?? 0);
        if (declaredLength > maxBytes) {
            await response.body?.cancel();
            await dispatcher.close();
            throw new Error('Response is too large');
        }
        if (!response.body) {
            await dispatcher.close();
            return { response, text: '', finalUrl: target.url };
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let received = 0;
        let text = '';
        while (true) {
            const { done, value } = await reader.read();
            if (done)
                break;
            received += value.byteLength;
            if (received > maxBytes) {
                await reader.cancel();
                await dispatcher.close();
                throw new Error('Response is too large');
            }
            text += decoder.decode(value, { stream: true });
        }
        text += decoder.decode();
        await dispatcher.close();
        return { response, text, finalUrl: target.url };
    }
    throw new Error('Unable to fetch URL');
}
