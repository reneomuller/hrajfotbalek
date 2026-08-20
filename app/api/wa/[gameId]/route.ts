import { NextResponse, type NextRequest } from "next/server";
import { getGameById, getGameOrganizer, getVenue } from "@/lib/games/queries";
import { getStrings } from "@/lib/i18n/server";
import { formatGameDateTime } from "@/lib/format";
import { effectivePitchName, venueDisplayName } from "@/lib/venues/displayName";

/**
 * `/api/wa/<gameId>` — the organizer's WhatsApp, built on the server (round 9,
 * item 2).
 *
 * WHY THIS ROUTE EXISTS. Round 8 ruled the organizer reachable by everyone,
 * including signed-out visitors, and implemented it by putting a `wa.me` link
 * straight into the page — which put the organizer's phone NUMBER into public
 * HTML, readable by anyone including a crawler. The ruling is unchanged: one
 * tap, everyone. What changes is that the number never leaves the server.
 *
 * A 302, NOT A JSON ENDPOINT. The button stays an ordinary `<a href>`, so it
 * keeps middle-click, long-press-copy and working-without-JavaScript. The
 * browser follows the redirect and lands on `wa.me` exactly as before; the
 * only difference is that the number appears in a Location header on one
 * request rather than in the markup of every page view.
 *
 * WHAT THIS DOES AND DOES NOT BUY. Anyone who taps the button still learns the
 * number — that is the whole point of the feature and cannot be otherwise. It
 * is no longer harvestable in bulk from page source, which is the actual
 * exposure: a crawler reading one games list would otherwise collect every
 * organizer's number without a single tap.
 *
 * NO AUTHENTICATION, deliberately, because the ruling says everyone. The route
 * discloses exactly what the button discloses and nothing more — one number,
 * for one game, to someone who asked for it.
 *
 * A GAME WITH NO NUMBER 404s rather than redirecting somewhere plausible. The
 * card does not render the button in that case, so reaching here means a
 * hand-made request, and inventing a destination for it would be worse than
 * saying no.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const { gameId } = await params;

  /*
   * THROUGH THE SAME RLS-BOUND READ THE PAGE USES. A draft or cancelled game
   * returns null here exactly as it does there, so this route cannot become a
   * way to reach an organizer for a game the caller may not see.
   */
  const found = await getGameById(gameId);
  if (!found) return new NextResponse(null, { status: 404 });
  const { game } = found;

  const organizer = await getGameOrganizer(gameId);
  // Bare digits for wa.me. A leading `00` is the other way of writing `+`, so
  // it is stripped too; anything left that is not a digit was never dialable.
  const digits = organizer.phone?.replace(/\D/g, "").replace(/^00/, "") ?? "";
  if (!digits) return new NextResponse(null, { status: 404 });

  const [t, venueRow] = await Promise.all([getStrings(), getVenue(game.venue_id)]);

  const label = `${venueDisplayName(
    game.venue,
    effectivePitchName(game.pitch_name, venueRow?.pitch_name),
  )} · ${formatGameDateTime(game.starts_at)}`;

  const target = new URL(`https://wa.me/${digits}`);
  target.searchParams.set(
    "text",
    t.games.organizerWhatsAppMessage.replace("{game}", label),
  );

  /*
   * `no-store`, and it matters here specifically. A cached redirect is a
   * cached phone number sitting in a CDN or a browser's disk cache for a game
   * whose organizer may since have changed.
   */
  return NextResponse.redirect(target.toString(), {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}
