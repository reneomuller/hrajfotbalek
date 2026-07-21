import { buildIcsEvent, icsFilename } from "@/lib/calendar/ics";
import { amountDueCzk } from "@/lib/payments/spd";
import { siteUrl } from "@/lib/site";
import type { DispatchContext } from "@/lib/email/dispatch";
import type { Database } from "@/lib/types/database";

type BookingRow = Database["public"]["Tables"]["bookings"]["Row"];
type GameRow = Database["public"]["Tables"]["games"]["Row"];

/**
 * Builds the dispatch context the cron sweeps need.
 *
 * Shared so the three routes cannot drift into constructing different URLs or
 * different amounts for the same player.
 */
export async function bookingEmailContext(
  booking: Pick<BookingRow, "price_czk" | "credit_applied_czk">,
  game: Pick<GameRow, "id" | "venue" | "starts_at">,
  player: { nickname: string },
  options: { withIcs?: boolean } = {},
): Promise<DispatchContext> {
  const base = await siteUrl();

  return {
    nickname: player.nickname,
    venue: game.venue,
    startsAt: game.starts_at,
    gameUrl: `${base}/game/${game.id}`,
    accountUrl: `${base}/account`,
    convertUrl: `${base}/game/${game.id}/waitlist/convert`,
    amountDueCzk: amountDueCzk(booking.price_czk, booking.credit_applied_czk),
    ics: options.withIcs
      ? {
          filename: icsFilename(game.venue),
          content: buildIcsEvent({
            uid: game.id,
            venue: game.venue,
            startsAt: game.starts_at,
            url: `${base}/game/${game.id}`,
          }),
          contentType: "text/calendar; charset=utf-8",
        }
      : undefined,
  };
}
