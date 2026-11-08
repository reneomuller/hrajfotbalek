/**
 * An in-memory stand-in for the service-role Supabase client, for the money
 * page's read functions (round 42, the admin rebuild).
 *
 * ONLY THE PARTS THOSE READS USE: `from(table)` with `select`, `eq`, `gte`,
 * `lt`, `in`, `not(col, "is", null)`, `is(col, null)`, `order`, `limit`,
 * `range` and a `head` count, one level of embedding (`games!inner(status)`,
 * `players(nickname)`), and `rpc(name, args)` answered by a handler. Like
 * PostgREST it never returns more than `max_rows` (1000) rows at once —
 * whatever was asked — which is what an export that reads "everything" in one
 * request runs into. Rows are
 * returned whole — a select's column list is not a filter, which is the
 * permissive direction: a read that forgets a column still type-checks
 * against the real client.
 */
export type Row = Record<string, unknown>;
export type Tables = Record<string, Row[]>;
export type RpcHandler = (args: Record<string, unknown>) => unknown;

type Filter = (row: Row) => boolean;

/** Compare as instants when both sides are timestamps, otherwise as values. */
function compare(a: unknown, b: unknown): number {
  if (typeof a === "string" && typeof b === "string") {
    const left = Date.parse(a);
    const right = Date.parse(b);
    if (!Number.isNaN(left) && !Number.isNaN(right)) return left - right;
    return a < b ? -1 : a > b ? 1 : 0;
  }
  return Number(a) - Number(b);
}

/** `games!inner(status)` → embed `games`, keyed by `game_id`, inner join. */
function embedsOf(columns: string): { table: string; inner: boolean }[] {
  return [...columns.matchAll(/(\w+)(!inner)?\(/g)].map((match) => ({
    table: match[1] ?? "",
    inner: match[2] !== undefined,
  }));
}

function foreignKeyFor(table: string): string {
  return `${table.replace(/s$/, "")}_id`;
}

class FakeQuery implements PromiseLike<{ data: Row[] | null; count: number | null; error: null }> {
  private filters: Filter[] = [];
  private embeds: { table: string; inner: boolean }[] = [];
  private head = false;
  private orderBy: { column: string; ascending: boolean }[] = [];
  private max: number | null = null;
  private window: { from: number; to: number } | null = null;

  constructor(
    private readonly tables: Tables,
    private readonly table: string,
    private readonly maxRows: number,
  ) {}

  select(columns = "*", options?: { count?: string; head?: boolean }): this {
    this.embeds = embedsOf(columns);
    this.head = options?.head === true;
    return this;
  }

  eq(column: string, value: unknown): this {
    this.filters.push((row) => row[column] === value);
    return this;
  }

  gte(column: string, value: unknown): this {
    this.filters.push((row) => compare(row[column], value) >= 0);
    return this;
  }

  lt(column: string, value: unknown): this {
    this.filters.push((row) => compare(row[column], value) < 0);
    return this;
  }

  in(column: string, values: unknown[]): this {
    this.filters.push((row) => values.includes(row[column]));
    return this;
  }

  not(column: string, operator: string, value: unknown): this {
    if (operator !== "is" || value !== null) {
      throw new Error(`fake client: not(${column}, ${operator}) is not supported`);
    }
    this.filters.push((row) => row[column] !== null && row[column] !== undefined);
    return this;
  }

  is(column: string, value: unknown): this {
    if (value !== null) throw new Error(`fake client: is(${column}, ${String(value)})`);
    this.filters.push((row) => row[column] === null || row[column] === undefined);
    return this;
  }

  order(column: string, options?: { ascending?: boolean }): this {
    this.orderBy.push({ column, ascending: options?.ascending !== false });
    return this;
  }

  limit(count: number): this {
    this.max = count;
    return this;
  }

  /** Inclusive on both ends, as PostgREST's `Range` header is. */
  range(from: number, to: number): this {
    this.window = { from, to };
    return this;
  }

  private rows(): Row[] {
    let rows = (this.tables[this.table] ?? []).filter((row) =>
      this.filters.every((filter) => filter(row)),
    );

    for (const embed of this.embeds) {
      const key = foreignKeyFor(embed.table);
      const related = this.tables[embed.table] ?? [];
      rows = rows
        .map((row) => ({ ...row, [embed.table]: related.find((r) => r.id === row[key]) ?? null }))
        .filter((row) => !embed.inner || row[embed.table] !== null);
    }

    if (this.orderBy.length > 0) {
      rows = [...rows].sort((a, b) => {
        for (const { column, ascending } of this.orderBy) {
          const order = compare(a[column], b[column]) * (ascending ? 1 : -1);
          if (order !== 0) return order;
        }
        return 0;
      });
    }
    if (this.window) rows = rows.slice(this.window.from, this.window.to + 1);
    if (this.max !== null) rows = rows.slice(0, this.max);
    // PostgREST's `max_rows`: no response carries more, whatever was asked.
    return rows.slice(0, this.maxRows);
  }

  then<TResult1, TResult2 = never>(
    onfulfilled?: ((value: { data: Row[] | null; count: number | null; error: null }) => TResult1 | PromiseLike<TResult1>) | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): PromiseLike<TResult1 | TResult2> {
    const rows = this.rows();
    const result = { data: this.head ? null : rows, count: rows.length, error: null };
    return Promise.resolve(result).then(onfulfilled, onrejected);
  }
}

export interface FakeServiceClient {
  from(table: string): FakeQuery;
  rpc(name: string, args: Record<string, unknown>): Promise<{ data: unknown; error: { message: string } | null }>;
  /** Every rpc call made, in order — for asserting WHICH counter was asked. */
  rpcCalls: { name: string; args: Record<string, unknown> }[];
}

/** `max_rows` in `supabase/config.toml` — and Supabase's hosted default. */
export const POSTGREST_MAX_ROWS = 1000;

export function fakeServiceClient(
  tables: Tables,
  rpcs: Record<string, RpcHandler> = {},
  maxRows = POSTGREST_MAX_ROWS,
): FakeServiceClient {
  const rpcCalls: FakeServiceClient["rpcCalls"] = [];
  return {
    from: (table) => new FakeQuery(tables, table, maxRows),
    rpc: async (name, args) => {
      rpcCalls.push({ name, args });
      const handler = rpcs[name];
      if (!handler) return { data: null, error: { message: `function ${name} does not exist` } };
      return { data: handler(args), error: null };
    },
    rpcCalls,
  };
}

/**
 * `game_seats_taken`'s arithmetic over the fake's own tables, so a test can
 * answer the seat counter the way the database would: one per booking that
 * holds a seat plus its guests, plus the game's house guests.
 */
export function seatsTakenFrom(tables: Tables): RpcHandler {
  return (args) => {
    const ids = (args.p_game_ids as string[]) ?? [];
    return ids.map((gameId) => {
      const game = (tables.games ?? []).find((g) => g.id === gameId);
      const held = (tables.bookings ?? []).filter(
        (b) => b.game_id === gameId && (b.status === "reserved" || b.status === "confirmed"),
      );
      const seats =
        Number(game?.guest_count ?? 0) +
        held.reduce((sum, b) => sum + 1 + Number(b.guest_count ?? 0), 0);
      return { game_id: gameId, seats_taken: seats };
    });
  };
}
