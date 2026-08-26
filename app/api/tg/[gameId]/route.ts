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
 * WHAT THIS CANNOT PROMISE, and it is worth stating plainly rather than
 * discovering.
 *
 * `t.me/+<international number>` resolves ONLY if that number has a Telegram
 * account AND its owner has not switched off "find me by phone number". There
 * is no way to check either from here without the Telegram API, and no way to
 * make the destination fail gracefully — Telegram answers an unknown number
 * with its own "user not found" page, on its own domain, after the player has
 * already left this product.
 *
 * SO THE FAILURE IS SILENT AND OFF-SITE. A player on a Ukrainian/Russian game
 * whose organizer is not on Telegram taps the button and lands nowhere useful,
 * with no route back except the browser's back arrow. Nothing here can detect
 * that; see the report for the proposal.
 *
 * NO PREFILLED MESSAGE. `t.me/+<number>` opens a chat and `?text=` is not part
 * of that form — it belongs to `t.me/share/url`, which shares a link rather
 * than messaging a person. Rather than send the player somewhere plausible
 * with the game named, this opens the chat empty and lets them type. The
 * WhatsApp route keeps its prefill because `wa.me` genuinely supports one.
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
   * DIGITS, AND THEN A `+`. `t.me/+<digits>` is the phone form; `t.me/<word>`
   * is a username, and handing it digits with no plus would open a channel
   * called "420…" if one exists. A leading `00` is the other way of writing
   * `+`, so it is stripped exactly as the WhatsApp route strips it.
   */
  const digits = organizer.phone?.replace(/\D/g, "").replace(/^00/, "") ?? "";
  if (!digits) return new NextResponse(null, { status: 404 });

  /*
   * `no-store`: a cached redirect is a cached phone number sitting in a CDN or
   * a browser's disk cache for a game whose organizer may since have changed.
   */
  return NextResponse.redirect(`https://t.me/+${digits}`, {
    status: 302,
    headers: { "cache-control": "no-store" },
  });
}
