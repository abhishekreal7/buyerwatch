"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BUYERWATCH_CONNECTOR_ID = void 0;
exports.sendBuyerWatchConnectorMessage = sendBuyerWatchConnectorMessage;
exports.connectRedditThroughChrome = connectRedditThroughChrome;
exports.BUYERWATCH_CONNECTOR_ID = 'akfjpaggkndebeidadabipjpkbchlhfe';
function runtime() {
    const candidate = globalThis.chrome?.runtime;
    return typeof candidate?.sendMessage === 'function' ? candidate : null;
}
function sendBuyerWatchConnectorMessage(message, timeoutMs = 20_000) {
    const chromeRuntime = runtime();
    if (!chromeRuntime)
        return Promise.resolve(null);
    return new Promise(resolve => {
        let settled = false;
        const finish = (value) => {
            if (settled)
                return;
            settled = true;
            clearTimeout(timer);
            resolve(value);
        };
        const timer = setTimeout(() => finish(null), timeoutMs);
        try {
            chromeRuntime.sendMessage(exports.BUYERWATCH_CONNECTOR_ID, message, response => {
                finish(chromeRuntime.lastError || !response ? null : response);
            });
        }
        catch {
            finish(null);
        }
    });
}
async function connectRedditThroughChrome() {
    return sendBuyerWatchConnectorMessage({ type: 'BUYERWATCH_CONNECT_REDDIT' });
}
