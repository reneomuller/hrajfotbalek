import Link from "next/link";

/**
 * A row of chips that are links, for the money page's two pickers — the
 * period (this month / last month / all time) and the operations window
 * (today / this week / this month).
 *
 * NOT `SegmentTabs`, and only because of the hooks: the admin suite reads
 * `stat-window-<key>` and its `data-selected`, which predate the shared tabs
 * and are part of what that spec means by "the window picker switches the
 * range". Drawn exactly as `SegmentTabs` and the admin nav draw a chip — a
 * volt ring on the current one, nothing else — so the page reads as one
 * system.
 */
export interface ChipLink {
  key: string;
  label: string;
  href: string;
  testId: string;
}

export function ChipLinks({
  chips,
  current,
  testId,
  label,
}: {
  chips: ChipLink[];
  current: string;
  testId: string;
  /** What the row switches between, for a screen reader. */
  label: string;
}) {
  return (
    <nav aria-label={label} data-testid={testId} className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const selected = chip.key === current;
        return (
          <Link
            key={chip.key}
            href={chip.href}
            data-testid={chip.testId}
            data-selected={selected ? "true" : "false"}
            aria-current={selected ? "page" : undefined}
            className={`shrink-0 whitespace-nowrap rounded-pill border px-3 py-[6px] text-small font-semibold no-underline transition-colors ${
              selected
                ? "border-volt text-volt"
                : "border-hairline-strong text-muted hover:border-volt hover:text-volt"
            }`}
          >
            {chip.label}
          </Link>
        );
      })}
    </nav>
  );
}
