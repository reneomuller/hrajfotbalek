import Link from "next/link";
import { CountryFlag } from "@/components/flags/CountryFlag";
import { PlayerTags } from "@/components/admin/players/PlayerTags";
import { playerKind } from "@/lib/admin/players/segments";
import { countryName } from "@/lib/auth/countries";
import { formatDate, formatTime } from "@/lib/format";
import { initials } from "@/lib/roster/initials";
import { strings } from "@/lib/strings";
import type { Database } from "@/lib/types/database";

type PlayerRow = Database["public"]["Tables"]["players"]["Row"];

const t = strings.admin.playersHub;

/**
 * Who this is (round 42, the admin rebuild): banner, face, name, what kind of
 * account it is, where they are from, when they joined — and how to reach
 * them, which is why an admin opens this page at all.
 *
 * THE OWN-PROFILE COMPOSITION, KEPT (round 7, item 9): a banner with the
 * avatar overlapping its lower edge, so an admin looking at a player and the
 * player looking at themselves see the same arrangement. The banner is the
 * player's own when they uploaded one — the thing "Remove banner" would take
 * away — and the default pitch otherwise.
 *
 * THE NAME IS THE PAGE'S ONE `<h2>`; the rename spec finds it by that role.
 * Email and phone are PII the admin surface is entitled to and nobody else is.
 */
export function PlayerHeader({
  player,
  photoUrl,
  coverUrl,
}: {
  player: PlayerRow;
  photoUrl: string | null;
  coverUrl: string | null;
}) {
  const kind = playerKind({
    auth_user_id: player.auth_user_id,
    deleted_at: player.deleted_at ?? null,
    is_seed: player.is_seed,
  });
  const country = countryName(player.country, "en");
  const skill = player.skill_level ? strings.admin.skillOptions[player.skill_level] : null;

  return (
    <>
      <Link
        href="/admin/players"
        data-testid="admin-player-back"
        className="inline-flex items-center gap-1 text-[11px] uppercase tracking-eyebrow text-muted no-underline transition-colors hover:text-volt"
      >
        <svg aria-hidden viewBox="0 0 10 10" className="h-2.5 w-2.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
          <path d="M6.5 2 3.5 5 6.5 8" />
        </svg>
        {t.backToList}
      </Link>

      <section data-testid="admin-player-header" className="lifted mt-3 overflow-hidden rounded-card">
        <div aria-hidden className="relative h-[112px] overflow-hidden sm:h-[132px]">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={coverUrl ?? "/pitch-default.jpg"}
            alt=""
            data-testid="admin-player-cover"
            data-own={coverUrl ? "true" : "false"}
            className="h-full w-full object-cover object-center"
          />
          <span className="absolute inset-0 bg-gradient-to-b from-ink/[.35] via-ink/[.60] to-surface-raised" />
        </div>

        {/* `relative`, or the positioned banner above paints over this row. */}
        <div className="relative -mt-10 flex items-end gap-4 px-4 sm:px-5">
          <span
            data-testid="admin-player-avatar"
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-pill border-2 border-volt bg-surface-avatar text-2xl font-extrabold text-volt"
          >
            {photoUrl ? (
              /* Plain <img>, like every other avatar in this product. */
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" data-testid="admin-player-photo" className="h-full w-full object-cover" />
            ) : (
              initials(player.nickname, strings)
            )}
          </span>

          <div className="flex min-w-0 flex-col gap-1 pb-1">
            {/* Nickname is free text; JSX escapes it. */}
            <h2 className="m-0 flex min-w-0 items-baseline gap-2 text-[26px] font-bold leading-tight text-white">
              {/* The permanent number, the quietest thing in the heading — and
                  inside it, so a screen reader reads "No. 14, Oliver" as one. */}
              {player.player_number !== undefined && (
                <span
                  data-testid="admin-player-number"
                  title={strings.admin.playerNumberTitle}
                  className="shrink-0 text-[13px] font-semibold tabular-nums text-faint"
                >
                  {strings.admin.playerNumber}
                  {player.player_number}
                </span>
              )}
              <span className="truncate">{player.nickname}</span>
            </h2>
            <PlayerTags
              player={{
                kind,
                isAdmin: player.is_admin,
                isOrganizer: Boolean(player.is_organizer),
                isBanned: Boolean(player.banned_at),
              }}
            />
          </div>
        </div>

        <div className="px-4 pb-5 pt-4 sm:px-5">
          <ul className="m-0 flex list-none flex-wrap items-center gap-x-3 gap-y-1 p-0 text-small text-muted">
            {country && (
              <li data-testid="admin-player-country" className="flex min-w-0 items-center gap-1.5">
                <CountryFlag code={player.country} size="compact" />
                <span className="truncate">{country}</span>
              </li>
            )}
            {skill && <li data-testid="admin-player-skill">{skill}</li>}
            {kind !== "shadow" && (
              <li>
                <time dateTime={player.created_at} data-testid="admin-player-joined" className="tabular-nums">
                  {strings.admin.playerJoined.replace("{date}", `${formatDate(player.created_at)}, ${formatTime(player.created_at)}`)}
                </time>
              </li>
            )}
          </ul>

          <dl
            data-testid="admin-player-contact"
            className="m-0 mt-4 grid gap-3 border-t border-hairline pt-4 sm:grid-cols-2"
          >
            <div className="flex min-w-0 flex-col gap-[2px]">
              <dt className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{strings.admin.contactEmail}</dt>
              <dd
                data-testid="admin-player-email"
                className={`m-0 break-words text-body-lg font-semibold ${player.email ? "text-white" : "text-faint"}`}
              >
                {player.email ?? strings.admin.playerNoEmail}
              </dd>
            </div>
            <div className="flex min-w-0 flex-col gap-[2px]">
              <dt className="text-[10px] uppercase tracking-eyebrow text-volt-dim">{strings.admin.contactPhone}</dt>
              <dd
                data-testid="admin-player-phone"
                className={`m-0 text-body-lg font-semibold tabular-nums ${player.phone ? "text-white" : "text-faint"}`}
              >
                {player.phone ?? strings.admin.contactNone}
              </dd>
            </div>
          </dl>
        </div>
      </section>
    </>
  );
}
