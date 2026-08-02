import { csvDateStamp, csvResponse, toCsv, type CsvColumn } from "@/lib/admin/csv";
import { requireAdmin } from "@/lib/auth/requireAdmin";
import { listAllGames, type AdminGameRow } from "@/lib/admin/queries";

/**
 * `/admin/games/export` — every game, as a CSV.
 *
 * `requireAdmin()` RUNS HERE, not only in the admin layout. A route handler is
 * an HTTP endpoint reached with curl; it never renders under a layout, so
 * inheriting the gate would mean inheriting nothing. The same rule every admin
 * server action follows.
 *
 * The rows come from `listAllGames`, which the games page already uses — so the
 * export is the page's data rather than a second query that could disagree with
 * it about how many spots are taken.
 *
 * Columns are DECLARED rather than inferred from the row object: inference
 * makes the file's shape whatever the query happened to select, so adding a
 * column to a `select` silently changes a file somebody reconciles against.
 */
export const dynamic = "force-dynamic";

const COLUMNS: CsvColumn<AdminGameRow>[] = [
  { header: "id", value: (g) => g.id },
  { header: "starts_at_utc", value: (g) => g.starts_at },
  { header: "venue", value: (g) => g.venue },
  { header: "status", value: (g) => g.status },
  { header: "capacity", value: (g) => g.capacity },
  { header: "booked", value: (g) => g.activeCount },
  { header: "waitlist", value: (g) => g.waitlistCount },
  { header: "price_czk", value: (g) => g.price_czk },
  { header: "format", value: (g) => g.format },
  { header: "surface", value: (g) => g.surface },
  { header: "subs_per_team", value: (g) => g.subs_per_team },
  { header: "duration_minutes", value: (g) => g.duration_minutes },
  // An array column. Joined with a space rather than a comma so it stays one
  // readable field instead of a quoted list that looks like columns.
  {
    header: "allowed_skill_levels",
    value: (g) => (g.allowed_skill_levels ?? []).join(" "),
  },
  { header: "city", value: (g) => g.city },
  { header: "created_at_utc", value: (g) => g.created_at },
];

export async function GET() {
  await requireAdmin();
  const games = await listAllGames();
  return csvResponse(toCsv(COLUMNS, games), "games", csvDateStamp());
}
