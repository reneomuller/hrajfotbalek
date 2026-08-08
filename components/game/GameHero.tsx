import Image from "next/image";
import Link from "next/link";
import { Icon } from "@/components/Icon";
import { getStrings } from "@/lib/i18n/server";
import { venuePhotoUrl } from "@/lib/storage/avatar";
import type { Database } from "@/lib/types/database";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

/**
 * The game page's hero: the pitch, full-bleed, with the venue over it.
 *
 * FULL-BLEED IS THE POINT (v1.2 §5.4). The photograph used to sit in a 220px
 * rounded box a third of the way down the page, below a heading, a chip row and
 * a price — so the first thing a player saw after tapping a WhatsApp link was
 * text, and the picture of the place they were deciding whether to travel to
 * was a thumbnail. It is now the first thing, edge to edge, with the name and
 * the address on top of it.
 *
 * NO PHOTO IS A FIRST-CLASS STATE, not a broken one. Most venues have no
 * photograph and the honest rendering is a compact header — name, address, back
 * button — rather than a grey rectangle of the same height pretending an image
 * is loading. That was the Phase 16 ruling about the old panel and it survives
 * the rebuild: no empty frame.
 *
 * THE BACK BUTTON IS A CIRCLE OVER THE IMAGE, which is the one piece of
 * furniture that has to work against an unknown photograph — hence the opaque
 * surface fill and the border, rather than a bare glyph that disappears against
 * a bright sky.
 *
 * ESCAPING: `venue` and the address are admin-supplied free text interpolated
 * as JSX children, which React escapes. `image_path` reaches an `<img src>` and
 * is constrained where it is STORED (`venues_image_path_format`), not here.
 */
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
  const image = venuePhotoUrl(supabaseUrl, venueRow?.image_path);
  const isRemote = image !== null && !image.startsWith("/");

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

  const back = (
    <Link
      href="/games"
      data-testid="game-back"
      aria-label={t.games.backToGames}
      className="flex h-11 w-11 items-center justify-center rounded-full border border-hairline-strong bg-surface-overlay text-bone no-underline transition hover:border-hairline-volt"
    >
      <Icon name="arrowLeft" className="h-5 w-5" />
    </Link>
  );

  // --- no photograph: a compact header, not a frame around an absence -------
  if (!image) {
    return (
      <header data-testid="game-hero" data-photo="false" className="pt-24">
        {back}
        <h1 className="mt-4 font-display text-section-title uppercase leading-none tracking-wide text-white">
          {venue}
        </h1>
        {address && (
          <p data-testid="game-hero-address" className="mt-2 text-[14px] leading-snug text-muted">
            {address}
          </p>
        )}
      </header>
    );
  }

  // --- the photograph --------------------------------------------------------
  return (
    <header
      data-testid="game-hero"
      data-photo="true"
      /*
        `-mx-gutter` cancels the page gutter so the image reaches both edges,
        and the negative top margin pulls it under the fixed header — the photo
        starts at the top of the viewport, which is what "full-bleed" means on
        a phone. The gradient below is what keeps the header legible over it.
      */
      className="relative -mx-gutter -mt-[1px] overflow-hidden"
    >
      <div className="relative h-[280px] w-full bg-surface">
        {/*
          A committed asset goes through next/image, which can optimise a file
          it can see on disk. A bucket object does not: the optimizer would need
          a remote-pattern allow-list per Supabase project and would bill a
          transform per venue per size, to resize a photograph an admin already
          uploaded for this panel.
        */}
        {isRemote ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={image}
            alt={t.games.venuePhotoAlt.replace("{venue}", venue)}
            className="absolute inset-0 h-full w-full object-cover object-center"
          />
        ) : (
          <Image
            src={image}
            alt={t.games.venuePhotoAlt.replace("{venue}", venue)}
            fill
            priority
            sizes="(max-width: 980px) 100vw, 980px"
            className="object-cover object-center"
          />
        )}

        {/*
          Two overlays doing two jobs. The top one is for the back button, which
          has to survive a bright sky; the bottom one carries the name and the
          address down into the page's black so there is no seam.
        */}
        <div className="absolute inset-x-0 top-0 h-24 bg-gradient-to-b from-ink/80 to-transparent" />
        <div className="absolute inset-x-0 bottom-0 h-3/5 bg-gradient-to-t from-ink via-ink/80 to-transparent" />

        <div className="absolute left-gutter top-[76px]">{back}</div>

        <div className="absolute inset-x-0 bottom-4 px-gutter">
          <h1 className="m-0 font-display text-section-title uppercase leading-none tracking-wide text-white">
            {venue}
          </h1>
          {address && (
            <p
              data-testid="game-hero-address"
              className="mt-[6px] text-[14px] leading-snug text-bone"
            >
              {address}
            </p>
          )}
        </div>
      </div>
    </header>
  );
}
