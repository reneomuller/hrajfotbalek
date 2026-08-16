import { getStrings } from "@/lib/i18n/server";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";

/**
 * Player of the Month (§6, REQ-HOME-006), the third community panel.
 *
 * PHOTO IF THERE IS ONE, INITIALS OTHERWISE — and the initials case is not a
 * degraded state. The pick is a recognition of how someone plays, not of
 * whether they uploaded a picture, so a player with no photo has to look
 * deliberately chosen rather than half-rendered.
 *
 * NO PICK RENDERS AN INVITATION rather than an empty frame. A fresh database
 * has no pick, and "Nobody picked yet — could be you" is a better empty state
 * than a blank circle, on a panel whose whole job is to say the crew notices
 * people.
 *
 * Only the nickname and the photo path reach here. Both are already public
 * wherever this player appears on a roster (§4a), so this panel discloses
 * nothing new about them.
 */
export async function PlayerOfMonthPanel({
  player,
  supabaseUrl,
}: {
  player: { nickname: string; photoPath: string | null; pitchHours: number } | null;
  supabaseUrl?: string;
}) {
  const t = await getStrings();
  const photo = supabaseUrl && player ? avatarUrl(supabaseUrl, player.photoPath) : null;

  return (
    <div
      data-testid="potm-panel"
      /*
        `self-stretch` so the box matches the community panel beside it. The
        row is `items-start`, which sizes each panel to its own contents — and
        this one holds a name and a face against a panel holding two numbers,
        a sentence and two buttons, so it sat short with a pool of air beneath
        it. Its contents stay centred within whatever height it is given, the
        same way the stats box handled it.
      */
      className="flex min-w-[270px] flex-1 flex-col items-center justify-center self-stretch rounded-[20px] border border-hairline-volt bg-surface p-[22px] text-center"
    >
      <h3 className="m-0 mb-4 font-display text-community-title text-white">
        {t.landing.potmTitle}
      </h3>

      {player ? (
        <>
          <span
            data-testid="potm-avatar"
            className="flex h-[72px] w-[72px] items-center justify-center overflow-hidden rounded-full border-2 border-volt bg-surface-avatar text-[26px] font-bold text-volt"
          >
            {photo ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={photo}
                alt=""
                data-testid="potm-photo"
                className="h-full w-full object-cover"
              />
            ) : (
              initials(player.nickname, t)
            )}
          </span>
          <div
            data-testid="potm-nickname"
            className="mt-3 text-[19px] font-bold text-bone"
          >
            {player.nickname}
          </div>

          {/*
            THE STAT THAT TURNS A PICK INTO A REASON. A name alone says
            somebody chose them; hours on the pitch says why, and it is the
            one number this panel can state that nobody has to take on trust.

            Rendered only above zero: "0 h on the pitch this month" under a
            Player of the Month is a worse sentence than no sentence, and it
            is reachable — a pick made early in a month, or before anyone has
            marked attendance.
          */}
          {player.pitchHours > 0 && (
            <div data-testid="potm-hours" className="mt-1 text-small text-muted">
              {t.landing.potmHours.replace("{hours}", String(player.pitchHours))}
            </div>
          )}
        </>
      ) : (
        <p className="m-0 max-w-[240px] text-[13px] text-muted">
          {t.landing.potmEmpty}
        </p>
      )}
    </div>
  );
}
