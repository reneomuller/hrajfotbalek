import Link from "next/link";
import { initials } from "@/lib/roster/initials";
import { guestLabel, isAnonymousGuest } from "@/lib/roster/guests";
import { GuestIcon } from "@/components/game/GuestIcon";
import { getStrings } from "@/lib/i18n/server";
import { avatarUrl } from "@/lib/storage/avatar";
import type { RosterAvatar } from "@/lib/games/queries";

/**
 * Overlapping avatars, from the design reference's `data-roster` block: 34px
 * circles, `margin-left:-8px`, a 2px `#0D0D0D` ring so they read as a stack,
 * and every third initials avatar in volt to break the monotony.
 *
 * PHOTO WHEN THERE IS ONE, INITIALS WHEN THERE IS NOT — and the initials case
 * is the ORDINARY one, not a failure. Most players will never upload a photo,
 * and Phase 2 added an option rather than an expectation (REQ-PROF-004).
 *
 * PII: nickname and photo path only. Both come from `game_roster_public`,
 * which projects those two plus booking status and nothing else — no
 * player_id, no email, no phone. Never render this from `bookings` or
 * `waitlist` directly. `nickname` is player-supplied free text interpolated as
 * a JSX child, which React escapes; the photo path is CHECK-constrained at the
 * column and reaches an `src` attribute, which React escapes for that
 * position.
 *
 * NO CACHE-BUSTING SUFFIX HERE, and that is a consequence of the ruling rather
 * than an oversight. `avatarUrl` accepts an `updatedAt` to defeat the CDN
 * cache on a re-upload, because the object key is derived from the player id
 * and never changes. §4a admits `photo_path` to the roster view AND NO OTHER
 * COLUMN, so no timestamp is available here. The cost is bounded and one-
 * directional: after replacing their photo a player may see the old one on a
 * roster until the cache expires; on their own account page it updates at
 * once; and nothing incorrect is ever shown about anybody else.
 *
 * GUESTS NEVER CARRY A PHOTOGRAPH, and they arrive last (round 11). A guest
 * has no account, so there is nothing to show — an anonymous one gets the
 * silhouette rather than initials taken from the word "Guest", which would put
 * a row of identical `GU` badges on a card. A pre-round-11 shadow player has a
 * real name and keeps its monogram; what it loses is nothing, because it never
 * had a photo either.
 *
 * The ORDER is `sortRoster`'s and is applied by the loaders in
 * `lib/games/queries.ts`, not here: this component renders what it is handed,
 * and a component that re-sorted its input would make the list page and the
 * detail page disagree about which faces the `+N` chip swallowed.
 *
 * A PARTY GUEST CARRIES NO NICKNAME AT ALL — the view returns null and names
 * the owner in `guestOf` instead — so the `highlight` comparison below can
 * never match one and hand somebody else's guest the viewer's own ring.
 *
 * `highlight` marks the viewer's own entry with a volt ring. It is a DISPLAY
 * decision made by the caller from its own session — the views project no
 * player id, deliberately, so "which of these is me" can only be answered by
 * matching the viewer's own nickname. Fine for a ring, and not fine for
 * anything that mattered.
 */
export async function AvatarRow({
  players,
  highlight,
  max = 12,
  size = "default",
  supabaseUrl,
  linkProfiles = false,
}: {
  players: RosterAvatar[];
  /** Nickname to ring as the viewer's own, if present. */
  highlight?: string | null;
  /** Beyond this, a "+N" chip stands in for the tail. */
  max?: number;
  /**
   * `card` is the canonical game card's stack (§2.1): 28px, three faces then
   * `+N`. It is its own size rather than a reuse of `slim` because §2.1 fixes
   * the number, and a stack whose diameter drifts with the caller is a card
   * whose height drifts with it.
   */
  size?: "default" | "slim" | "card";
  /**
   * Storage origin, for building the public object URL. Passed in rather than
   * read from `process.env` here, so this component stays renderable in
   * isolation; when it is absent every avatar falls back to initials, which is
   * the correct degradation rather than a broken image.
   */
  supabaseUrl?: string;
  /**
   * Whether a face opens its player's public profile (round 14, item 13).
   *
   * OFF BY DEFAULT, so every existing caller keeps its behaviour and the two
   * that should link say so. The waiting list in particular must NOT: those
   * are real people, but the surface is a queue, and tapping a face to leave
   * the page is not what anybody means there.
   */
  linkProfiles?: boolean;
}) {
  const t = await getStrings();
  const shown = players.slice(0, max);
  const overflow = players.length - shown.length;
  const dim = {
    slim: "h-[26px] w-[26px] text-[11px]",
    card: "h-7 w-7 text-[11px]",
    default: "h-[34px] w-[34px] text-[13px]",
  }[size];

  return (
    <div className="flex flex-wrap items-center gap-y-[6px]">
      {shown.map((player, i) => {
        const isYou =
          highlight != null && player.nickname != null && player.nickname === highlight;
        const label = guestLabel(player, t);
        const photo =
          supabaseUrl && !player.isGuest ? avatarUrl(supabaseUrl, player.photoPath) : null;

        /*
          A REAL PLAYER'S FACE OPENS THEIR PROFILE (round 14, item 13); a
          guest's does not. `linkTo` is null for a guest, for a seat with no
          nickname, and for the waiting list — which passes `plainAvatar`
          rows that are people but whose surface is a QUEUE, where tapping a
          face to leave the page is not what anybody means.
        */
        const linkTo =
          linkProfiles && !player.isGuest && player.nickname
            ? `/player/${encodeURIComponent(player.nickname)}`
            : null;

        /*
          TWO EXPLICIT BRANCHES, not a polymorphic `Tag`. A `const Tag = linkTo
          ? Link : "span"` does not type-check — `LinkProps.href` is required,
          so a spread that MIGHT omit it widens to `string | undefined` and
          fails. Spelling both out costs six lines and keeps the props honest.
        */
        // `key` is NOT in here: React reads it off the element, and passing it
        // through a spread warns and is ignored.
        const key = `${player.guestOf ?? player.nickname ?? "guest"}-${player.guestIndex ?? 0}-${i}`;
        const shared = {
          title: isYou ? `${label} — ${t.games.waitlistYou}` : label,
          "data-guest": player.isGuest ? "true" : undefined,
          "data-testid": isYou ? "avatar-you" : "avatar",
          className: `-ml-2 flex items-center justify-center overflow-hidden rounded-pill border-2 font-bold ${dim} ${
              isYou
                ? "border-volt bg-surface-avatar text-volt"
                : `border-surface-raised bg-surface-avatar ${
                    /*
                      THE VOLT ROTATION SKIPS GUESTS. "Every third initials
                      avatar in volt" is there to break the monotony of a row
                      of faces; spending the accent on a seat nobody can
                      identify makes the anonymous half of the row the loud
                      half.
                    */
                    !player.isGuest && i % 3 === 0 ? "text-volt" : "text-muted"
                  }`
            }`,
        };

        const face = (
          <>
            {photo ? (
              /*
                A plain <img>, not next/image. The bucket is a public Supabase
                origin and these are 34px circles: the optimizer would want a
                remote-pattern allow-list and a round trip through /_next/image
                to resize an already-tiny square.

                `alt` is empty deliberately. The nickname is the element's
                title and is rendered in the lineup list beside this row, so
                announcing it again here is duplication for a screen reader —
                these avatars are decorative next to that list.
              */
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                data-testid="avatar-photo"
                className="h-full w-full object-cover"
                loading="lazy"
              />
            ) : isAnonymousGuest(player) ? (
              <GuestIcon />
            ) : (
              initials(player.nickname ?? "", t)
            )}
          </>
        );

        return linkTo ? (
          <Link key={key} {...shared} href={linkTo} data-linked="true">
            {face}
          </Link>
        ) : (
          <span key={key} {...shared}>
            {face}
          </span>
        );
      })}

      {overflow > 0 && (
        <span
          className={`-ml-2 flex items-center justify-center rounded-pill border-2 border-surface-raised bg-surface-avatar text-muted ${dim}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
