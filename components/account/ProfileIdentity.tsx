import { PhotoUpload } from "@/components/account/PhotoUpload";
import { initials } from "@/lib/roster/initials";
import { avatarUrl } from "@/lib/storage/avatar";
import { DATE_LOCALE } from "@/lib/games/days";
import type { Locale } from "@/lib/i18n/locales";
import type { Strings } from "@/lib/strings";

/**
 * Cover, face, name, meta — the top of a profile.
 *
 * BUILT AGAINST THE REFERENCE the owner supplied, with two adaptations, both
 * forced by what this schema holds rather than chosen:
 *
 *   1. ~~THE COVER IS A GRADIENT, NOT A PHOTOGRAPH. The reference puts a shot
 *      of a game behind the name. There is no cover-photo column and this is a
 *      front-end round, so the options were a token gradient, a borrowed venue
 *      photo, or nothing. A venue photo would be a picture of a pitch this
 *      player may never have played on, presented as if it were theirs — an
 *      invented fact under someone's face. The gradient reads as a deliberate
 *      band; a wrong photograph reads as a lie.~~
 *
 *      **REVERSED 2026-08-20 (redesign v2, round 6).** The reasoning was
 *      sound and its PREMISE changed: it assumed the only photograph available
 *      was some particular venue's. R6 introduced `pitch-default.jpg` as the
 *      product's one generic pitch, used identically behind every list card
 *      and every game header — so it is furniture, like the pitch canvas
 *      already behind this page, and not a claim about where this player has
 *      played. The objection stands in full against a VENUE photo here, and
 *      that is still not built: there is no cover-photo column and none is
 *      added.
 *
 *      p10 and p11 both draw the photographic cover, and the audit lists it as
 *      a delta from v1.3 rather than as a request.
 *
 *   2. THE META LINE IS COUNTRY, NOT CITY. The reference says "Bangkok". The
 *      schema holds `players.country` as an ISO 3166 code and nothing finer.
 *
 * A player with neither country nor a formattable join date shows the meta line
 * with whatever half exists, and no line at all if neither does — a lone
 * separator under a name is worse than a missing sentence.
 *
 * THE AVATAR OVERLAPS THE COVER'S LOWER EDGE, which is the reference's
 * composition and is doing real work: it ties the two bands into one object, so
 * the identity reads as a header rather than as a picture with a caption under
 * it. `PhotoUpload` still wraps it — the avatar has been the edit affordance
 * since the photo upload was buried as a caption and nobody found it.
 */
export function ProfileIdentity({
  nickname,
  photoPath,
  coverPath,
  photoVersion,
  countryName,
  createdAt,
  locale,
  t,
}: {
  nickname: string;
  photoPath: string | null;
  /**
   * The player's own cover key (round 8, item 10).
   *
   * THREE STATES, AND THEY ARE DIFFERENT: `undefined` means the column does
   * not exist yet (migration 20260820140000 unapplied) and the control is
   * hidden; `null` means the column exists and no cover is set, so the default
   * pitch shows WITH the control; a string is their own picture.
   */
  coverPath?: string | null;
  /** Changes when the photo does, so a re-upload is not served from cache. */
  photoVersion: string | null;
  /** Already resolved to the reader's language, or null when unset. */
  countryName: string | null;
  createdAt: string;
  locale: Locale;
  t: Strings;
}) {
  const photoUrl = avatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    photoPath,
    photoVersion,
  );
  const coverSupported = coverPath !== undefined;
  const coverUrl = avatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    coverPath ?? null,
    photoVersion,
  );

  /*
   * "Aug 2026", IN THE READER'S LANGUAGE, from `Intl` rather than from a
   * translated month table. Czech and Russian both decline month names and
   * both abbreviate differently from English; a hand-written list would be
   * three lists to maintain and one of them would be wrong.
   *
   * `DATE_LOCALE` maps `en` to `en-GB`, which is the same mapping the day
   * headings and the calendar cells use — so a profile and a fixture list
   * never disagree about what a month is called.
   *
   * An unparseable date yields null rather than "Invalid Date", which is a
   * string this product should never render.
   */
  const joined = Number.isNaN(Date.parse(createdAt))
    ? null
    : new Intl.DateTimeFormat(DATE_LOCALE[locale], {
        month: "short",
        year: "numeric",
      }).format(new Date(createdAt));

  const meta = [
    countryName,
    joined ? t.profile.memberSince.replace("{date}", joined) : null,
  ].filter((part): part is string => part !== null);

  return (
    <section data-testid="profile-identity" className="-mt-8">
      {/*
        FULL BLEED. The band runs edge to edge while everything under it keeps
        the page gutter, which is what makes it read as a cover rather than as
        a wide card. `-mx-gutter` rather than a viewport-width trick: the page
        is `max-w-shell` centred, so a `100vw` band would break out of the shell
        on a desktop and sit under the header's own margins.

        THE PHOTOGRAPH, AND THE SAME FADE THE GAME HEADER USES. R6's single
        default pitch backs the band and the scrim ramps to `ink` at full
        opacity by the bottom — the page's own ground, so the cover ends
        without a seam and the avatar overlapping it has flat surface to sit
        against. It replaces `from-volt/[.10] via-surface-raised to-ink`; see
        the reversal note in this file's header for why the gradient existed
        and why it no longer needs to.

        `to-92%` -> `to-90%` (R19, round 8): 92 is off Tailwind's 5% stop scale
        and generated no stop, so the cover reached `ink` only at its own edge.

        `aria-hidden`, and `alt=""` on the image: this is scenery. Announcing
        a stock pitch above someone's own name and stats is noise on the one
        page where a screen-reader user is reading about themselves.
      */}
      <div className="relative -mx-gutter h-[132px] overflow-hidden">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={coverUrl ?? "/pitch-default.jpg"}
          alt=""
          aria-hidden
          data-testid="profile-cover-photo"
          data-own={coverUrl ? "true" : "false"}
          className="h-full w-full object-cover object-center"
        />
        <span
          aria-hidden
          data-testid="profile-cover-scrim"
          className="absolute inset-0 bg-gradient-to-b from-ink/[.45] via-ink/[.70] via-50% to-ink to-90%"
        />

        {/*
          THE COVER IS CHANGED THE WAY THE AVATAR IS (round 8, item 10) — same
          component, same bucket, same limits, same claim-the-path-first
          ordering. What differs is only the crop ratio and which RPC records
          it.

          THE CONTROL IS A CORNER BUTTON, not the whole band. The avatar can be
          the control because tapping a 80px circle has one obvious meaning; a
          full-width band that opens a file picker would swallow taps meant for
          the page.

          RENDERED ONLY WHEN THE COLUMN EXISTS. `cover_path` is `undefined` on
          a database without migration 20260820140000 and `null` with it — so
          an unmigrated deployment shows the default pitch and NO control,
          rather than a control whose RPC 404s.
        */}
        {coverSupported && (
          <PhotoUpload
            target="cover"
            hasPhoto={Boolean(coverUrl)}
            className="absolute bottom-2 right-gutter"
          >
            <span
              data-testid="cover-upload-control"
              className="flex h-9 items-center gap-2 rounded-pill border border-hairline-strong bg-surface-overlay px-3 text-small font-semibold text-bone"
            >
              {t.account.coverChange}
            </span>
          </PhotoUpload>
        )}
      </div>

      {/*
        `relative`, AND IT IS LOad-BEARING. The cover above became a positioned
        element when it gained the scrim, and a positioned element paints above
        its non-positioned siblings whatever the source order says — so the
        cover painted OVER this row and sliced the nickname in half along the
        band's bottom edge. Two positioned siblings fall back to source order,
        which puts the identity on top where it belongs.
      */}
      <div className="relative -mt-10 flex items-end gap-4">
        <PhotoUpload hasPhoto={Boolean(photoPath)}>
          <span
            data-testid="account-avatar"
            className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-full border-2 border-volt bg-surface text-2xl font-extrabold text-volt"
          >
            {photoUrl ? (
              /* A public-bucket URL at 80px. `next/image` would proxy it
                 through the optimizer for no benefit and bill a transform per
                 avatar. */
              // eslint-disable-next-line @next/next/no-img-element
              <img src={photoUrl} alt="" className="h-full w-full object-cover" />
            ) : (
              initials(nickname, t)
            )}
          </span>
        </PhotoUpload>

        {/* `pb-1` lifts the text off the avatar's baseline: an 80px circle and
            a 22px line share a bottom edge geometrically and look misaligned
            optically, because the circle's ink stops before its box does. */}
        <div className="flex min-w-0 flex-col gap-[2px] pb-1">
          <h1
            data-testid="account-nickname"
            className="m-0 truncate text-[26px] font-bold leading-tight text-white"
          >
            {nickname}
          </h1>
          {meta.length > 0 && (
            <p data-testid="profile-meta" className="m-0 truncate text-small text-muted">
              {meta.join(" · ")}
            </p>
          )}
        </div>
      </div>
    </section>
  );
}
