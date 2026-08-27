import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getStrings } from "@/lib/i18n/server";
import { venuePhotoUrl } from "@/lib/storage/avatar";
import type { Database } from "@/lib/types/database";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

/**
 * The game page's header band — back, venue, and the pitch behind both.
 *
 * REBUILT IN REDESIGN v2 ROUND 4, from `p03` and ruling R6(b).
 *
 * WHAT IT WAS: two entirely different headers. A venue WITH a photograph got a
 * 280px full-bleed hero with the name laid over the bottom of the image; a
 * venue without one got a compact text header — back button on its own row,
 * then the name beneath it. Two layouts meant the same page opened differently
 * depending on a column most venues leave null, and the tall one pushed the
 * first fact about the game (when it is) below the fold.
 *
 * WHAT IT IS: ONE band, the same for every game. `p03` draws the back circle
 * and the venue title on a single row, about 75px tall, with the first content
 * box immediately under it — so "when is it" is the second thing on the page
 * instead of the fifth.
 *
 * R6(b), AND IT IS THE HALF THAT NEEDED A RULING. The photograph backs the
 * band and fades out VERTICALLY: clearly present behind the title, fully gone
 * before the band ends, so the box beneath sits on the flat surface with no
 * seam. The final stop is `ink` at full opacity — the page's own ground —
 * which is what makes the join invisible rather than merely subtle. p03 itself
 * draws a flat black band; the photo is the owner's ruling and wins, and this
 * divergence from the frame is recorded rather than silently resolved.
 *
 * WHICH PHOTOGRAPH, and this is the one decision R6 does not settle outright.
 * R6 says one DEFAULT image for all games and that `venues.image_path` is not
 * touched — meaning per-venue photos are not to be BUILT, not that the ones
 * already working are to be deleted. So: the venue's own photograph when it
 * has one, the R6 default otherwise. `data-photo` keeps its old meaning —
 * "this venue has a picture of its own" — and the band is never empty.
 *
 * THE BACK BUTTON IS A CIRCLE OVER THE IMAGE, which is the one piece of
 * furniture that has to work against an unknown photograph — hence the opaque
 * surface fill and the border, rather than a bare glyph that disappears
 * against a bright sky.
 *
 * ESCAPING: `venue` and the address are admin-supplied free text interpolated
 * as JSX children, which React escapes. `image_path` reaches an `<img src>` and
 * is constrained where it is STORED (`venues_image_path_format`), not here.
 */

/** R6's single default, the same file the list card carries. */
const DEFAULT_PITCH = "/pitch-default.jpg";

export async function GameHero({
  venue,
  venueRow,
  supabaseUrl,
}: {
  venue: string;
  venueRow: Pick<VenueRow, "image_path" | "map_query" | "name"> | null;
  supabaseUrl: string;
}) {
  const t = await getStrings();

  // Two shapes, one reader: a committed repo asset or a bucket key. The leading
  // slash is what tells them apart — see `venuePhotoUrl`.
  const ownPhoto = venuePhotoUrl(supabaseUrl, venueRow?.image_path);
  const image = ownPhoto ?? DEFAULT_PITCH;
  const isRemote = !image.startsWith("/");

  /*
   * `map_query` AS THE ADDRESS LINE. It is what the organizer typed to make the
   * pitch findable on a map, which in practice is its address — and it is the
   * only address-shaped thing the schema holds. Rendered only when it differs
   * from the name, because a venue whose map query IS its name would otherwise
   * print the same words twice at two sizes.
   */
  const address =
    venueRow?.map_query && venueRow.map_query.trim() !== venue.trim()
      ? venueRow.map_query
      : null;

  return (
    <header
      data-testid="game-hero"
      data-photo={ownPhoto ? "true" : "false"}
      /*
        `-mx-gutter` cancels the page gutter so the photograph reaches both
        edges, and `px-gutter` puts it back for the contents.
        
        THE BAND IS 176px, NOT 140 (round 8, item 4) — and the arithmetic is
        the defect. The band starts at y=0, under the fixed header, which is
        59px tall and opaque enough to hide what is behind it. At 140 that left
        81px of visible photograph, and the scrim — which ramps across the
        WHOLE box including the hidden part — was already at half strength by
        the time the band emerged. The result read as a sliver of image pinched
        between the header and the title, which is what it was.

        ~~`pt-28` puts the title row 112px down: 53px of clear photograph below
        the header before any text.~~ `pt-36` — 144px, so 85px clear (round 18,
        item 7).

        THE OWNER READ THE OLD BAND AS "cropped too aggressively at the top",
        and both halves of that are true at once. `object-center` on a
        landscape photograph in a 2.2:1 box throws away the top and the bottom
        equally — and the top of a pitch photograph is where the horizon, the
        tree line and the sky are, which is everything that makes it a PLACE
        rather than a green texture. 53px of it was not enough to tell.

        TWO LEVERS, BOTH MOVED, because either alone falls short: shifting the
        crop up in a 53px band shows a different sliver rather than a scene,
        and a taller band still centred keeps discarding the horizon. Four
        variants were rendered and compared side by side before this pair was
        picked — see the report.

        `object-[50%_30%]` RATHER THAN `object-top`. Venue photographs are not
        all the same shape, and pinning the extreme top edge gives a portrait
        source nothing but sky. Thirty percent is the upper third, which is
        where the horizon sits in an ordinary landscape frame and where the
        composition rule of thirds puts it deliberately.

        THE COST IS 32px OF FOLD, spent knowingly. The detail's fold ruling
        wants the fact card started above it, and at 144px it still is.

        The scrim's stops move with the band — see below.
      */
      className="relative -mx-gutter overflow-hidden px-gutter pb-5 pt-36"
    >
      {/*
        THE BAND'S BACKGROUND, and it is `aria-hidden` scenery: the alt text
        would announce a stock pitch on every game page, which is noise on the
        one surface where a screen-reader user is trying to find a time and a
        price.
      */}
      <span aria-hidden className="pointer-events-none absolute inset-0">
        {isRemote ? (
          // A bucket object does not go through next/image: the optimizer would
          // need a remote-pattern allow-list per Supabase project and would
          // bill a transform per venue per size.
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt=""
            data-testid="hero-photo"
            className="h-full w-full object-cover object-[50%_30%]"
          />
        ) : (
          <Image
            src={image}
            alt=""
            data-testid="hero-photo"
            fill
            priority
            sizes="(max-width: 980px) 100vw, 980px"
            className="object-cover object-[50%_30%]"
          />
        )}

        {/*
          R6(b)'s FADE, IN ONE GRADIENT.

          It starts at half strength so the pitch is visibly there behind the
          title — R6 calls for the photograph to read as a photograph, and the
          round-2 lesson on the card was that a uniform wash turns it into a
          dark slab with texture.

          IT ENDS AT `ink`, FULL OPACITY, AT 90% OF THE BAND. Two things follow
          from that and both are the ruling: the last tenth of the band is flat
          page ground, so the fade completes ABOVE the first content box rather
          than at its edge; and the final colour is the page's own background,
          so there is no seam to see. A `to-ink/[.95]` here would leave a
          hairline of photograph along the join that reads as a rendering
          artefact.
        */}
        {/*
          THE STOPS ARE MEASURED AGAINST THE VISIBLE BAND, not the box.

          The box starts at y=0 and the header covers its first 59px — about a
          third of it. A ramp beginning at `.55` therefore began underneath the
          header and reached the eye already dark, which is half of why the
          photograph did not read. It now starts near-clear, holds through the
          third of the band that is actually on screen above the title, and
          only then climbs.

          It still ends at `ink` at FULL opacity before the band does, which is
          R6(b) unchanged: the first content box sits on flat page ground with
          no seam.

          `to-92%` -> `to-90%` (R19, round 8). 92 is not on Tailwind's stop
          scale, so it generated nothing and R6(b)'s "fully faded ABOVE the
          first box" was quietly not happening — the fade reached ink at the
          band's very edge instead. Rendered proof, not reasoning: the computed
          gradient carried no stop positions at all.
        */}
        <span
          data-testid="hero-scrim"
          className="absolute inset-0 bg-gradient-to-b from-ink/[.30] via-ink/[.55] via-55% to-ink to-90%"
        />
      </span>

      {/*
        BACK AND TITLE ON ONE ROW (p03). They were stacked, which spent a whole
        row on a 44px circle.

        `min-w-0` on the heading so a long venue name shortens instead of
        pushing the circle off the left edge — the flex default would let the
        text win.
      */}
      <div className="relative flex items-center gap-3">
        <Link
          href="/games"
          data-testid="game-back"
          aria-label={t.games.backToGames}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-pill border border-hairline-strong bg-surface-overlay text-bone no-underline transition hover:border-hairline-volt"
        >
          <Icon name="arrowLeft" className="h-5 w-5" />
        </Link>

        <h1 className="m-0 min-w-0 font-display text-page-title uppercase leading-none tracking-wide text-white">
          {venue}
        </h1>
      </div>

      {address && (
        <p
          data-testid="game-hero-address"
          className="relative mt-2 text-[14px] leading-snug text-bone"
        >
          {address}
        </p>
      )}
    </header>
  );
}
