import { summariseActivity } from "@/lib/admin/players/activity";
import { unfinishedCheckouts } from "@/lib/admin/players/checkout";
import { playerKind } from "@/lib/admin/players/segments";
import type { DirectoryPlayer } from "@/lib/admin/players/types";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";

/**
 * The players list's data (round 42, the admin rebuild): every player with
 * the figures its columns, segments and tiles read, in SIX READS FOR THE WHOLE
 * LIST — players, the ledger, bookings, games, card checkouts and pass
 * purchases — folded together in TypeScript, never a round trip per row.
 *
 * SERVICE ROLE, READS ONLY, for the reason `lib/admin/queries.ts` gives: RLS
 * has no admin branch, and `checkout_sessions` has no policy at all. Writes go
 * through RPCs on the admin's own session. Every caller sits under
 * `app/admin/layout.tsx`, which runs `requireAdmin()` first.
 *
 * PAGED, because PostgREST stops at `max_rows` (1000, `supabase/config.toml`)
 * WITHOUT AN ERROR — a ledger past a thousand rows would come back short and
 * every balance after it would read low, which looks like a wrong balance
 * rather than a missing page. Each read is ordered by id so pages cannot
 * overlap or skip.
 */

const PAGE_SIZE = 1000;

type Page<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

async function readAll<T>(label: string, page: (from: number, to: number) => Page<T>): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await page(from, from + PAGE_SIZE - 1);
    if (error) throw new Error(`players directory: ${label} read failed: ${error.message}`, { cause: error });
    const batch = data ?? [];
    rows.push(...batch);
    if (batch.length < PAGE_SIZE) return rows;
  }
}

export async function listPlayerDirectory(now: number = Date.now()): Promise<DirectoryPlayer[]> {
  const service = createServiceRoleSupabaseClient();

  const [players, ledger, bookings, games, sessions, topups] = await Promise.all([
    readAll("players", (from, to) => service.from("players").select("*").order("id").range(from, to)),
    readAll("credit_ledger", (from, to) =>
      service.from("credit_ledger").select("player_id, delta_czk").order("id").range(from, to),
    ),
    readAll("bookings", (from, to) =>
      service
        .from("bookings")
        .select("player_id, game_id, status, created_at")
        .order("id")
        .range(from, to),
    ),
    readAll("games", (from, to) => service.from("games").select("id, starts_at, status, duration_minutes").order("id").range(from, to)),
    readAll("checkout_sessions", (from, to) =>
      service.from("checkout_sessions").select("player_id, status, created_at").order("id").range(from, to),
    ),
    readAll("credit_topups", (from, to) =>
      service.from("credit_topups").select("player_id, status, created_at").order("id").range(from, to),
    ),
  ]);

  const balances = new Map<string, number>();
  for (const row of ledger) balances.set(row.player_id, (balances.get(row.player_id) ?? 0) + row.delta_czk);

  const activity = summariseActivity(
    bookings.map((b) => ({ playerId: b.player_id, gameId: b.game_id, status: b.status })),
    games.map((g) => ({ id: g.id, startsAt: g.starts_at, status: g.status, durationMinutes: g.duration_minutes })),
    now,
  );

  const unfinished = unfinishedCheckouts({
    sessions: sessions.map((s) => ({ playerId: s.player_id, status: s.status, createdAt: s.created_at })),
    topups: topups.map((t) => ({ playerId: t.player_id, status: t.status, createdAt: t.created_at })),
    bookings: bookings.map((b) => ({ playerId: b.player_id, status: b.status, createdAt: b.created_at })),
  });

  return players.map((player) => {
    const played = activity.get(player.id);
    return {
      id: player.id,
      nickname: player.nickname,
      email: player.email,
      phone: player.phone,
      kind: playerKind({
        auth_user_id: player.auth_user_id,
        deleted_at: player.deleted_at ?? null,
        is_seed: player.is_seed,
      }),
      isAdmin: player.is_admin,
      isOrganizer: Boolean(player.is_organizer),
      isBanned: Boolean(player.banned_at),
      playerNumber: player.player_number ?? null,
      photoPath: player.photo_path ?? null,
      createdAt: player.created_at,
      country: player.country,
      skillLevel: player.skill_level,
      marketingOptIn: player.marketing_opt_in,
      balanceCzk: balances.get(player.id) ?? 0,
      bookingCount: played?.bookingCount ?? 0,
      gamesPlayed: played?.gamesPlayed ?? 0,
      lastGameAt: played?.lastGameAt ?? null,
      unfinishedCheckoutAt: unfinished.get(player.id) ?? null,
    };
  });
}
