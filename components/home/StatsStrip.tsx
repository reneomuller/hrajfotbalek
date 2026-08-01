import { getStrings } from "@/lib/i18n/server";

/**
 * Two numbers under the wordmark (§6, REQ-HOME-002).
 *
 * ONE IS COMPUTED AND ONE IS TYPED, and the difference is deliberate rather
 * than a shortcut. Games-per-week is a fact the database already holds —
 * published games in the trailing seven days — so computing it means it can
 * never be stale. Active players is NOT: the community includes the WhatsApp
 * cohort who have never made an account, so counting rows in `players` would
 * understate it and counting nothing would leave the strip empty. It is an
 * admin-editable number with an honest framing, and every change to it writes
 * an event naming the admin (§6, migration 30).
 *
 * A NUMBER THAT IS NOT SET RENDERS NO TILE, rather than a zero. "0 active
 * players" on the landing page of a football club is worse than saying
 * nothing, and it is the state a fresh database is in.
 */
export async function StatsStrip({
  gamesPerWeek,
  activePlayers,
}: {
  gamesPerWeek: number;
  activePlayers: number | null;
}) {
  const t = await getStrings();

  if (gamesPerWeek === 0 && activePlayers === null) return null;

  return (
    <div
      data-testid="stats-strip"
      className="mt-6 flex flex-wrap justify-center gap-3"
    >
      {gamesPerWeek > 0 && (
        <Tile
          value={String(gamesPerWeek)}
          label={t.landing.statsGamesLabel}
          testId="stat-games-per-week"
        />
      )}
      {activePlayers !== null && (
        <Tile
          value={`${activePlayers}+`}
          label={t.landing.statsPlayersLabel}
          testId="stat-active-players"
        />
      )}
    </div>
  );
}

function Tile({
  value,
  label,
  testId,
}: {
  value: string;
  label: string;
  testId: string;
}) {
  return (
    <div
      data-testid={testId}
      className="min-w-[140px] flex-1 rounded-card border border-hairline bg-surface-card px-4 py-3 text-center"
    >
      <div className="font-condensed text-[26px] font-extrabold leading-none text-volt">
        {value}
      </div>
      <div className="mt-1 font-mono text-[9px] uppercase tracking-eyebrow text-muted">
        {label}
      </div>
    </div>
  );
}
