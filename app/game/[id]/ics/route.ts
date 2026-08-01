import { NextResponse } from "next/server";
import { buildIcsEvent, icsFilename } from "@/lib/calendar/ics";
import { getGameById } from "@/lib/games/queries";
import { siteUrl } from "@/lib/site";

/**
 * `.ics` download for a game.
 *
 * Anonymous-readable, like the game page it hangs off: a player who was sent a
 * link should be able to add the match to their calendar without an account.
 * RLS decides what is visible — a draft or cancelled game returns 404 here
 * because `getGameById` sees no row.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const result = await getGameById(id);

  if (!result) {
    return new NextResponse("Not found", { status: 404 });
  }

  const { game } = result;
  const ics = buildIcsEvent({
    uid: game.id,
    venue: game.venue,
    startsAt: game.starts_at,
    // The per-game duration, or nothing — `buildIcsEvent` falls back to the
    // same policy constant every other surface does (§5.2, REQ-GAME-008). A
    // calendar entry whose DTEND disagreed with the page it came from is the
    // failure this is guarding; it is also the one a player only notices when
    // they are already standing on the pitch.
    durationMinutes: game.duration_minutes ?? undefined,
    url: `${await siteUrl()}/game/${game.id}`,
  });

  return new NextResponse(ics, {
    headers: {
      // `charset` is explicit: the venue may carry non-ASCII (Pražačka), and a
      // calendar client guessing the encoding renders mojibake in the entry.
      "content-type": "text/calendar; charset=utf-8",
      "content-disposition": `attachment; filename="${icsFilename(game.venue)}"`,
      // Capacity does not appear in the file, but the start time can change.
      "cache-control": "no-store",
    },
  });
}
