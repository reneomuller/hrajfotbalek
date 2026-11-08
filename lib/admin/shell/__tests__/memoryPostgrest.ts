/**
 * A PostgREST query builder over in-memory rows, for tests that need to know
 * what a read RETURNS rather than which methods it called.
 *
 * WHY NOT A CALL RECORDER. The dashboard's player count was wrong because one
 * filter was missing, and a test that asserts "`.eq('is_seed', false)` was
 * called" passes for a query that applies it to the wrong table or the wrong
 * column. This one evaluates the filters against rows, so the assertion is the
 * number the admin would have seen.
 *
 * Only the operators the admin reads use: `select` (with `count` / `head`),
 * `eq`, `is`, `not … is null`, `in`, `gt`, `gte`, `lt`, `order`, `limit`.
 */
type Row = Record<string, unknown>;
export type MemoryTables = Record<string, Row[]>;

interface MemoryResult {
  data: Row[] | null;
  count: number | null;
  error: null;
}

function instant(value: unknown): number {
  return typeof value === "string" ? Date.parse(value) : Number(value);
}

class MemoryQuery implements PromiseLike<MemoryResult> {
  private readonly filters: ((row: Row) => boolean)[] = [];
  private head = false;
  private counted = false;
  private sortBy: { column: string; ascending: boolean } | null = null;
  private max: number | null = null;
  private offset = 0;

  constructor(private readonly rows: Row[]) {}

  select(_columns?: string, options?: { count?: string; head?: boolean }): this {
    this.head = options?.head ?? false;
    this.counted = options?.count !== undefined;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  is(column: string, value: null): this {
    this.filters.push((row) => (value === null ? row[column] == null : row[column] === value));
    return this;
  }

  not(column: string, operator: string, value: null): this {
    if (operator !== "is" || value !== null) {
      throw new Error(`memoryPostgrest: not(${column}, ${operator}) is not supported`);
    }
    this.filters.push((row) => row[column] != null);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  gt(column: string, value: unknown): this {
    this.filters.push((row) => instant(row[column]) > instant(value));
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => instant(row[column]) >= instant(value));
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => instant(row[column]) < instant(value));
    return this;
  }

  /** The FIRST order is the sort; a later one is only PostgREST's tie-break. */
  order(column: string, options?: { ascending?: boolean }): this {
    if (!this.sortBy) this.sortBy = { column, ascending: options?.ascending ?? true };
    return this;
  }

  limit(count: number): this {
    this.max = count;
    return this;
  }

  /** PostgREST paging: rows `from` to `to`, inclusive. */
  range(from: number, to: number): this {
    this.offset = from;
    this.max = to - from + 1;
    return this;
  }

  private run(): MemoryResult {
    let rows = this.rows.filter((row) => this.filters.every((keep) => keep(row)));
    const sortBy = this.sortBy;
    if (sortBy) {
      const direction = sortBy.ascending ? 1 : -1;
      rows = [...rows].sort(
        (a, b) => (instant(a[sortBy.column]) - instant(b[sortBy.column])) * direction,
      );
    }
    const count = rows.length;
    if (this.max !== null) rows = rows.slice(this.offset, this.offset + this.max);
    return {
      data: this.head ? null : rows,
      count: this.counted ? count : null,
      error: null,
    };
  }

  then<TResult1 = MemoryResult, TResult2 = never>(
    onfulfilled?: ((value: MemoryResult) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    return Promise.resolve(this.run()).then(onfulfilled, onrejected);
  }
}

/** A stand-in for the service-role client: `from(table)` over these rows. */
export function memoryClient(tables: MemoryTables) {
  return {
    from: (table: string) => new MemoryQuery(tables[table] ?? []),
  };
}
