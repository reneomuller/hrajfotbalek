import { creditsFromCzk } from "@/lib/admin/credits";
import { buildIcsEvent, icsFilename } from "@/lib/calendar/ics";
import { amountDueCzk } from "@/lib/payments/spd";
import { siteUrl } from "@/lib/site";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/clients";
import { venueMapsHref } from "@/lib/venues/mapsHref";
import { gamePath } from "@/lib/games/link";
import type { DispatchContext } from "@/lib/email/dispatch";
import type { Database } from "@/lib/types/database";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type GameRow = Database["public"]["Tables"]["games"]["Row"];

export interface GameExtras {
  durationMinutes: number | null;
  mapsUrl: string | null;
  /** Round 41 — `/game/<number>` once the game has one, `/game/<id>` before. */
  path: string | null;
}

/**
 * The game's length and its venue's Maps link (round 41) — the When row's span
 * and the Where row's "Open in Maps". One read, by the game's id, so the five
 * call sites that select a few columns each do not all have to widen theirs.
 * Never throws: an email without a Maps link beats no email.
 */
export async function gameEmailExtras(gameId: string): Promise<GameExtras> {
  try {
    const supabase = createServiceRoleSupabaseClient();
    // `*`, not a list: `game_number` exists only once migration 20261028100000
    // is applied, and naming a missing column would fail the whole read.
    const { data: game } = await supabase.from("games").select("*").eq("id", gameId).maybeSingle();
    const row = game as {
      duration_minutes: number | null;
      venue_id: string | null;
      game_number?: number;
    } | null;
    const path = row ? gamePath({ id: gameId, game_number: row.game_number }) : null;
    if (!row?.venue_id) return { durationMinutes: row?.duration_minutes ?? null, mapsUrl: null, path };

    const { data: venue } = await supabase
      .from("venues")
      .select("name, map_query, map_url")
      .eq("id", row.venue_id)
      .maybeSingle();
    const place = venue as { name: string; map_query: string | null; map_url: string | null } | null;
    return {
      durationMinutes: row.duration_minutes,
      path,
      mapsUrl: place
        ? venueMapsHref({ name: place.name, mapQuery: place.map_query, mapUrl: place.map_url })
        : null,
    };
  } catch {
    return { durationMinutes: null, mapsUrl: null, path: null };
  }
}

export async function bookingEmailContext(
  booking: Pick<BookingRow, "price_czk" | "credit_applied_czk"> &
    Partial<Pick<BookingRow, "guest_count">>,
  game: Pick<GameRow, "id" | "venue" | "starts_at">,
  player: { nickname: string },
  options: { withIcs?: boolean } = {},
): Promise<DispatchContext> {
  const [base, extras] = await Promise.all([siteUrl(), gameEmailExtras(game.id)]);
  const credited = creditsFromCzk(booking.credit_applied_czk ?? 0);
  const gameUrl = `${base}${extras.path ?? `/game/${game.id}`}`;

  return {
    nickname: player.nickname,
    venue: game.venue,
    startsAt: game.starts_at,
    gameUrl,
    accountUrl: `${base}/account`,
    convertUrl: `${base}/game/${game.id}/waitlist/convert`,
    durationMinutes: extras.durationMinutes,
    mapsUrl: extras.mapsUrl,
    places: 1 + (booking.guest_count ?? 0),
    creditsPaid: credited > 0 ? credited : null,
    amountDueCzk: amountDueCzk(booking.price_czk, booking.credit_applied_czk),
    ics: options.withIcs
      ? {
          filename: icsFilename(game.venue),
          content: buildIcsEvent({
            uid: game.id,
            venue: game.venue,
            startsAt: game.starts_at,
            url: gameUrl,
          }),
          contentType: "text/calendar; charset=utf-8",
        }
      : undefined,
  };
}
