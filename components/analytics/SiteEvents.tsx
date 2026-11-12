"use client";

import { useEffect, useRef } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { ANALYTICS_FLAGS, isLoginMethod, pushDataLayer } from "@/lib/analytics/gtm";

/**
 * The site-wide analytics events, mounted once in the root layout while a GTM
 * container is configured (GTM v4, 2026-11-12):
 *
 *   user_id, player_id — the internal player id on every page after sign-in, so
 *                        GA4 counts one person's phone and laptop as one user.
 *                        Never the email. `null` when signed out, so a shared
 *                        device does not carry the last player's id.
 *   login              — `?logged_in=password|email|magic_link`, set by
 *                        `app/login/actions.ts` and `app/auth/callback/route.ts`
 *   booking_cancelled  — `?cancelled=<game>~<hours>~<1|0>`, set by the cancel action
 *   share_game         — any click on an element carrying `data-share-platform`
 *                        (the WhatsApp link and Copy link), so the share
 *                        controls stay Server Components.
 *
 * Flags are pushed once and removed with `history.replaceState`.
 */
export function SiteEvents({ userId }: { userId: string | null }) {
  const params = useSearchParams();
  const pathname = usePathname();
  const handled = useRef<string | null>(null);

  useEffect(() => {
    // `player_id` is the same id as a GA4 user property: registered as a user-scoped custom dimension it lets
    // HQ read each player's first source (firstUserSource / medium / campaign) from GA4. No new cookie.
    pushDataLayer({ user_id: userId, player_id: userId });
  }, [userId, pathname]);

  const login = params.get(ANALYTICS_FLAGS.loggedIn);
  const cancelled = params.get(ANALYTICS_FLAGS.cancelled);
  useEffect(() => {
    if (!login && !cancelled) return;
    const here = `${pathname}?${params.toString()}`;
    if (handled.current === here) return;
    handled.current = here;

    if (isLoginMethod(login)) pushDataLayer({ event: "login", method: login });
    if (cancelled) {
      const [gameId, hours, refunded] = cancelled.split("~");
      const h = Number(hours);
      if (gameId) pushDataLayer({ event: "booking_cancelled", game_id: gameId, hours_before_kickoff: Number.isFinite(h) ? Math.round(h * 10) / 10 : null, refunded: refunded === "1" });
    }

    const rest = new URLSearchParams(params.toString());
    rest.delete(ANALYTICS_FLAGS.loggedIn);
    rest.delete(ANALYTICS_FLAGS.cancelled);
    const query = rest.toString();
    window.history.replaceState(null, "", `${pathname}${query ? `?${query}` : ""}${window.location.hash}`);
  }, [login, cancelled, params, pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent): void => {
      const el = (e.target as Element | null)?.closest?.("[data-share-platform]");
      if (!el) return;
      pushDataLayer({ event: "share_game", game_id: el.getAttribute("data-share-game"), platform: el.getAttribute("data-share-platform") });
    };
    document.addEventListener("click", onClick, { capture: true });
    return () => document.removeEventListener("click", onClick, { capture: true });
  }, []);

  return null;
}
