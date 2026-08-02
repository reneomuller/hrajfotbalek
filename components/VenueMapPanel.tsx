import Image from "next/image";
import { getStrings } from "@/lib/i18n/server";
import { venuePhotoUrl } from "@/lib/storage/avatar";
import type { Database } from "@/lib/types/database";

type VenueRow = Database["public"]["Tables"]["venues"]["Row"];

export interface VenueMapPanelProps {
  venue: string;
  /** The venue row, when the game is linked to one. */
  venueRow: Pick<VenueRow, "image_path" | "map_query"> | null;
  /** Panel height — the landing card and the game page size it differently. */
  className?: string;
}

/**
 * The venue panel: a real photograph of the pitch when there is one, and the
 * name plus an "Open map" button when there is not (§5.4, REQ-GAME-012/013).
 *
 * NO EMPTY FRAME. This is the part that changed in Phase 16. The panel used to
 * render its traced-map furniture — vignette, pulsing pin, chips — whether or
 * not a photo existed, so a venue without one got a 220px box of decoration
 * that looked like an image still loading. A venue with no photo now renders
 * the name and the map button and nothing else: a compact bar, not a frame
 * around an absence.
 *
 * THE TRACED-MAP ASSETS STAY IN THE REPO, UNUSED (REQ-GAME-012). They are not
 * deleted, because deleting them is a decision about art rather than about
 * this phase, and the panel that drew them is one revert away.
 *
 * NO MAP API. The image is a committed asset under `public/venues/`, chosen by
 * the organizer when they add the venue. A real map service would mean a key,
 * a bill, a per-render request and a third party learning which pitches this
 * app cares about — for a photo that changes maybe twice a year.
 *
 * `image_path` reaches an `<img src>`, so it is constrained where it is stored
 * (`venues_image_path_format` admits only `/venues/<file>.<ext>`) rather than
 * sanitised here. A value that is not a local venue asset cannot be in the
 * column to begin with; the guard below is the second line, not the first.
 *
 * ESCAPING: `venue` and `map_query` are free text. The label interpolates
 * `venue` as a JSX child (React escapes it) and the maps URL runs the query
 * through `encodeURIComponent`.
 */
export async function VenueMapPanel({ venue, venueRow, className }: VenueMapPanelProps) {
  const t = await getStrings();
  // Two shapes, one reader: a committed repo asset or a bucket key. See
  // `venuePhotoUrl` — the leading slash is what tells them apart.
  const image = venuePhotoUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL ?? "",
    venueRow?.image_path,
  );
  const isRemote = image !== null && !image.startsWith("/");

  const mapQuery = encodeURIComponent(venueRow?.map_query || venue);
  const mapHref = `https://maps.google.com/?q=${mapQuery}`;

  // --- no photo: name + button, and no frame around the absence -------------
  if (!image) {
    return (
      <div
        data-testid="venue-panel-no-photo"
        className="flex flex-wrap items-center justify-between gap-3 bg-surface-card px-4 py-3"
      >
        <span className="font-mono text-[12px] tracking-[1px] text-bone">◴ {venue}</span>
        <a
          href={mapHref}
          target="_blank"
          rel="noopener noreferrer"
          data-testid="venue-open-map"
          className="rounded-[7px] border border-hairline-volt-strong px-[9px] py-[6px] font-mono text-[9px] tracking-[1px] text-volt no-underline"
        >
          {t.games.openMap}
        </a>
      </div>
    );
  }

  // --- the photograph -------------------------------------------------------
  return (
    <div
      data-testid="venue-panel-photo"
      className={`relative overflow-hidden bg-surface ${className ?? "h-[200px]"}`}
    >
      {/*
        A committed asset goes through next/image, which can optimise a file it
        can see on disk. A bucket object does not: the optimizer would need a
        remote-pattern allow-list per Supabase project and would bill a
        transform per venue per size, to resize a photograph that is already
        the right shape because an admin uploaded it for this panel.
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
          sizes="(max-width: 768px) 100vw, 480px"
          className="object-cover object-center"
        />
      )}
      {/* Keeps the chips legible over whatever the photograph happens to be
          bright in — a real pitch photo has sky in it. */}
      <div className="absolute inset-0 bg-map-vignette" />

      <div className="absolute bottom-3 left-[14px] rounded-[7px] border border-hairline-strong bg-surface-overlay px-[10px] py-[6px] font-mono text-[10px] tracking-[1px] text-bone">
        ◴ {venue}
      </div>

      <a
        href={mapHref}
        target="_blank"
        rel="noopener noreferrer"
        data-testid="venue-open-map"
        className="absolute right-[14px] top-[14px] rounded-[7px] border border-hairline-volt-strong bg-surface-overlay px-[9px] py-[6px] font-mono text-[9px] tracking-[1px] text-volt no-underline"
      >
        {t.games.openMap}
      </a>
    </div>
  );
}
