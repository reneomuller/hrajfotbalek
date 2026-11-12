import { NextResponse } from "next/server";
import { getCurrentPlayer } from "@/lib/auth/session";
import { queueCapiEvent } from "@/lib/analytics/capiFromRequest";
import { registrationEventId } from "@/lib/analytics/metaCapi";

export const dynamic = "force-dynamic";

/** A registration counts only on the first visit after the account was made. */
const REGISTRATION_WINDOW_MS = 60 * 60 * 1000;

/**
 * `POST /api/meta/registration` — CompleteRegistration for Meta's Conversions
 * API, called once by `SignUpEvent` right after it pushes `sign_up`.
 *
 * Nothing in the request is trusted: the player is the session's, the event id
 * is derived from their id (the same one the browser's Pixel sends, so Meta
 * counts it once), and an account older than an hour is ignored. Always 204:
 * the answer tells a caller nothing, and the send runs after the response.
 */
export async function POST() {
  const player = await getCurrentPlayer();
  if (player && Date.now() - Date.parse(player.created_at) < REGISTRATION_WINDOW_MS) {
    await queueCapiEvent({ name: "CompleteRegistration", eventId: registrationEventId(player.id), playerId: player.id, path: "/signup" });
  }
  return new NextResponse(null, { status: 204 });
}
