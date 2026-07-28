type QueryError = { message: string; code?: string }
type PageResult<T> = { data: T[] | null; error: QueryError | null }

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
