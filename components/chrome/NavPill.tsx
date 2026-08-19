"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { useStrings } from "@/components/LocaleProvider";

/**
 * The floating navigation pill (v1.3, ruling K).
 *
 * FLUSH TO THE BOTTOM EDGE, full width — see the note on the element itself.
 * Ruling K made it float 16px clear on every side; the owner reversed that in
 * the night round of 2026-08-19. The one surviving shadow in the product still
 * points UPWARD (`shadow-lift`), which is now the only cue that content passes
 * beneath it rather than stopping at it.
 *
 * THREE DESTINATIONS AS OF THE PASS RULING: Home, Games, Profile. `Pass` came
 * out because the panel on the games list is now the sole entry point to it —
 * a tab and a panel competing for the same destination is one of them being
 * ignored, and the panel sits where somebody is already deciding about a game,
 * which is the only moment pre-buying is worth anything. `/pass` survives as a
 * ROUTE, exactly as `/my-games` did before it.
 *
 * RULING K CHANGED THE CONTENTS: Home is in, My games is out. `/my-games`
 * SURVIVES AS A ROUTE — what was reversed is the tab, not the extraction — and
 * it is reached from Profile. The reasoning: My games is a place you go
 * occasionally and Home is the place the product starts, and a four-item bar
 * where one item is rarely used is a three-item bar carrying a passenger.
 *
 * BELOW `md` ONLY. Above it the header's link row does this job, and the two
 * are mutually exclusive at every width — two controls saying "Games" on one
 * screen is one of them being ignored.
 *
 * A CLIENT COMPONENT, and only because of the active state. `usePathname` is
 * the whole reason; the links are plain `<Link>`s and work without JavaScript.
 *
 * ACTIVE IS PREFIX-MATCHED AGAINST A LIST, not against the href. `/account/topup`
 * lights Profile by prefix, but `/game/<id>` — SINGULAR — is not a prefix of
 * `/games`, and a bar that goes dark the moment you tap into a game detail is a
 * bar that cannot tell you where you are. So Games declares both routes
 * explicitly rather than the href doing double duty and quietly failing on the
 * one path that matters most.
 *
 * HOME IS EXACT-MATCHED, for the opposite reason: `/` is a prefix of
 * everything, so prefix-matching it would light Home on every screen.
 *
 * SHOWN SIGNED OUT TOO, leading to routes that redirect to login carrying a
 * return path. The shape of the product should be legible before you have an
 * account, and a bar whose contents change under you after signing in is a
 * different app.
 */

interface Tab {
  href: string;
  label: string;
  icon: IconName;
  /** Path prefixes that light this tab. Defaults to `[href]`. */
  match?: string[];
  /** `/` would otherwise prefix-match every route in the product. */
  exact?: boolean;
}

export function NavPill() {
  const t = useStrings();
  const pathname = usePathname();

  const tabs: Tab[] = [
    { href: "/", label: t.nav.homeShort, icon: "home", exact: true },
    // `/game/<id>` is the detail page — singular, and not a prefix of /games.
    { href: "/games", label: t.nav.games, icon: "balls", match: ["/games", "/game/"] },
    { href: "/account", label: t.nav.profileShort, icon: "user" },
  ];

  return (
    <nav
      data-testid="nav-pill"
      aria-label={t.nav.primary}
      /*
       * `--tabbar-h` already carries the safe-area inset, and the pill sits
       * 16px above whatever that resolves to. Reading the same custom property
       * the page's bottom padding reads is what keeps the last line of content
       * from ending up behind the pill.
       */
      /*
        FLUSH TO THE VIEWPORT EDGE (owner's ruling, night round item 4), which
        REVERSES the floating inset ruling K gave this component.

        It was `inset-x-4` with `bottom: safe-area + 16px`, so the page visibly
        continued underneath it on all four sides — the whole point of calling
        it a pill. The owner has ruled for flush: `inset-x-0`, `bottom-0`, no
        gap on any edge. Recorded as a reversal rather than quietly edited,
        because the floating version had a stated reason and someone will
        propose it again.

        THE SAFE-AREA INSET MOVES INSIDE. It used to be part of the `bottom`
        offset, holding the whole pill above the iPhone home indicator. Sitting
        flush, the BAR must reach the physical bottom edge while its CONTENT
        stays clear of the indicator — so the inset becomes bottom padding on
        the list. Dropping it instead would put the labels under the indicator,
        which is the bug the offset existed to prevent.

        `shadow-lift` STAYS. The one upward shadow in the product still says
        "content passes under this", which is now the only cue that it does.
      */
      className="fixed inset-x-0 bottom-0 z-40 md:hidden"
    >
      <ul
        className="m-0 flex list-none items-stretch gap-1 rounded-t-card bg-surface-raised px-1 pt-1 shadow-lift"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 4px)" }}
      >
        {tabs.map((tab) => {
          const active = tab.exact
            ? pathname === tab.href
            : (tab.match ?? [tab.href]).some((prefix) => pathname.startsWith(prefix));

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                data-testid={`tab-${tab.href === "/" ? "home" : tab.href.slice(1)}`}
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                /*
                 * The ACTIVE item is a filled volt capsule with ink content —
                 * fill rather than an outline, because ruling C takes strokes
                 * off day boxes and chips and the same argument applies here:
                 * fill and radius carry the surface.
                 *
                 * min-h-11 is the 44px target floor. A quarter of a 390px
                 * screen is 97px wide, so width was never the constraint;
                 * height is.
                 */
                className={`flex min-h-11 flex-col items-center justify-center gap-[2px] rounded-pill no-underline transition-colors ${
                  active ? "bg-volt text-ink" : "text-muted hover:text-bone"
                }`}
              >
                <Icon name={tab.icon} className="h-[20px] w-[20px]" />
                {/*
                  `whitespace-nowrap`, and no truncation. A label that does not
                  fit is a WORD problem, not a type-size problem — the CS
                  four-item bar was measured at 390px in
                  docs/v13/nav-label-check.md and `Permanentka`, the longest
                  label in any of the three languages, clears its cell by 8px.
                  If that ever stops being true, change the word.
                */}
                <span className="whitespace-nowrap text-small font-semibold">
                  {tab.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
