import Link from "next/link";
import { PlayerTags } from "@/components/admin/players/PlayerTags";
import { PlayerTile } from "@/components/admin/players/PlayerTile";
import { SortArrow } from "@/components/admin/players/SortArrow";
import { creditsFromCzk } from "@/lib/admin/credits";
import type { PlayerSegment } from "@/lib/admin/players/segments";
import { nextSort, playersHref, type PlayerSort, type PlayerSortKey } from "@/lib/admin/players/sort";
import type { DirectoryPlayer } from "@/lib/admin/players/types";
import { formatDate, formatTime } from "@/lib/format";
import { creditsLabel } from "@/lib/pass/credits";
import { strings } from "@/lib/strings";

/**
 * The players list as a table (round 42, the admin rebuild).
 *
 * ONE MARKUP, TWO LAYOUTS. From `md` it is a grid whose rows are subgrids, so
 * every column lines up under its sortable header; below `md` each row folds
 * into a card — face, name and Credits on top, the four facts as a strip
 * beneath — and the header row is hidden, so each fact carries its own small
 * label. The explicit table roles keep the semantics a screen reader would
 * otherwise drop once the display is changed.
 *
 * THE WHOLE ROW IS THE LINK. The name's link stretches over its row (the row
 * is `relative`, and a grid row is a box that can be — a table row in table
 * layout is not, reliably), so a tap anywhere on a row opens the player.
 *
 * `"en"` for the Credits plural, as everywhere in admin: the panel is English.
 */

const t = strings.admin.playersHub;

interface View {
  segment: PlayerSegment;
  sort: PlayerSort;
  q: string;
}

const SORTABLE: { key: PlayerSortKey; label: string }[] = [
  { key: "name", label: t.columns.player },
  { key: "joined", label: t.columns.joined },
  { key: "played", label: t.columns.played },
  { key: "last-game", label: t.columns.lastGame },
  { key: "credit", label: t.columns.credit },
];

function directionWord(sort: PlayerSort): string {
  return sort.dir === "asc" ? t.sortAscending : t.sortDescending;
}

function SortHeader({ column, view, align = "left" }: { column: { key: PlayerSortKey; label: string }; view: View; align?: "left" | "right" }) {
  const active = view.sort.key === column.key;
  return (
    <th
      role="columnheader"
      scope="col"
      aria-sort={active ? (view.sort.dir === "asc" ? "ascending" : "descending") : undefined}
      className={`py-3 font-normal ${align === "right" ? "text-right" : "text-left"}`}
    >
      <Link
        href={playersHref({ ...view, sort: nextSort(view.sort, column.key) })}
        aria-label={t.sortBy.replace("{column}", column.label)}
        data-testid={`players-sort-${column.key}`}
        className={`inline-flex items-center gap-1 text-[10px] uppercase tracking-eyebrow no-underline transition-colors hover:text-volt ${
          active ? "text-volt" : "text-muted"
        }`}
      >
        {column.label}
        {active && <SortArrow dir={view.sort.dir} />}
      </Link>
    </th>
  );
}

/** Sorting below `md`, where the header row is hidden: the same links as chips. */
export function MobileSort({ view }: { view: View }) {
  return (
    <nav aria-label={t.sortLabel} data-testid="players-sort-chips" className="flex flex-wrap items-center gap-2 md:hidden">
      <span className="text-[10px] uppercase tracking-eyebrow text-faint">{t.sortLabel}</span>
      {SORTABLE.map((column) => {
        const active = view.sort.key === column.key;
        return (
          <Link
            key={column.key}
            href={playersHref({ ...view, sort: nextSort(view.sort, column.key) })}
            aria-current={active ? "true" : undefined}
            className={`inline-flex min-h-9 items-center gap-1 rounded-pill border px-3 text-[12px] font-semibold no-underline transition-colors ${
              active ? "border-volt text-volt" : "border-hairline-strong text-muted hover:border-volt hover:text-volt"
            }`}
          >
            {column.label}
            {active && <SortArrow dir={view.sort.dir} />}
          </Link>
        );
      })}
    </nav>
  );
}

/** The small label a fact carries below `md`, where there is no header row. */
function CellLabel({ children }: { children: string }) {
  return <span className="block text-[9px] uppercase tracking-eyebrow text-faint md:hidden">{children}</span>;
}

const CELL = "min-w-0 text-[12px] tabular-nums text-bone md:text-small";

export function PlayersTable({
  players,
  view,
  actingId,
  photoUrls,
  segmentLabel,
}: {
  players: DirectoryPlayer[];
  view: View;
  actingId: string;
  photoUrls: Map<string, string | null>;
  segmentLabel: string;
}) {
  const showCheckout = view.segment === "unfinished-checkout";
  const sortColumn = SORTABLE.find((column) => column.key === view.sort.key)?.label ?? t.columns.player;

  return (
    <div className="lifted overflow-hidden rounded-card">
      <table
        role="table"
        data-testid="players-table"
        className="block w-full md:grid md:grid-cols-[minmax(0,1fr)_repeat(5,max-content)_auto] md:gap-x-6"
      >
        <caption className="sr-only">
          {t.tableCaption
            .replace("{segment}", segmentLabel)
            .replace("{column}", sortColumn)
            .replace("{direction}", directionWord(view.sort))}
        </caption>
        <thead role="rowgroup" className="hidden md:contents">
          <tr role="row" className="border-b border-hairline px-5 md:col-span-full md:grid md:grid-cols-subgrid md:gap-x-6">
            <SortHeader column={SORTABLE[0]!} view={view} />
            <SortHeader column={SORTABLE[1]!} view={view} />
            <SortHeader column={SORTABLE[2]!} view={view} align="right" />
            <SortHeader column={SORTABLE[3]!} view={view} />
            <SortHeader column={SORTABLE[4]!} view={view} align="right" />
            <th role="columnheader" scope="col" className="py-3 text-right text-[10px] font-normal uppercase tracking-eyebrow text-muted">
              {t.columns.bookings}
            </th>
            <td aria-hidden className="py-3" />
          </tr>
        </thead>
        <tbody role="rowgroup" className="block md:contents">
          {players.map((player) => {
            const photo = photoUrls.get(player.id) ?? null;
            const credits = creditsFromCzk(player.balanceCzk);
            return (
              <tr
                key={player.id}
                role="row"
                data-testid="admin-player-row"
                data-player-id={player.id}
                className="relative grid grid-cols-4 gap-x-2 gap-y-3 border-t border-hairline px-4 py-3 transition-colors first:border-t-0 focus-within:bg-surface-seg hover:bg-surface-seg md:col-span-full md:grid-cols-subgrid md:items-center md:gap-x-6 md:gap-y-0 md:px-5"
              >
                <td role="cell" className="col-span-3 min-w-0 md:col-span-1">
                  <div className="flex min-w-0 items-center gap-3">
                    <PlayerTile nickname={player.nickname} photoUrl={photo} />
                    <div className="min-w-0">
                      <div className="flex min-w-0 flex-wrap items-baseline gap-x-2 gap-y-1">
                        {player.playerNumber !== null && (
                          <span
                            data-testid="admin-player-number"
                            title={strings.admin.playerNumberTitle}
                            className="shrink-0 text-[11px] tabular-nums text-faint"
                          >
                            {player.playerNumber}
                          </span>
                        )}
                        {/* Nickname and email are free text; JSX escapes both. */}
                        <Link
                          href={`/admin/players/${player.id}`}
                          data-testid="admin-player-link"
                          className="min-w-0 truncate text-body font-bold text-white no-underline after:absolute after:inset-0 after:content-['']"
                        >
                          {player.nickname}
                        </Link>
                        <PlayerTags player={player} />
                        {player.id === actingId && (
                          /* Your own row. Rights cannot be changed on yourself —
                             `set_player_admin` refuses it — and the tag says so. */
                          <span
                            data-testid="admin-rights-self"
                            title={strings.admin.adminSelfNote}
                            className="shrink-0 rounded-pill border border-hairline-strong px-2 py-[2px] text-[9px] uppercase leading-normal tracking-eyebrow text-faint"
                          >
                            {t.tags.you}
                          </span>
                        )}
                      </div>
                      <div className="mt-[2px] truncate text-[12px] text-muted">
                        {[player.email ?? strings.admin.noEmail, player.phone].filter(Boolean).join("  ·  ")}
                      </div>
                      {showCheckout && player.unfinishedCheckoutAt && (
                        <div data-testid="player-checkout-started" className="mt-[2px] text-[12px] text-warn">
                          {t.checkoutStarted.replace("{date}", formatDate(player.unfinishedCheckoutAt))}
                        </div>
                      )}
                    </div>
                  </div>
                </td>

                <td role="cell" className={CELL}>
                  <CellLabel>{t.columns.joined}</CellLabel>
                  {player.kind === "shadow" ? (
                    <span className="text-faint">{t.noGameYet}</span>
                  ) : (
                    /* Round 41: when the account was made, to the minute. */
                    <time dateTime={player.createdAt} data-testid="player-joined" className="block text-bone">
                      {formatDate(player.createdAt)}
                      <span className="block text-[11px] text-faint">{formatTime(player.createdAt)}</span>
                    </time>
                  )}
                </td>

                <td role="cell" data-testid="player-games-played" className={`${CELL} md:text-right`}>
                  <CellLabel>{t.columns.played}</CellLabel>
                  <span className={player.gamesPlayed > 0 ? "font-semibold text-white" : "text-faint"}>
                    {player.gamesPlayed}
                  </span>
                </td>

                <td role="cell" className={CELL}>
                  <CellLabel>{t.columns.lastGame}</CellLabel>
                  {player.lastGameAt ? (
                    <time dateTime={player.lastGameAt} data-testid="player-last-game">
                      {formatDate(player.lastGameAt)}
                    </time>
                  ) : (
                    <span className="text-faint">{t.noGameYet}</span>
                  )}
                </td>

                <td role="cell" className="col-start-4 row-start-1 min-w-0 self-center text-right md:col-start-auto md:row-start-auto">
                  <span
                    data-testid="player-balance"
                    data-balance={player.balanceCzk}
                    data-credits={credits}
                    className={`whitespace-nowrap text-small font-semibold tabular-nums ${credits > 0 ? "text-volt" : "text-faint"}`}
                  >
                    {creditsLabel(credits, "en", strings)}
                  </span>
                </td>

                <td role="cell" data-testid="player-bookings" className={`${CELL} md:text-right`}>
                  <CellLabel>{t.columns.bookings}</CellLabel>
                  <span className="text-muted md:text-bone">{player.bookingCount}</span>
                </td>

                <td role="cell" className="hidden md:block">
                  {/* The row's own way in, kept for the old hook. The stretched
                      name link already covers the row, so this one stays out
                      of the tab order and the reading order. */}
                  <Link
                    href={`/admin/players/${player.id}`}
                    data-testid="admin-player-edit"
                    tabIndex={-1}
                    aria-hidden
                    className="relative flex h-6 w-6 items-center justify-center text-faint no-underline transition-colors hover:text-volt"
                  >
                    <svg viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3.5 2 6.5 5 3.5 8" />
                    </svg>
                  </Link>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
