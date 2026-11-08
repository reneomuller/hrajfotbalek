/**
 * Reading MORE than one PostgREST response holds (round 42, the admin
 * rebuild).
 *
 * PostgREST answers no request with more than `max_rows` rows — 1000 in
 * `supabase/config.toml` and on Supabase's hosted default — and says nothing
 * when it stops: the response is a normal 200 with fewer rows than exist. The
 * transactions export read every booking in one request and so ended,
 * silently, at the thousandth; its `in(id, …)` lookup of names did the same at
 * the thousandth player.
 *
 * PAGES UNTIL ONE COMES BACK EMPTY, stepping by what each page actually
 * returned. Stopping on a short page would assume the server's cap is this
 * file's page size; if `max_rows` is ever lower, every page is "short" and the
 * read stops after the first. One extra request per export is the price.
 */

/** What this file asks for per request; the server may send fewer. */
export const PAGE_SIZE = 1000;

/**
 * Ids per `in(…)` filter. A uuid is 36 characters and the filter travels in
 * the URL, so 200 of them is ~7.5 KB — under every proxy's URL ceiling, and
 * under `max_rows` for a one-row-per-id lookup.
 */
export const IN_LIST_SIZE = 200;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

/**
 * Every row of a query, page by page. `page(from, to)` must ORDER the rows by
 * something unique, or a row can move between pages while they are read.
 */
export async function readAllPages<T>(what: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (;;) {
    const { data, error } = await page(rows.length, rows.length + PAGE_SIZE - 1);
    if (error) throw new Error(`${what} read failed: ${error.message}`, { cause: error });
    if (!data || data.length === 0) return rows;
    rows.push(...data);
  }
}

/** `items` in runs of `size`, for `in(…)` filters that must stay short. */
export function chunk<T>(items: readonly T[], size: number = IN_LIST_SIZE): T[][] {
  const runs: T[][] = [];
  for (let i = 0; i < items.length; i += size) runs.push(items.slice(i, i + size));
  return runs;
}

/**
 * Every row for a long list of ids where each id may have MANY rows — runs of
 * ids, and every page of each run.
 */
export async function readAllByIds<T>(
  what: string,
  ids: readonly string[],
  page: (ids: string[], from: number, to: number) => Page<T>,
): Promise<T[]> {
  const runs = await Promise.all(
    chunk(ids).map((run) => readAllPages(what, (from, to) => page(run, from, to))),
  );
  return runs.flat();
}

/** Every row whose `ids` fall in the list, however long it is — one row per id. */
export async function readByIds<T>(
  what: string,
  ids: readonly string[],
  read: (ids: string[]) => Page<T>,
): Promise<T[]> {
  const runs = await Promise.all(
    chunk(ids).map(async (run) => {
      const { data, error } = await read(run);
      if (error) throw new Error(`${what} read failed: ${error.message}`, { cause: error });
      return data ?? [];
    }),
  );
  return runs.flat();
}
