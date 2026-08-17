import Link from "next/link";
import type { Strings } from "@/lib/strings";

/**
 * Overview · My games · Settings.
 *
 * LINKS AND A `?tab=` QUERY, NOT CLIENT STATE — the same decision the day
 * filter makes, for the same three reasons. The selection is shareable, the
 * back button does what a back button should, and the page costs no JavaScript
 * on a route most people reach from a phone. It also means the server renders
 * one tab's content rather than three and hides two, which on the My games tab
 * is the difference between fetching a fixture list and not.
 *
 * OVERVIEW IS THE ABSENT VALUE. `/account` with no query is the overview, so
 * every link that has ever pointed at this page still lands somewhere sensible
 * — and the tab a player is most likely to want has the shortest URL.
 *
 * `/my-games` STAYS A ROUTE, AND STOPS BEING A DESTINATION. It was reached from
 * one place — a "See all my games →" link on the account page — because the nav
 * pill carries Home, Games and Profile and never carried it. The My games TAB
 * is now that door, so the link is gone and the route survives for the links
 * already shared and bookmarked. Both render the SAME `PlayerHistory`; this is
 * one list with two URLs, not two lists.
 *
 * `aria-current="page"` rather than styling alone, because the selected tab is
 * announced rather than merely coloured — and the underline that marks it is a
 * border on the link itself, so it moves with the text when a translation makes
 * the word longer.
 */

export type ProfileTab = "overview" | "games" | "settings";

/** Anything unrecognised is the overview, including a repeated `?tab=`. */
export function parseProfileTab(value: string | string[] | undefined): ProfileTab {
  if (value === "games") return "games";
  if (value === "settings") return "settings";
  return "overview";
}

export function ProfileTabs({ selected, t }: { selected: ProfileTab; t: Strings }) {
  const tabs: { key: ProfileTab; href: string; label: string }[] = [
    { key: "overview", href: "/account", label: t.profile.tabOverview },
    { key: "games", href: "/account?tab=games", label: t.profile.tabGames },
    { key: "settings", href: "/account?tab=settings", label: t.profile.tabSettings },
  ];

  return (
    <nav
      data-testid="profile-tabs"
      aria-label={t.account.title}
      className="mt-6 flex gap-5 border-b border-hairline"
    >
      {tabs.map((tab) => {
        const isSelected = tab.key === selected;

        return (
          <Link
            key={tab.key}
            href={tab.href}
            scroll={false}
            data-testid="profile-tab"
            data-tab={tab.key}
            data-selected={isSelected ? "true" : "false"}
            aria-current={isSelected ? "page" : undefined}
            /*
              `-mb-px` pulls the link's own bottom border onto the nav's, so the
              selected underline REPLACES the hairline rather than sitting a
              pixel below it and drawing a double rule.
            */
            className={`-mb-px border-b-2 pb-3 text-body-lg font-semibold no-underline transition-colors ${
              isSelected
                ? "border-volt text-white"
                : "border-transparent text-muted hover:text-bone"
            }`}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
