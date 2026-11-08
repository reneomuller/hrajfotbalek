import Link from "next/link";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { PlayerBreakdowns } from "@/components/admin/players/PlayerBreakdowns";
import { PlayerKpiTiles } from "@/components/admin/players/PlayerKpiTiles";
import { MobileSort, PlayersTable } from "@/components/admin/players/PlayersTable";
import { PageHeader } from "@/components/admin/ui/PageHeader";
import { SegmentTabs } from "@/components/admin/ui/SegmentTabs";
import { listPlayerDirectory } from "@/lib/admin/players/directory";
import {
  inSegment,
  parseSegment,
  PLAYER_SEGMENTS,
  playerKpis,
  segmentCounts,
} from "@/lib/admin/players/segments";
import { DEFAULT_SORT, parseSort, playersHref, sortPlayers } from "@/lib/admin/players/sort";
import { filterPlayers } from "@/lib/admin/playerSearch";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { avatarUrl } from "@/lib/storage/avatar";
import { profilePhotoVersion } from "@/lib/storage/photoVersions";
import { strings } from "@/lib/strings";

export const metadata = { title: strings.admin.playersTitle };

export const dynamic = "force-dynamic";

const t = strings.admin.playersHub;

/**
 * The players list, as a CRM (round 42, the admin rebuild).
 *
 * THE OWNER: players are "important", the share who came back "should be with
 * 'Players'", and shadow accounts — the names he books onto games — must not
 * be counted. So the page leads with five figures over COUNTED players, then
 * the segments as tabs with their counts, a search, and the list as a table
 * that sorts by any column.
 *
 * EVERYTHING IS IN THE URL — `?segment=`, `?q=`, `?sort=&dir=` — not client
 * state, as the search always was: the view is shareable, the back button
 * behaves, and the server renders only the rows the tab shows.
 *
 * THE SEARCH NARROWS THE TABS TOO. Each tab's count is the number of matches
 * in it, so a name that is not in the tab you are on shows you which tab it is
 * in — a shadow account is found exactly that way.
 *
 * The figures and breakdowns ignore the search: they describe the players,
 * not the query. Balances are summed from the append-only ledger at read time,
 * as they always were.
 */
export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  // Whose session is acting: their own row is tagged, because
  // `set_player_admin` refuses a self-change on its own.
  const [acting, players] = await Promise.all([requireAdmin(), listPlayerDirectory()]);

  const query = searchParams ? await searchParams : {};
  const rawQ = query.q;
  const q = (Array.isArray(rawQ) ? rawQ[0] : rawQ) ?? "";
  const segment = parseSegment(query.segment);
  const sort = parseSort(query.sort, query.dir);
  const view = { segment, sort, q };

  const kpis = playerKpis(players);
  const matching = filterPlayers(players, q, (player) => player.phone);
  const counts = segmentCounts(matching);
  const inTab = players.filter((player) => inSegment(player, segment));
  const shown = sortPlayers(
    matching.filter((player) => inSegment(player, segment)),
    sort,
  );

  // Round 41: each photo's own version — `createdAt` never moved, so a
  // replaced photo kept its URL here for a year.
  const photoUrls = new Map(
    await Promise.all(
      shown.map(
        async (player) =>
          [
            player.id,
            avatarUrl(supabaseUrl, player.photoPath, await profilePhotoVersion(player.photoPath)),
          ] as const,
      ),
    ),
  );

  const tabs = PLAYER_SEGMENTS.map((key) => ({
    key,
    label: t.segments[key],
    href: playersHref({ segment: key, sort, q }),
    count: counts[key],
  }));

  return (
    <>
      <PageHeader
        title={strings.admin.playersTitle}
        lede={t.lede}
        actions={<ExportCsvLink href="/admin/players/export" testId="export-players" />}
      />

      <div className="mt-6">
        <PlayerKpiTiles kpis={kpis} />
      </div>

      <div className="mt-8 flex flex-col gap-6">
        {/* Who the players are — country and skill — ABOVE the list at every
            width (the owner, 2026-11-08: "have the player country graph and
            their skill level graph above the long player list"). */}
        <PlayerBreakdowns players={players} />

        <section data-testid="players-list" className="flex flex-col gap-3">
          <SegmentTabs tabs={tabs} current={segment} label={t.segmentsLabel} testId="player-segments" />
          <p data-testid="player-segment-hint" className="m-0 text-small text-muted">
            {t.segmentHints[segment]}
          </p>

          {/*
            THE SEARCH — a GET form, so it keeps the tab and the sort it was
            typed under. `type="search"` brings the platform's clear affordance
            and, on iOS, a "Search" return key.
          */}
          <form method="get" role="search" data-testid="player-search" className="flex gap-2">
            {segment !== "all" && <input type="hidden" name="segment" value={segment} />}
            {(sort.key !== DEFAULT_SORT.key || sort.dir !== DEFAULT_SORT.dir) && (
              <>
                <input type="hidden" name="sort" value={sort.key} />
                <input type="hidden" name="dir" value={sort.dir} />
              </>
            )}
            <label htmlFor="player-q" className="sr-only">
              {strings.admin.playerSearchLabel}
            </label>
            <input
              id="player-q"
              name="q"
              type="search"
              defaultValue={q}
              placeholder={strings.admin.playerSearchPlaceholder}
              data-testid="player-search-input"
              className="min-w-0 flex-1 rounded-control border-[1.5px] border-volt bg-surface px-4 py-3 text-body text-bone placeholder:text-faint"
            />
            {q !== "" && (
              <Link
                href={playersHref({ segment, sort, q: "" })}
                data-testid="player-search-clear"
                className="flex shrink-0 items-center rounded-control border border-hairline-strong px-4 text-small font-semibold text-muted no-underline transition-colors hover:border-volt hover:text-volt"
              >
                {strings.admin.playerSearchClear}
              </Link>
            )}
          </form>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <MobileSort view={view} />
            {q !== "" && (
              <p data-testid="player-search-count" className="m-0 text-small text-muted">
                {strings.admin.playerSearchCount
                  .replace("{shown}", String(shown.length))
                  .replace("{total}", String(inTab.length))}
              </p>
            )}
          </div>

          {shown.length === 0 ? (
            <p data-testid="players-empty" className="lifted m-0 rounded-card p-5 text-small text-faint">
              {q === "" ? t.segmentEmpty : t.searchEmpty.replace("{q}", q)}
            </p>
          ) : (
            <PlayersTable
              players={shown}
              view={view}
              actingId={acting.id}
              photoUrls={photoUrls}
              segmentLabel={t.segments[segment]}
            />
          )}
        </section>
      </div>
    </>
  );
}
