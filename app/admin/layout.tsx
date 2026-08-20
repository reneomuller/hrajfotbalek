import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/AdminNav";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { strings } from "@/lib/strings";

/**
 * The admin shell — and the gate for every route beneath it.
 *
 * ONE ADMIN CHECK EXISTS IN THIS CODEBASE: `lib/auth/requireAdmin.ts`, written
 * in Phase 18 for the cancel route and mounted here rather than reimplemented.
 * Two admin checks is how they drift, and the weaker one is the one that gets
 * found.
 *
 * WHAT THIS GATE DOES AND DOES NOT COVER. It covers page renders: every nested
 * route runs this layout first, so an unlisted URL is still a gated URL —
 * navigation is not access control. It does NOT cover server actions, which
 * are POST endpoints in their own right and are reachable without ever
 * rendering a page under this layout. Every admin action therefore calls
 * `requireAdmin()` itself, and every admin RPC re-checks inside the function.
 * Three layers, none of them load-bearing alone.
 */
export const metadata: Metadata = {
  // Nested admin pages set a bare title ("Players") and this hangs the section
  // off it, so an admin with six tabs open can tell them apart.
  title: {
    default: strings.admin.title,
    template: `%s · ${strings.admin.title}`,
  },
  // The admin surface must never be indexed, linked or previewed.
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

export default async function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  /*
   * Redirects a signed-out visitor to /login and a non-admin to /, before any
   * nested page reads a single row.
   *
   * THE RETURN VALUE IS NO LONGER USED HERE. It supplied the acting nickname
   * for a row this layout no longer renders (round 10, item 1) — the header
   * carries the avatar and the ADMIN badge instead. The CALL stays, because
   * it is the gate for every route beneath this layout and its value was
   * always the lesser half of what it does.
   */
  await requireAdmin();

  /*
   * `pt-[72px]`, NOT `pt-24` (round 10, item 1). p14 starts its chip row 37px
   * under the header; `pt-24` started ours at 60. The number is the one the
   * frame measures to and there is no spacing token at 72 — the scale runs
   * 4/8/12/16/22/32/48 and this is a distance to a piece of fixed chrome,
   * not a rhythm step.
   */
  return (
    <div className="relative z-10 mx-auto w-full max-w-shell px-gutter pb-16 pt-[72px]">
      {/*
        THE SHELL, STACKED (admin restyle).

        It was one `flex-wrap` row holding a display-size title, the section
        switcher, the acting nickname and a back link. At 390px those four
        wrapped into an unpredictable block whose height changed with the
        section name, and the title — the thing that says where you are — could
        end up beside the nav rather than above it.

        Title row first, switcher beneath, and the two right-hand items ride
        with the title. The reference puts an `ADMIN` badge next to the mark;
        here the whole page is the admin panel, so the badge is the title.
      */}
      {/*
        NO RULE UNDER THE CHIPS (round 10, item 1). Sampled across p14 at
        every 2px from y=118 to y=142: flat ground, no hairline. The chip
        row's own outlines are the edge; a rule under them draws a second one.
      */}
      <header>
        {/* Column at phone width: `ADMIN` plus a nickname plus a back link is
            wider than 390px, and wrapping mid-row put the back link half off
            the screen. Row again from `sm`, where it fits. */}
        {/*
          NOTHING SITS BETWEEN THE SITE HEADER AND THE CHIPS (round 10, item 1).

          `p14` goes straight from the header to the chip row. Round 8 removed
          the display-size `ADMIN` heading from here and left a thin
          `nickname · back to the site` row behind, which is still ~45px the
          frame does not have and still the first thing under the header.

          BOTH FACTS ARE ALREADY IN THE HEADER. The volt `ADMIN` badge says
          which mode you are in, the avatar says who you are, and the wordmark
          beside them is a link to `/` — which is exactly what "back to the
          site" did. Three things restated in a row of their own.
        */}
        <div className="mt-3">
          <AdminNav />
        </div>
      </header>

      {/*
        `pt-6`, NOT `pt-8` (round 10, item 1). p14 leaves 26px between the
        chip row and the page title, and the header no longer contributes a
        `pb-3` and a rule to that distance.
      */}
      <main className="pt-6">{children}</main>
    </div>
  );
}
