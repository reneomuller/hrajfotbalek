/**
 * The line-icon set.
 *
 * ONE STROKE WEIGHT, ONE GRID, ONE FILE. Every glyph is drawn on a 24×24 box
 * at 1.6px, round caps and joins, `fill="none"` and `stroke="currentColor"` —
 * so an icon takes the colour of the text beside it and needs no per-site
 * decision. That uniformity is the entire point: the reference's polish is
 * mostly that its icons agree with each other, and icons collected one at a
 * time from wherever never do.
 *
 * `currentColor`, unlike the brand marks in `public/brand/`. Those are
 * somebody else's colour and carry it; these are ours and take it.
 *
 * INLINE, NOT AN ICON FONT OR A PACKAGE. A dependency for a dozen paths is a
 * dependency, a bundle and a licence; a font is a download for glyphs that are
 * already in the HTML. These are server-rendered with the markup.
 *
 * `aria-hidden` throughout. Every one of these sits beside its own label — an
 * icon announcing "calendar" before a date reads the date twice.
 */

export type IconName =
  | "calendar"
  | "clock"
  | "pin"
  | "link"
  | "arrowLeft"
  | "users"
  // The bottom tab bar (v1.2 §7).
  | "home"
  | "ticket"
  | "list"
  | "user"
  // The amenity catalog (migration 38). One entry per permitted value, and
  // widening the CHECK means widening this — an amenity with no icon renders
  // as a gap.
  | "bibs"
  | "gloves"
  | "balls"
  | "water"
  | "showers"
  | "parking"
  | "lockers"
  | "wifi"
  | "first_aid"
  | "drinks";

const PATHS: Record<IconName, React.ReactNode> = {
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2.5" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5.3l3.4 2" />
    </>
  ),
  pin: (
    <>
      <path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" />
      <circle cx="12" cy="10" r="2.6" />
    </>
  ),
  link: (
    <>
      <path d="M10 13.5a4 4 0 0 0 5.7.3l2.6-2.6a4 4 0 0 0-5.7-5.7l-1.3 1.3" />
      <path d="M14 10.5a4 4 0 0 0-5.7-.3l-2.6 2.6a4 4 0 0 0 5.7 5.7l1.3-1.3" />
    </>
  ),
  arrowLeft: <path d="M19 12H5m0 0 6-6m-6 6 6 6" />,
  home: (
    <>
      <path d="M4 10.6 12 4l8 6.6" />
      <path d="M6 9.8V19a1 1 0 0 0 1 1h3.4v-4.6h3.2V20H17a1 1 0 0 0 1-1V9.8" />
    </>
  ),
  ticket: (
    <>
      <path d="M3 8.4V6.5A1.5 1.5 0 0 1 4.5 5h15A1.5 1.5 0 0 1 21 6.5v1.9a2.6 2.6 0 0 0 0 7.2v1.9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5v-1.9a2.6 2.6 0 0 0 0-7.2z" />
      <path d="M14 8.6v1.2M14 13.8V15" />
    </>
  ),
  list: (
    <>
      <path d="M9 6.5h11M9 12h11M9 17.5h11" />
      <path d="m3.6 6.4 1 1 1.8-2M3.6 11.9l1 1 1.8-2M3.6 17.4l1 1 1.8-2" />
    </>
  ),
  user: (
    <>
      <circle cx="12" cy="8" r="3.6" />
      <path d="M4.8 20a7.2 7.2 0 0 1 14.4 0" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.4 3.4 0 0 1 0 5.6M17.5 14.4A6.5 6.5 0 0 1 21.5 20" />
    </>
  ),

  // --- provided by the organizer -------------------------------------------
  bibs: (
    <>
      <path d="M8.5 3.5 5 5.5 3.5 9l2.5 1v10h12V10l2.5-1L19 5.5l-3.5-2" />
      <path d="M8.5 3.5a3.5 3.5 0 0 0 7 0" />
    </>
  ),
  gloves: (
    <>
      <path d="M7 21v-5.5L5.2 13a2 2 0 0 1 3-2.6l.8.8V5a1.6 1.6 0 0 1 3.2 0v3.6" />
      <path d="M12.2 8.6V4.4a1.6 1.6 0 0 1 3.2 0v4.6M15.4 9.2V6.6a1.6 1.6 0 0 1 3.2 0V15a6 6 0 0 1-1.4 3.9L16 21" />
    </>
  ),
  balls: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="m12 7.4 3.6 2.6-1.4 4.2H9.8L8.4 10z" />
      <path d="M12 3.2V7.4M20.6 10.2 15.6 10M18 19.4l-3.8-5.2M6 19.4l3.8-5.2M3.4 10.2l5-0.2" />
    </>
  ),
  water: <path d="M12 3.2s6 6.4 6 10.2a6 6 0 0 1-12 0c0-3.8 6-10.2 6-10.2z" />,
  drinks: (
    <>
      <path d="M6 8h11a3 3 0 0 1 0 6h-.4" />
      <path d="M6 8v7a5 5 0 0 0 5 5h.6a5 5 0 0 0 5-5V8" />
      <path d="M8.5 2.5v2.6M12 2.5v2.6" />
    </>
  ),

  // --- the pitch's own ------------------------------------------------------
  showers: (
    <>
      <path d="M4 20V7a3 3 0 0 1 6 0v1" />
      <path d="M10 8h9.5a1 1 0 0 1 .9 1.4L19 13H11.5z" />
      <path d="M13 17v1.5M16 16v1.5M10.5 16.5V18" />
    </>
  ),
  parking: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="4" />
      <path d="M9.5 17V7.5h3.2a2.9 2.9 0 0 1 0 5.8H9.5" />
    </>
  ),
  lockers: (
    <>
      <rect x="4" y="10.5" width="16" height="10.5" rx="2.5" />
      <path d="M8 10.5V7.6a4 4 0 0 1 8 0v2.9" />
    </>
  ),
  wifi: (
    <>
      <path d="M2.8 9.2a14 14 0 0 1 18.4 0" />
      <path d="M6 12.6a9.4 9.4 0 0 1 12 0" />
      <path d="M9.2 16a4.8 4.8 0 0 1 5.6 0" />
      <path d="M12 19.4h.01" />
    </>
  ),
  first_aid: (
    <>
      <rect x="2.8" y="6" width="18.4" height="13" rx="3" />
      <path d="M12 10v5M9.5 12.5h5" />
      <path d="M8.6 6V4.8a1.8 1.8 0 0 1 1.8-1.8h3.2a1.8 1.8 0 0 1 1.8 1.8V6" />
    </>
  ),
};

export function Icon({
  name,
  className = "h-4 w-4",
}: {
  name: IconName;
  className?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className={`shrink-0 ${className}`}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      {PATHS[name]}
    </svg>
  );
}
