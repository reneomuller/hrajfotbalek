import { initials } from "@/lib/roster/initials";
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
}: {
  players: RosterAvatar[];
  /** Nickname to ring as the viewer's own, if present. */
  highlight?: string | null;
  /** Beyond this, a "+N" chip stands in for the tail. */
  max?: number;
  size?: "default" | "slim";
  /**
   * Storage origin, for building the public object URL. Passed in rather than
   * read from `process.env` here, so this component stays renderable in
   * isolation; when it is absent every avatar falls back to initials, which is
   * the correct degradation rather than a broken image.
   */
  supabaseUrl?: string;
}) {
  const t = await getStrings();
  const shown = players.slice(0, max);
  const overflow = players.length - shown.length;
  const dim =
    size === "slim" ? "h-[26px] w-[26px] text-[11px]" : "h-[34px] w-[34px] text-[13px]";

  return (
    <div className="flex flex-wrap items-center gap-y-[6px]">
      {shown.map((player, i) => {
        const isYou = highlight != null && player.nickname === highlight;
        const photo = supabaseUrl ? avatarUrl(supabaseUrl, player.photoPath) : null;

        return (
          <span
            key={`${player.nickname}-${i}`}
            title={isYou ? `${player.nickname} — ${t.games.waitlistYou}` : player.nickname}
            data-testid={isYou ? "avatar-you" : "avatar"}
            className={`-ml-2 flex items-center justify-center overflow-hidden rounded-full border-2 font-condensed font-bold ${dim} ${
              isYou
                ? "border-volt bg-surface-avatar text-volt shadow-volt-glow"
                : `border-surface-raised bg-surface-avatar ${
                    i % 3 === 0 ? "text-volt" : "text-bone"
                  }`
            }`}
          >
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
            ) : (
              initials(player.nickname, t)
            )}
          </span>
        );
      })}

      {overflow > 0 && (
        <span
          className={`-ml-2 flex items-center justify-center rounded-full border-2 border-surface-raised bg-surface-avatar font-mono text-muted ${dim}`}
        >
          +{overflow}
        </span>
      )}
    </div>
  );
}
