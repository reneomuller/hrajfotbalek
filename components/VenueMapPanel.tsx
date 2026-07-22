import Image from "next/image";
import { strings } from "@/lib/strings";
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
 * The venue panel: a human-supplied photo when there is one, the frame and pin
 * when there is not, and an "open map" link either way.
 *
 * NO MAP API. The image is a committed asset under `public/venues/`, chosen by
 * the organizer when they add the venue. That is a deliberate trade: a real map
 * service would mean a key, a bill, a per-render request and a third party
 * learning which pitches this app cares about — for a photo that changes maybe
 * twice a year.
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
export function VenueMapPanel({ venue, venueRow, className }: VenueMapPanelProps) {
  const image =
    venueRow?.image_path && venueRow.image_path.startsWith("/venues/")
      ? venueRow.image_path
      : null;

  const mapQuery = encodeURIComponent(venueRow?.map_query || venue);

  return (
    <div className={`relative overflow-hidden bg-surface ${className ?? "h-[200px]"}`}>
      {image && (
        <Image
          src={image}
          alt={strings.games.mapAlt}
          fill
          sizes="(max-width: 768px) 100vw, 480px"
          className="object-cover object-center"
        />
      )}
      <div className="absolute inset-0 bg-map-vignette" />

      {/* Pin — pulsing ring, teardrop, hole. */}
      <div className="absolute left-1/2 top-[67%] h-12 w-12 -translate-x-1/2 -translate-y-1/2">
        <span className="absolute inset-0 animate-pulseRing rounded-full border-[1.5px] border-volt" />
        <span className="absolute left-1/2 top-1/2 h-6 w-6 -translate-x-1/2 -translate-y-[58%] rotate-45 rounded-[50%_50%_50%_0] bg-volt shadow-volt-glow-lg" />
        <span className="absolute left-1/2 top-[42%] z-[2] h-2 w-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-surface" />
      </div>

      <div className="absolute bottom-3 left-[14px] rounded-[7px] border border-hairline-strong bg-surface-overlay px-[10px] py-[6px] font-mono text-[10px] tracking-[1px] text-bone">
        ◴ {venue}
      </div>

      {/*
        The fallback that survives having no photo: whatever else is true, the
        player can still find the pitch.
      */}
      <a
        href={`https://maps.google.com/?q=${mapQuery}`}
        target="_blank"
        rel="noopener noreferrer"
        className="absolute right-[14px] top-[14px] rounded-[7px] border border-hairline-volt-strong bg-surface-overlay px-[9px] py-[6px] font-mono text-[9px] tracking-[1px] text-volt no-underline"
      >
        {strings.games.openMap}
      </a>
    </div>
  );
}
