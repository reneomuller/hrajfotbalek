import { NextResponse, type NextRequest } from "next/server";
import { getGameById, getGameOrganizer } from "@/lib/games/queries";

/**
 * `/api/tg/<gameId>` — the organizer's Telegram, built on the server
 * (round 18, item 8).
 *
 * THE SAME PATTERN AS `/api/wa/<gameId>`, DELIBERATELY, and for the same
 * reason: a `t.me` link in the markup is the organizer's phone NUMBER in
 * public HTML, harvestable in bulk by a crawler reading one games list. The
 * number never leaves the server; it appears in a Location header on one
 * request made by someone who tapped.
 *
 * WHY A SECOND ROUTE RATHER THAN A PARAMETER. The two destinations differ in
 * more than a hostname — WhatsApp takes a prefilled `?text=` and Telegram's
 * `t.me/+<number>` does not — and a route that branched on a query string
 * would be one endpoint with two contracts. Two files, one shape.
 *
 * ------------------------------------------------------------------------
 * BY USERNAME, NOT BY PHONE (round 19, item 2).
 *
 * ~~`t.me/+<international number>`, which resolves only if that number has a
 * Telegram account AND its owner has left "find me by phone number" on —
 * neither checkable from here, and the failure silent and off-site.~~
 *
 * THE FALLBACK IS GONE RATHER THAN DEMOTED. Keeping the phone form for
 * organizers without a handle would mean the product still sometimes sends a
 * player to Telegram's "user not found" page, on Telegram's domain, with no
 * route back — which is the entire defect. A handle resolves because it
 * exists; it is the identifier its owner chose to be reachable by.
 *
 * A GAME WITH NO HANDLE NEVER REACHES THIS ROUTE. `OrganizerCard` offers the
 * WhatsApp button instead, so contact is always possible and no link goes
 * nowhere. This still 404s if it is called anyway, because a route that
 * invents a destination for a request it cannot serve is worse than one that
 * says no.
 *
 * THE NUMBER IS NO LONGER INVOLVED AT ALL, which is a privacy improvement
 * rather than a side effect: a handle is a published name and a phone is not,
 * so the redirect that used to carry one now carries the other.
 *
 * NO PREFILLED MESSAGE. `t.me/<handle>` opens a chat and `?text=` is not part
 * of that form — it belongs to `t.me/share/url`, which shares a link rather
 * than messaging a person. The WhatsApp route keeps its prefill because
 * `wa.me` genuinely supports one.
 */
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ gameId: string }> },
): Promise<Response> {
  const { gameId } = await params;

  /*
   * THROUGH THE SAME RLS-BOUND READ THE PAGE USES, so a draft or cancelled
   * game returns null here exactly as it does there — this cannot become a way
   * to reach an organizer for a game the caller may not see.
   */
  const found = await getGameById(gameId);
  if (!found) return new NextResponse(null, { status: 404 });

  const organizer = await getGameOrganizer(gameId);

  /*
   * THE HANDLE IS STORED BARE — `set_game_organizer` strips `@` and any
   * `t.me/` prefix, and a CHECK constrains what is left to Telegram's own
   * rule. So it is interpolated directly, and the shape below is re-asserted
   * anyway: this builds a URL, and a value that reached the column before the
   * constraint existed must not reach a `Location` header now.
   */
  const handle = organizer.telegram ?? "";
  if (!/^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(handle)) {
    return new NextResponse(null, { status: 404 });
  }

  /*
   * `no-store`: a cached redirect is a cached contact detail sitting in a CDN
   * or a browser's disk cache for a game whose organizer may since have
   * changed.
   */
  return NextResponse.redirect(`https://t.me/${handle}`, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}
