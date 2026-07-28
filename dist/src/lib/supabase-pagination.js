"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllPages = fetchAllPages;
async function fetchAllPages(fetchPage, pageSize = 500) {
    const rows = [];
    for (let offset = 0;; offset += pageSize) {
        const result = await fetchPage(offset, offset + pageSize - 1);
        if (result.error)
            return { data: null, error: result.error };
        rows.push(...(result.data ?? []));
        if ((result.data?.length ?? 0) < pageSize) {
            return { data: rows, error: null };
        }
    }
}
