import { PhotoUpload } from "@/components/account/PhotoUpload";
import { avatarUrl } from "@/lib/storage/avatar";
import type { Strings } from "@/lib/strings";

/**
 * The profile's cover photograph (round 9, item 4).
 *
 * WHY IT IS ITS OWN COMPONENT NOW. It lived inside `ProfileIdentity`, which
 * capped it at that block's height — so the photograph stopped above the stats
 * while `p10` and `p11` run it all the way down to the tab row. A backdrop is
 * not part of "identity"; it sits BEHIND identity and stats both, and it can
 * only do that from a layer of its own.
 *
 * ABSOLUTELY POSITIONED, so the two blocks that sit on it keep their normal
 * flow and their own heights. The page gives it a `relative` wrapper; this
 * fills the top of that wrapper and stops where the tabs begin.
 *
 * `-mx-gutter` so the photograph reaches both screen edges while everything on
 * top of it keeps the page gutter — the thing that makes it read as a cover
 * rather than as a wide card.
 *
 * THE SCRIM IS TWO LAYERS, AND THE SECOND ONE IS MEASURED. The ramp carries
 * the photograph down to the page's own ground, as R6(b) requires. The stats
 * band gets a SECOND, LOCAL scrim because the first is not enough there: at
 * 272px the ramp is still comparatively light where the numerals sit, and
 * `e2e/strips-redesign-profile.spec.ts` decodes the rendered pixels and
 * asserts the contrast rather than trusting the gradient. See that spec for
 * the numbers.
 */
export function ProfileCover({
  coverPath,
  editable = false,
  photoVersion,
  t,
}: {
  /**
   * The player's own cover key.
   *
   * THREE STATES, AND THEY ARE DIFFERENT: `undefined` means the column does
   * not exist (migration 20260820140000 unapplied) and the control is hidden;
   * `null` means the column exists and no cover is set, so the default pitch
   * shows WITH the control; a string is their own picture.
   */
  coverPath?: string | null;
  /**
   * Whether to render the "Change cover" control. FALSE unless a caller says
   * otherwise — only the owner's own account page may say otherwise.
   */
  editable?: boolean;
  /** Changes when the photo does, so a re-upload is not served from cache. */
  photoVersion: string | null;
  t: Strings;
}) {
  /*
   * THE CONTROL IS OPT-IN, AND DEFAULTS TO OFF (round 14, item 13).
   *
   * ~~`coverSupported = coverPath !== undefined`~~ — which is a test for
   * whether the COLUMN exists, not for whether the viewer owns the profile. So
   * the first surface to reuse this component for somebody ELSE'S banner — the
   * public profile — rendered a file picker on a stranger's photograph. The
   * public-profile spec caught it, which is the whole reason that spec asserts
   * absences rather than presences.
   *
   * `editable` defaults to FALSE so the mistake cannot repeat: a new caller
   * gets the read-only band unless it explicitly asks for the control, rather
   * than getting the control unless it remembers to suppress it.
   */
  const showControl = editable && coverPath !== undefined;
  const coverUrl = avatarUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    coverPath ?? null,
    photoVersion,
  );

  return (
    <div
      data-testid="profile-cover"
      className="pointer-events-none absolute inset-x-0 top-0 -mx-gutter h-[245px] overflow-hidden"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={coverUrl ?? "/pitch-default.jpg"}
        alt=""
        aria-hidden
        data-testid="profile-cover-photo"
        data-own={coverUrl ? "true" : "false"}
        className="h-full w-full object-cover object-center"
      />

      {/*
        R6(b)'s ramp, ending at `ink` at full opacity before the band does —
        so the tab row and everything under it sit on flat page ground with no
        seam. Stops on the 5% scale (R19): an off-scale value generates no stop
        at all and the gradient silently falls back to evenly-spaced colours.
      */}
      <span
        aria-hidden
        data-testid="profile-cover-scrim"
        className="absolute inset-0 bg-gradient-to-b from-ink/[.40] via-ink/[.55] via-45% to-ink to-95%"
      />

      {/*
        THE STATS BAND'S OWN SCRIM — measured, not guessed.

        The three figures are white on whatever the photograph happens to be
        there, and at 272px the main ramp is still light across that band. This
        is a short local darkening behind the numerals only, rather than
        dimming the whole cover to rescue one row — which is the mistake round
        2 made on the list card and round 7 had to undo.

        Positioned in PERCENTAGES of the cover so it tracks the band if the
        heights change: the stats occupy roughly 73%–92% of the 272px.
      */}
      <span
        aria-hidden
        data-testid="profile-stats-scrim"
        className="absolute inset-x-0 bottom-0 top-[68%] bg-gradient-to-b from-transparent via-ink/[.55] to-ink"
      />

      {/*
        THE CONTROL IS A CORNER BUTTON, not the whole band. The avatar can be
        its own control because tapping an 80px circle has one obvious meaning;
        a full-width band that opens a file picker would swallow taps meant for
        the page.

        `pointer-events-auto` because the layer itself is `pointer-events-none`
        — a full-bleed backdrop over the identity row would otherwise eat every
        tap meant for the content on top of it.
      */}
      {showControl && (
        <PhotoUpload
          target="cover"
          hasPhoto={Boolean(coverUrl)}
          photoVersion={photoVersion}
          className="pointer-events-auto absolute right-gutter top-2"
        >
          {/*
            VOLT, AND IT READS AS AN ACTION (round 14, item 3).

            It was a grey pill on `hairline-strong` over a photograph — which
            at the top of a dark banner is nearly invisible even when it IS
            where it should be. The owner reported he could not change his
            banner; the position bug was half of that, and a control he could
            not SEE was the other half.

            The accent is the product's one "you can press this" signal, and
            the whole rest of this screen is read-only. `border-2` and a tinted
            fill so it holds against a bright photograph as well as a dark one.
          */}
          <span
            data-testid="cover-upload-control"
            className="flex h-9 items-center gap-2 rounded-pill border-2 border-volt bg-ink/70 px-4 text-small font-bold text-volt"
          >
            {t.account.coverChange}
          </span>
        </PhotoUpload>
      )}
    </div>
  );
}
