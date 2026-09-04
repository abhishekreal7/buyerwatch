"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchAllByKey = fetchAllByKey;
exports.fetchAllPages = fetchAllPages;
async function fetchAllByKey(fetchPage, getKey, pageSize = 500) {
    const rows = [];
    let afterKey = null;
    for (;;) {
        const result = await fetchPage(afterKey, pageSize);
        if (result.error)
            return { data: null, error: result.error };
        const page = result.data ?? [];
        rows.push(...page);
        if (page.length < pageSize)
            return { data: rows, error: null };
        const nextKey = getKey(page[page.length - 1]);
        if (!nextKey || nextKey === afterKey) {
            return {
                data: null,
                error: { message: 'Pagination cursor did not advance', code: 'pagination_cursor_stalled' },
            };
        }
        afterKey = nextKey;
    }
}
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
