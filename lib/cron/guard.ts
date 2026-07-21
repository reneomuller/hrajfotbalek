import { NextResponse } from "next/server";

/**
 * Shared `CRON_SECRET` guard for every scheduled route.
 *
 * These routes mutate state and send mail, so an open endpoint is a direct
 * abuse vector — anyone could expire other people's bookings or spam a
 * player's inbox by curling a URL.
 *
 * Accepts either `Authorization: Bearer <secret>` (what Vercel Cron sends) or
 * `x-cron-secret: <secret>` (convenient for a manual curl during testing).
 * Both compare against the same environment value.
 *
 * A MISSING `CRON_SECRET` REJECTS EVERYTHING. Treating an unset secret as
 * "no auth required" would leave a freshly-deployed environment wide open,
 * which is exactly when nobody is looking.
 */
export const CRON_UNAUTHORIZED = "CRON_UNAUTHORIZED";

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function isAuthorizedCron(request: Request): boolean {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const bearer = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "").trim();
  const header = request.headers.get("x-cron-secret")?.trim();

  return (
    (bearer !== undefined && bearer.length > 0 && timingSafeEqual(bearer, expected)) ||
    (header !== undefined && header.length > 0 && timingSafeEqual(header, expected))
  );
}

/**
 * Returns a 401 response when the request is not an authorized cron call, or
 * null when it is. Callers must return the response as their first act — the
 * guard mutates nothing, and neither may anything before it.
 */
export function rejectUnauthorizedCron(request: Request): NextResponse | null {
  if (isAuthorizedCron(request)) return null;
  return NextResponse.json({ error: CRON_UNAUTHORIZED }, { status: 401 });
}
