import { getStrings } from "@/lib/i18n/server";

/**
 * The two numbers — "7+ games every week", "500+ active players".
 *
 * BOTH ARE ADMIN-EDITABLE, and both are the same KIND of thing: a claim the
 * organizer makes about what a visitor can expect to find. Games-per-week used
 * to be computed from published games in the trailing seven days, which
 * answered a different question — a quiet fortnight in August would have
 * advertised "2 games every week" to everyone arriving from a shared link, and
 * a computed 7 cannot carry the "+" that makes it a floor. Migration 37 moves
 * it into `site_settings` beside its peer.
 *
 * A NUMBER THAT IS NOT SET RENDERS NOTHING AT ALL, rather than a zero or a
 * placeholder. "0+ games every week" on a landing page is worse than silence,
 * and the panel disappears entirely if neither is set — an empty bordered box
 * is a container with nothing in it, which is the thing v1.2 §8 removes.
 */
export async function StatsPanel({
  gamesPerWeek,
  activePlayers,
}: {
  gamesPerWeek: number | null;
  activePlayers: number | null;
}) {
  const t = await getStrings();

  const stats: { key: string; value: number | null; label: string }[] = [
    { key: "games", value: gamesPerWeek, label: t.landing.statsGamesLabel },
    { key: "players", value: activePlayers, label: t.landing.statsPlayersLabel },
  ];
  const shown = stats.filter(
    (stat): stat is { key: string; value: number; label: string } => stat.value !== null,
  );

  if (shown.length === 0) return null;

  return (
    <div
      data-testid="stats-panel"
      /*
        CENTRED PAIR, SIDE BY SIDE ABOVE `md` (verdict, Stage 5).

        Ruling J made this a full-width banner, which left two left-aligned
        numbers against a very wide box — the dead space read as a void
        waiting to be filled. Centring the pair turns the same space into
        breathing room without inventing a third statistic to fill it.

        Stacked below `md`, where the banner is only a phone's width and a row
        would put two clamp-scaled numerals shoulder to shoulder with nothing
        between them.
      */
      className="flex min-w-[270px] flex-1 flex-col items-center justify-center gap-8 rounded-[20px] border border-hairline-volt bg-surface p-[22px] py-10 text-center md:flex-row md:gap-24"
    >
      {shown.map((stat) => (
        <div key={stat.key} data-testid={`stat-${stat.key}`}>
          {/*
            The number is the hierarchy. It is display type at hero scale
            because it is the only thing on this panel anyone reads at a
            glance; the words under it are the caption, not the content.
          */}
          <div
            data-testid={`stat-${stat.key}-value`}
            className="font-display text-[clamp(44px,10vw,72px)] leading-none text-volt"
          >
            {stat.value}
            <span className="text-volt-dim">+</span>
          </div>
          <div className="mt-[6px] text-[10px] uppercase tracking-eyebrow text-muted">
            {stat.label}
          </div>
        </div>
      ))}
    </div>
  );
}
