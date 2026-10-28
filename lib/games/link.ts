/**
 * THE SHORT GAME LINK (round 41) — `/game/42` instead of `/game/<uuid>`.
 *
 * The owner: "would it be possible for each posted game to have a better
 * looking link rather than an extremely long one? ideally /game/<number>".
 * `games.game_number` (migration 20261028100000) is that number.
 *
 * NO CAPABILITY CHECK, BY CONSTRUCTION. Every caller passes a row it read with
 * the column or without it: a row that HAS a number proves the column exists,
 * so the short link it produces resolves. Before the migration nothing has a
 * number and every link stays `/game/<uuid>`, which keeps working afterwards
 * too — nothing already shared breaks.
 */
export function gamePath(game: { id: string; game_number?: number | null }): string {
  return `/game/${game.game_number ?? game.id}`;
}

/** Postgres `integer`: anything longer cannot be a game number. */
const MAX_DIGITS = 9;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type GameRef = { kind: "number"; value: number } | { kind: "id"; value: string };

/**
 * What a `/game/[id]` segment names. Null for anything that is neither, so a
 * mistyped link is a 404 rather than an invalid-uuid error from the database.
 */
export function parseGameRef(segment: string): GameRef | null {
  if (new RegExp(`^[1-9]\\d{0,${MAX_DIGITS - 1}}$`).test(segment)) {
    return { kind: "number", value: Number(segment) };
  }
  if (UUID.test(segment)) return { kind: "id", value: segment };
  return null;
}
