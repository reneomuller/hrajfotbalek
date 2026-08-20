import Link from "next/link";
import { AdminRightsButton } from "@/components/admin/AdminRightsButton";
import { GrantCreditForm } from "@/components/admin/GrantCreditForm";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listPlayers } from "@/lib/admin/queries";
import { filterPlayers } from "@/lib/admin/playerSearch";
import { initials } from "@/lib/roster/initials";
import { formatCzk } from "@/lib/format";
import { ExportCsvLink } from "@/components/admin/ExportCsvLink";
import { strings } from "@/lib/strings";

export const metadata = { title: strings.admin.playersTitle };

export const dynamic = "force-dynamic";

/**
 * The player list: identities, wallets, and the two money/identity corrections.
 *
 * Balances are `SUM(delta_czk)` computed at read time. The ledger is
 * append-only and is the authority — a stored balance column would be a second
 * source of truth, and the first time the two disagreed the ledger would still
 * be right.
 */
export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  // Whose session is acting. Used only to decide which row renders no rights
  // control — `set_player_admin` refuses a self-change on its own.
  const [acting, players] = await Promise.all([requireAdmin(), listPlayers()]);

  /*
   * THE SEARCH IS A GET FORM AND A `?q=`, not client state.
   *
   * Same decision the day filter and the profile tabs make, for the same
   * reasons: the result is shareable, the back button behaves, and the page
   * costs no JavaScript. It also means the filtering happens where the data
   * already is, on the server, rather than shipping the whole roster to a
   * component to hide most of it.
   */
  const query = searchParams ? await searchParams : {};
  const raw = query.q;
  const q = (Array.isArray(raw) ? raw[0] : raw) ?? "";
  const shown = filterPlayers(players, q, (player) => player.phone);

  return (
    <>
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <h2 className="m-0 font-display text-title uppercase tracking-wide text-white">
          {strings.admin.playersTitle}
        </h2>
        {/*
          THE MERGE LINK IS GONE (round 11). Merging existed to repair the
          shadow-player flow, and the flow is gone: guests hold seats without
          creating identities, so there is nothing new to merge. `merge_players`
          survives as an RPC with no UI, for the split identities that already
          exist — a repair is not deleted because its button was.
        */}
        <ExportCsvLink href="/admin/players/export" testId="export-players" />
      </div>

      {/*
        THE SEARCH, styled as the reference draws it: one volt-outlined field,
        full width, sitting directly under the heading it filters.

        `type="search"` rather than `text` — it brings the platform's own clear
        affordance and the right keyboard, and on iOS a search field in a form
        gets a "Search" return key rather than "Go".
      */}
      <form
        method="get"
        role="search"
        data-testid="player-search"
        className="mt-5 flex gap-2"
      >
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
            href="/admin/players"
            data-testid="player-search-clear"
            className="flex shrink-0 items-center rounded-control border border-hairline-strong px-4 text-small font-semibold text-muted no-underline transition-colors hover:border-volt hover:text-volt"
          >
            {strings.admin.playerSearchClear}
          </Link>
        )}
      </form>

      {q !== "" && (
        <p data-testid="player-search-count" className="mt-2 mb-0 text-small text-muted">
          {strings.admin.playerSearchCount
            .replace("{shown}", String(shown.length))
            .replace("{total}", String(players.length))}
        </p>
      )}

      {shown.length === 0 ? (
        <p data-testid="players-empty" className="mt-8 text-small text-faint">
          {q === ""
            ? strings.admin.playersEmpty
            : strings.admin.playerSearchEmpty.replace("{q}", q)}
        </p>
      ) : (
        <ul className="mt-5 list-none space-y-2 p-0">
          {shown.map((player) => (
            <li
              key={player.id}
              data-testid="admin-player-row"
              /*
                STACKED, WITH THE MARK LEADING (admin restyle).

                The row was one `flex-wrap` line carrying a name, an email, a
                booking count, a balance, a rights control and a credit form.
                At 390px those six wrapped into five ragged lines with no
                visible grouping, and the two CONTROLS ended up interleaved
                with the facts — so the thing you could accidentally tap sat
                between two things you were only reading.

                The reference leads each result with an initials tile. It reads
                as a person rather than a record, and it gives the eye a fixed
                left edge to run down a long list against.
              */
              className="lifted flex flex-wrap items-start gap-x-4 gap-y-3 rounded-card px-4 py-4"
            >
              {/* The tile. `aria-hidden` — the nickname is right beside it. */}
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-control border border-hairline-volt bg-volt/[.08] text-body font-bold text-volt"
              >
                {initials(player.nickname)}
              </span>

              <div className="min-w-[160px] flex-1">
                {/* Nickname and email are free text; JSX escapes both. */}
                <div className="flex items-baseline gap-2">
                  {/* REQ-ADMIN-001 — the row opens the player. The list answers
                      "who is here and what do they owe"; the page answers "who
                      is this person", which is a different question asked at a
                      different moment. */}
                  <Link
                    href={`/admin/players/${player.id}`}
                    data-testid="admin-player-link"
                    className="text-body-lg font-bold text-white no-underline"
                  >
                    {player.nickname}
                  </Link>
                  {player.isShadow && (
                    <span className="rounded-pill border border-hairline-strong px-2 py-[2px] text-[9px] uppercase tracking-eyebrow text-muted">
                      {strings.admin.shadowTag}
                    </span>
                  )}
                  {player.isSeed && (
                    <span className="rounded-pill border border-hairline-strong px-2 py-[2px] text-[9px] uppercase tracking-eyebrow text-muted">
                      {strings.admin.seedTag}
                    </span>
                  )}
                  {player.isAdmin && (
                    <span className="rounded-pill px-2 py-[2px] text-[9px] uppercase tracking-eyebrow text-volt">
                      {strings.admin.adminTag}
                    </span>
                  )}
                </div>
                <div className="mt-[2px] truncate text-small text-muted">
                  {player.email ?? strings.admin.noEmail}
                </div>

                {/* The two figures ride with the identity rather than being
                    two more wrapping columns. */}
                <div className="mt-2 flex flex-wrap items-baseline gap-x-4 gap-y-1">
                  <span className="text-small text-muted">
                    {strings.admin.bookingsLabel} {player.bookingCount}
                  </span>
                  <span
                    data-testid="player-balance"
                    data-balance={player.balanceCzk}
                    className="text-small font-semibold text-volt"
                  >
                    {strings.admin.balanceLabel} {formatCzk(player.balanceCzk)}
                  </span>
                </div>
              </div>

              {/* THE CONTROLS, on their own full-width line below everything
                  they act on — so nothing tappable sits between two things
                  being read. */}
              <div className="flex w-full flex-wrap items-center gap-x-5 gap-y-2 border-t border-hairline pt-3">
                {player.id === acting.id ? (
                  /* The acting admin's own row. Stated rather than left blank:
                     an admin who finds no button where every other row has one
                     will otherwise assume the panel is broken. */
                  <span
                    data-testid="admin-rights-self"
                    className="text-[10px] uppercase tracking-eyebrow text-faint"
                  >
                    {strings.admin.adminSelfNote}
                  </span>
                ) : (
                  <AdminRightsButton playerId={player.id} isAdmin={player.isAdmin} />
                )}

                <GrantCreditForm playerId={player.id} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
