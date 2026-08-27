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
      /*
        HORIZONTAL, WITH THE TITLE DEMOTED TO AN EYEBROW (redesign v2, round
        3, p01).

        It was a centred column: a display-sized "Player of the month", then
        the face, then the name at 19px. The frame inverts that hierarchy —
        the label is a small volt eyebrow at the top left, the NAME is the
        display element, and the face sits at the right. Which is the correct
        reading: "Player of the month" is the same three words every month and
        the name is the only thing on the panel that changes.

        `lifted rounded-card` for the edge, as on the two panels beside it.
      */
      className="lifted flex min-w-[270px] flex-1 items-center justify-between gap-4 self-stretch rounded-card p-[22px]"
    >
      {player ? (
        <>
          <div className="min-w-0">
            {/* `eyebrow` — the one uppercase style in the product (ruling B),
                and the frame draws this one in volt rather than grey. */}
            <h3 className="m-0 text-eyebrow font-semibold uppercase text-volt">
              {t.landing.potmTitle}
            </h3>
            {/*
              THE NAME CARRIES THE DISPLAY FACE NOW. `page-title` is the step
              p01 sets it at, and it truncates rather than wraps: a nickname
              long enough to wrap would push the face out of the row, and a
              single line with an ellipsis is the §2.13 answer.
            */}
            <div
              data-testid="potm-nickname"
              className="mt-1 truncate font-display text-page-title uppercase text-white"
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

              It survives the reshuffle by the same 2026-08-10 amendment to
              ruling J that kept the panel; the frame does not draw it.
            */}
            {player.pitchHours > 0 && (
              <div data-testid="potm-hours" className="mt-1 text-small text-muted">
                {t.landing.potmHours.replace("{hours}", String(player.pitchHours))}
              </div>
            )}
          </div>

          {/*
            `shrink-0`, so the face keeps its diameter when the name is long —
            a flex item with an image in it will otherwise give up width
            before the text does.

            NON-CLICKABLE (R8). The public player profile is quarantined, so
            this is a portrait and not a door.
          */}
          <span
            data-testid="potm-avatar"
            className="flex h-[72px] w-[72px] shrink-0 items-center justify-center overflow-hidden rounded-pill border-2 border-volt bg-surface-avatar text-[26px] font-bold text-volt"
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
        </>
      ) : (
        /*
          NO PICK KEEPS THE TITLE, because with no name there is nothing else
          to say what the panel is. The eyebrow-plus-name arrangement collapses
          to a heading and a sentence.
        */
        <div>
          <h3 className="m-0 text-eyebrow font-semibold uppercase text-volt">
            {t.landing.potmTitle}
          </h3>
          <p className="m-0 mt-2 max-w-[240px] text-[13px] text-muted">
            {t.landing.potmEmpty}
          </p>
        </div>
      )}
    </div>
  );
}
