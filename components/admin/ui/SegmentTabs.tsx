import Link from "next/link";

/**
 * Tabs that are links (round 42, the admin rebuild): Upcoming / Played /
 * Cancelled on the games list, the segments on the players list.
 *
 * LINKS WITH A QUERY STRING, NOT CLIENT STATE, so a tab survives a reload, can
 * be sent to somebody, and costs no JavaScript — and the server renders only
 * the rows the tab shows. Drawn as the admin nav's chips, so the page reads as
 * one system: a volt ring marks the current one, nothing else.
 */
export interface SegmentTab {
  key: string;
  label: string;
  href: string;
  count?: number;
}

export function SegmentTabs({
  tabs,
  current,
  testId = "segment-tabs",
  label,
}: {
  tabs: SegmentTab[];
  current: string;
  testId?: string;
  /** What the row switches between, for a screen reader. */
  label: string;
}) {
  return (
    <nav
      aria-label={label}
      data-testid={testId}
      className="-mx-gutter flex gap-2 overflow-x-auto px-gutter pb-1 [scrollbar-width:none] md:mx-0 md:flex-wrap md:px-0 [&::-webkit-scrollbar]:hidden"
    >
      {tabs.map((tab) => {
        const isCurrent = tab.key === current;
        return (
          <Link
            key={tab.key}
            href={tab.href}
            aria-current={isCurrent ? "page" : undefined}
            data-testid={`${testId}-${tab.key}`}
            className={`flex shrink-0 items-center gap-2 whitespace-nowrap rounded-pill border px-3 py-[6px] text-small font-semibold no-underline transition-colors ${
              isCurrent
                ? "border-volt text-volt"
                : "border-hairline-strong text-muted hover:border-volt hover:text-volt"
            }`}
          >
            {tab.label}
            {tab.count !== undefined && (
              <span className={`tabular-nums ${isCurrent ? "text-volt" : "text-faint"}`}>{tab.count}</span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
