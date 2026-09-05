type QueryError = { message: string; code?: string }
type PageResult<T> = { data: T[] | null; error: QueryError | null }

export async function fetchAllByKey<T>(
  fetchPage: (afterKey: string | null, limit: number) => PromiseLike<PageResult<T>>,
  getKey: (row: T) => string,
  pageSize = 500,
): Promise<PageResult<T>> {
  const rows: T[] = []
  let afterKey: string | null = null

  for (;;) {
    const result = await fetchPage(afterKey, pageSize)
    if (result.error) return { data: null, error: result.error }

    const page = result.data ?? []
    rows.push(...page)
    if (page.length < pageSize) return { data: rows, error: null }

    const nextKey = getKey(page[page.length - 1])
    if (!nextKey || nextKey === afterKey) {
      return {
        data: null,
        error: { message: 'Pagination cursor did not advance', code: 'pagination_cursor_stalled' },
      }
    }
    afterKey = nextKey
  }
}

export async function fetchAllPages<T>(
  fetchPage: (from: number, to: number) => PromiseLike<PageResult<T>>,
  pageSize = 500,
): Promise<PageResult<T>> {
  const rows: T[] = []
  for (let offset = 0; ; offset += pageSize) {
    const result = await fetchPage(offset, offset + pageSize - 1)
    if (result.error) return { data: null, error: result.error }
    rows.push(...(result.data ?? []))
    if ((result.data?.length ?? 0) < pageSize) {
      return { data: rows, error: null }
    }
  }
}
