"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { adminNavLinks } from "@/lib/nav/links";

/**
 * The admin section switcher.
 *
 * A client component for one reason: the current section is a function of the
 * pathname, and a server layout does not get one. Everything else about the
 * admin shell stays server-rendered and server-gated.
 *
 * Prefix matching rather than equality, so `/admin/games/<id>/edit` still shows
 * Games as current — an organizer three levels into a game should not see the
 * nav claim they are nowhere.
 */
export function AdminNav() {
  const pathname = usePathname() ?? "";

  return (
    /*
      A SCROLLING ROW OF CHIPS, not wrapped 11px text (admin restyle).

      The links were `text-[11px] uppercase` with `flex-wrap`, which at phone
      width stacked six sections into two or three ragged rows above the page
      title and gave each of them a tap target a few pixels tall. The reference
      uses volt-outlined pills, and they are also the fix: a chip is a real
      target, and one row that scrolls beats three rows that wrap.

      THE ROW SCROLLS AND THE CALENDAR DOES NOT, which is not a contradiction.
      The owner's calendar-width ruling — "scrolling calendars hide days" — is
      about a control whose whole job is showing a fixed, countable set at a
      glance. This is a section switcher with a `current` chip; nothing is
      hidden that a reader was counting, and the alternative is three rows of
      chrome on a 390px screen.
    */
    <nav className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden">
      {adminNavLinks().map((link) => {
        /*
         * `/admin` IS EXACT-MATCHED, for the reason `/` is in the nav pill:
         * it is a prefix of every route in this section, so prefix-matching it
         * would light Dashboard on every admin screen (round 8, item 2).
         */
        const current =
          link.href === "/admin" ? pathname === "/admin" : pathname.startsWith(link.href);
        return (
          <Link
            key={link.href}
            href={link.href}
            aria-current={current ? "page" : undefined}
            /* `/admin` has no third segment — `split("/")[2]` is undefined
               there, which would ship `admin-nav-undefined`. */
            data-testid={`admin-nav-${link.href.split("/")[2] ?? "dashboard"}`}
            className={`shrink-0 whitespace-nowrap rounded-pill border px-3 py-[6px] text-small font-semibold no-underline transition-colors ${
              current
                ? "border-volt bg-volt/[.12] text-volt"
                : "border-hairline-strong text-muted hover:border-volt hover:text-volt"
            }`}
          >
            {link.label}
          </Link>
        );
      })}
    </nav>
  );
}
