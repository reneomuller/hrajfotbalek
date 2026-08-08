"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Icon, type IconName } from "@/components/Icon";
import { useStrings } from "@/components/LocaleProvider";

/**
 * The phone-width navigation (v1.2 §7).
 *
 * FOUR DESTINATIONS, FIXED TO THE BOTTOM. Everything a player does lives at
 * thumb height instead of behind a header they have to reach across the screen
 * for. The header stays — it carries the wordmark, the language switcher and
 * the sign-in control, and losing the language switcher on a phone would strand
 * exactly the reader who needs it — but its LINKS move here, so the two are not
 * saying the same thing twice.
 *
 * `md:hidden`. On a desktop a bottom bar is a phone affordance pinned to the
 * bottom of a large screen, miles from anything; the header does the job there
 * and this is not rendered at all.
 *
 * A CLIENT COMPONENT, and only because of the active state. `usePathname` is
 * the whole reason — the alternative is passing the path down from every page,
 * which is four places to forget. The links themselves are plain `<Link>`s and
 * work without JavaScript; the volt highlight is what needs the hook.
 *
 * ACTIVE IS PREFIX-MATCHED AGAINST A LIST, not against the href. `/account/topup`
 * lights Profile by prefix, but `/game/<id>` — SINGULAR — is not a prefix of
 * `/games`, and a tab bar that goes dark the moment you tap into a game detail
 * is a tab bar that cannot tell you where you are. So Games declares both
 * routes explicitly rather than the href doing double duty and quietly failing
 * on the one path that matters most.
 *
 * MY GAMES AND PROFILE ARE SHOWN SIGNED OUT TOO, and they lead to routes that
 * redirect to the login page carrying a return path. That is deliberate: the
 * shape of the product should be legible before you have an account, and a tab
 * bar whose contents change under you after signing in is a different app.
 */

interface Tab {
  href: string;
  label: string;
  icon: IconName;
  /** Path prefixes that light this tab. Defaults to `[href]`. */
  match?: string[];
}

export function BottomTabBar() {
  const t = useStrings();
  const pathname = usePathname();

  const tabs: Tab[] = [
    // `/game/<id>` is the detail page — singular, and not a prefix of /games.
    { href: "/games", label: t.nav.games, icon: "balls", match: ["/games", "/game/"] },
    { href: "/pass", label: t.nav.pass, icon: "ticket" },
    { href: "/my-games", label: t.nav.myGames, icon: "list" },
    { href: "/account", label: t.nav.profileShort, icon: "user" },
  ];

  return (
    <nav
      data-testid="bottom-tabs"
      aria-label={t.nav.primary}
      className="fixed inset-x-0 bottom-0 z-40 border-t border-hairline bg-ink/95 backdrop-blur-md md:hidden"
      // The safe-area inset, and only here: the bar is the bottom-most thing on
      // a phone, so it owns the home indicator's strip and nothing above it has
      // to think about it.
      style={{ paddingBottom: "env(safe-area-inset-bottom, 0px)" }}
    >
      <ul className="m-0 flex h-tabbar list-none items-stretch p-0">
        {tabs.map((tab) => {
          const active = (tab.match ?? [tab.href]).some((prefix) =>
            pathname.startsWith(prefix),
          );

          return (
            <li key={tab.href} className="flex-1">
              <Link
                href={tab.href}
                data-testid={`tab-${tab.href.slice(1)}`}
                data-active={active ? "true" : "false"}
                aria-current={active ? "page" : undefined}
                /* The whole cell is the target — 44px minimum is the floor and
                   a quarter of the viewport by 64px is comfortably over it. */
                className={`flex h-full flex-col items-center justify-center gap-1 no-underline transition-colors ${
                  active ? "text-volt" : "text-muted"
                }`}
              >
                <Icon name={tab.icon} className="h-[22px] w-[22px]" />
                <span className="font-mono text-[9px] uppercase tracking-[1px]">
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
